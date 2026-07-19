import { promises as fs } from 'fs'
import { join, extname, relative, posix, dirname } from 'path'
import { pathToFileURL } from 'url'
import { MediaItem, MediaKind, RenameResult } from '../shared/types'

const IMAGE_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.heic', '.avif'
])
const VIDEO_EXT = new Set([
  '.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.ogv', '.mpg', '.mpeg'
])

function kindForExt(ext: string): MediaKind | null {
  const e = ext.toLowerCase()
  if (IMAGE_EXT.has(e)) return 'image'
  if (VIDEO_EXT.has(e)) return 'video'
  return null
}

/**
 * Recursively scan a local folder (including all subdirectories) for media.
 * The returned `src` uses the app:// protocol so the renderer can stream it.
 */
export async function scanLocalFolder(root: string): Promise<MediaItem[]> {
  const items: MediaItem[] = []
  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile()) {
        const kind = kindForExt(extname(entry.name))
        if (!kind) continue
        items.push({
          id: full,
          // Serve through custom protocol so range requests / video work.
          src: 'app://media/' + encodeURIComponent(full),
          source: 'local',
          kind,
          name: entry.name,
          relPath: relative(root, full).split('\\').join('/')
        })
      }
    }
  }
  await walk(root)
  return items
}

/** Extract href targets from a simple directory-listing HTML page. */
function parseLinks(html: string): string[] {
  const links: string[] = []
  const re = /href\s*=\s*["']([^"']+)["']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    links.push(m[1])
  }
  return links
}

function joinUrl(base: string, href: string): string {
  return new URL(href, base).toString()
}

/**
 * Recursively scan an HTTP(S) directory-listing URL (e.g. a NAS web share or
 * an Apache/nginx autoindex) for media, following subdirectory links.
 */
export async function scanHttpFolder(rootUrl: string): Promise<MediaItem[]> {
  const items: MediaItem[] = []
  const visited = new Set<string>()
  const base = rootUrl.endsWith('/') ? rootUrl : rootUrl + '/'

  async function walk(url: string, depth: number): Promise<void> {
    if (depth > 12 || visited.has(url)) return
    visited.add(url)
    let html: string
    try {
      const res = await fetch(url, { redirect: 'follow' })
      const ct = res.headers.get('content-type') || ''
      if (!ct.includes('text/html')) return
      html = await res.text()
    } catch {
      return
    }
    for (const href of parseLinks(html)) {
      if (!href || href.startsWith('?') || href.startsWith('#')) continue
      if (href.startsWith('../') || href === '../' || href === './') continue
      let abs: string
      try {
        abs = joinUrl(url, href)
      } catch {
        continue
      }
      // Only stay within the root tree.
      if (!abs.startsWith(base)) continue
      if (abs.endsWith('/')) {
        await walk(abs, depth + 1)
      } else {
        const clean = abs.split('?')[0]
        const kind = kindForExt(extname(new URL(clean).pathname))
        if (!kind) continue
        const name = decodeURIComponent(posix.basename(new URL(clean).pathname))
        items.push({
          id: abs,
          src: abs,
          source: 'http',
          kind,
          name,
          relPath: decodeURIComponent(abs.slice(base.length))
        })
      }
    }
  }

  await walk(base, 0)
  return items
}

/** Scan both configured sources and merge results. */
export async function scanAll(
  localFolder: string,
  httpFolder: string
): Promise<MediaItem[]> {
  const results: MediaItem[] = []
  if (localFolder && localFolder.trim()) {
    results.push(...(await scanLocalFolder(localFolder.trim())))
  }
  if (httpFolder && httpFolder.trim()) {
    results.push(...(await scanHttpFolder(httpFolder.trim())))
  }
  return results
}

export { pathToFileURL }

/**
 * Rename a local media file on disk, keeping its original extension and
 * directory. `newBaseName` is a user/LLM supplied name (with or without an
 * extension). Returns the updated identity fields for the MediaItem.
 */
export async function renameLocalFile(
  oldPath: string,
  newBaseName: string
): Promise<RenameResult> {
  const ext = extname(oldPath)
  const dir = dirname(oldPath)

  // Strip path separators and characters that are invalid in file names.
  let base = (newBaseName || '')
    .replace(/[\\/]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"|?*\u0000-\u001f]/g, '')
    .trim()
    .replace(/[. ]+$/g, '') // Windows disallows trailing dots/spaces

  // If the user typed the extension too, don't double it up.
  if (ext && base.toLowerCase().endsWith(ext.toLowerCase())) {
    base = base.slice(0, base.length - ext.length).trim()
  }
  if (!base) return { ok: false, error: 'Please enter a valid file name' }

  const newName = base + ext
  const newPath = join(dir, newName)
  if (newPath === oldPath) return { ok: false, error: 'Name unchanged' }

  try {
    // Refuse to clobber an existing different file (case-insensitive rename of
    // the same file is still allowed on case-insensitive filesystems).
    if (newPath.toLowerCase() !== oldPath.toLowerCase()) {
      try {
        await fs.access(newPath)
        return { ok: false, error: 'A file with that name already exists' }
      } catch {
        /* target does not exist — good */
      }
    }
    // Retry briefly: on Windows a transient lock (thumbnailer, antivirus, an
    // image decoder that just read the file) can make rename fail with
    // EPERM/EBUSY for a few hundred milliseconds.
    let lastErr: any
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await fs.rename(oldPath, newPath)
        return {
          ok: true,
          id: newPath,
          src: 'app://media/' + encodeURIComponent(newPath),
          name: newName
        }
      } catch (e: any) {
        lastErr = e
        if (e?.code !== 'EPERM' && e?.code !== 'EBUSY' && e?.code !== 'EACCES') throw e
        await new Promise((r) => setTimeout(r, 150))
      }
    }
    throw lastErr
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) }
  }
}
