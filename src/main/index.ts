import { app, BrowserWindow, ipcMain, protocol, net, dialog, shell } from 'electron'
import { join } from 'path'
import { createReadStream, promises as fs } from 'fs'
import { Readable } from 'stream'
import { pathToFileURL } from 'url'
import { AppSettings, FilenameContext } from '../shared/types'
import { loadSettings, saveSettings } from './settings'
import { scanAll, renameLocalFile } from './fileScanner'
import { parseInstruction, ollamaHealth, suggestFilename } from './ollama'
import { startSidecar, getSidecarPort, stopSidecar } from './pythonBridge'
import { initAutoUpdater } from './updater'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true
    }
  }
])

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0b0b0f',
    show: false,
    autoHideMenuBar: true,
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      // Allow the renderer to reach the localhost python sidecar + ollama.
      webSecurity: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Serve local media files via app://media/<encoded-abs-path> with Range support. */
function registerMediaProtocol(): void {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url)
    // app://media/<encoded path>
    if (url.hostname !== 'media') {
      return new Response('Not found', { status: 404 })
    }
    const filePath = decodeURIComponent(url.pathname.replace(/^\//, ''))
    try {
      const stat = await fs.stat(filePath)
      const range = request.headers.get('Range')
      const type = mimeFor(filePath)
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range)
        let start = m && m[1] ? parseInt(m[1], 10) : 0
        let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1
        if (isNaN(start)) start = 0
        if (isNaN(end) || end >= stat.size) end = stat.size - 1
        const chunk = createReadStream(filePath, { start, end })
        return new Response(Readable.toWeb(chunk) as any, {
          status: 206,
          headers: {
            'Content-Type': type,
            'Content-Length': String(end - start + 1),
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes'
          }
        })
      }
      // No range: stream whole file (still advertise range support).
      return await net.fetch(pathToFileURL(filePath).toString(), {
        headers: { 'Content-Type': type }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

function mimeFor(p: string): string {
  const ext = p.toLowerCase().split('.').pop() || ''
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
    avif: 'image/avif', heic: 'image/heic',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
    avi: 'video/x-msvideo', m4v: 'video/mp4', ogv: 'video/ogg', mpg: 'video/mpeg',
    mpeg: 'video/mpeg'
  }
  return map[ext] || 'application/octet-stream'
}

function registerIpc(): void {
  ipcMain.handle('settings:get', async () => loadSettings())
  ipcMain.handle('settings:set', async (_e, s: AppSettings) => saveSettings(s))

  ipcMain.handle('media:scan', async (_e, localFolder: string, httpFolder: string) => {
    return scanAll(localFolder, httpFolder)
  })

  ipcMain.handle('dialog:pickFolder', async () => {
    const res = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] })
    if (res.canceled || res.filePaths.length === 0) return ''
    return res.filePaths[0]
  })

  ipcMain.handle(
    'llm:parse',
    async (_e, ollamaUrl: string, model: string, text: string) => {
      return parseInstruction(ollamaUrl, model, text)
    }
  )

  ipcMain.handle('llm:health', async (_e, ollamaUrl: string) => ollamaHealth(ollamaUrl))

  ipcMain.handle(
    'llm:suggestName',
    async (_e, ollamaUrl: string, model: string, ctx: FilenameContext) =>
      suggestFilename(ollamaUrl, model, ctx)
  )

  ipcMain.handle('file:rename', async (_e, oldPath: string, newBaseName: string) =>
    renameLocalFile(oldPath, newBaseName)
  )

  ipcMain.handle('file:delete', async (_e, filePath: string) => {
    // Prefer the OS trash/recycle bin so deletes are recoverable. Network/NAS
    // drives (e.g. a mapped Y:) often don't support the Recycle Bin, so fall
    // back to a permanent delete and tell the renderer which happened.
    try {
      await shell.trashItem(filePath)
      return { ok: true, trashed: true }
    } catch {
      try {
        let lastErr: any
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            await fs.unlink(filePath)
            return { ok: true, trashed: false }
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
  })

  ipcMain.handle('sidecar:info', async () => ({
    port: getSidecarPort(),
    url: `http://127.0.0.1:${getSidecarPort()}`
  }))
}

app.whenReady().then(async () => {
  registerMediaProtocol()
  registerIpc()
  createWindow()
  initAutoUpdater(() => mainWindow)

  // Fire and forget: sidecar startup can take a while (loading dlib models).
  startSidecar(8756)
    .then((ok) => console.log('[sidecar] ready:', ok))
    .catch((e) => console.warn('[sidecar] failed:', e))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopSidecar()
  if (process.platform !== 'darwin') app.quit()
})
