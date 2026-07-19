import { FaceBox, ImageMetadata, Person } from '../../../shared/types'

let baseUrl = 'http://127.0.0.1:8756'

export async function initSidecar(): Promise<string> {
  try {
    const info = await window.api.sidecarInfo()
    baseUrl = info.url
  } catch {
    /* keep default */
  }
  return baseUrl
}

export function sidecarBase(): string {
  return baseUrl
}

/**
 * Resolve the src to actually display for a media item. HEIC/HEIF can't be
 * rendered by Chromium, so those are routed through the sidecar's /image
 * transcoder; everything else uses the item's own src.
 */
export function displayImageSrc(item: { id: string; src: string; name: string }): string {
  if (/\.(heic|heif)$/i.test(item.name)) {
    return baseUrl + '/image?path=' + encodeURIComponent(item.id)
  }
  return item.src
}

async function req<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(baseUrl + path, init)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function health(): Promise<{ ok: boolean; face_recognition: boolean; vosk: boolean } | null> {
  return req('/health')
}

export async function scanFaces(
  path: string,
  force = false
): Promise<{ available: boolean; faces: FaceBox[]; cached?: boolean } | null> {
  return req('/faces/scan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, force })
  })
}

export async function listFaces(path: string): Promise<FaceBox[]> {
  const r = await req<{ faces: FaceBox[] }>('/faces/list?path=' + encodeURIComponent(path))
  return r?.faces || []
}

export async function detectFaceAt(
  path: string,
  x: number,
  y: number
): Promise<{ available: boolean; face: FaceBox | null; detected?: boolean } | null> {
  return req('/faces/detect-at', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, x, y })
  })
}

export async function listPeople(): Promise<Person[]> {
  return (await req<Person[]>('/people')) || []
}

export async function relabelFace(faceId: number, name: string): Promise<boolean> {
  const r = await req<{ ok: boolean }>('/faces/relabel', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ faceId, name })
  })
  return !!r?.ok
}

export async function deleteFace(faceId: number): Promise<boolean> {
  const r = await req<{ ok: boolean }>('/faces/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ faceId })
  })
  return !!r?.ok
}

export async function renamePerson(personId: number, name: string): Promise<boolean> {
  const r = await req<{ ok: boolean }>('/people/rename', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ personId, name })
  })
  return !!r?.ok
}

export async function getMetadata(path: string): Promise<ImageMetadata> {  const r = await req<ImageMetadata>('/metadata?path=' + encodeURIComponent(path))
  return r || { path, description: '', place: '', year: '', tags: [], people: [] }
}

export interface ExifData {
  year: string
  place: string
  dateTaken: string
  camera: string
}

export async function getExif(path: string): Promise<ExifData> {
  const r = await req<ExifData>('/exif?path=' + encodeURIComponent(path))
  return r || { year: '', place: '', dateTaken: '', camera: '' }
}

export async function setMetadata(meta: ImageMetadata): Promise<boolean> {
  const r = await req<{ ok: boolean }>('/metadata', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(meta)
  })
  return !!r?.ok
}

/**
 * Search the metadata/face database for images matching tags, date/year and/or
 * person names. `q` is a free-text OR-match across all fields; `person`, `year`
 * and `tag` add ANDed constraints. Returns the matching image paths (which are
 * the MediaItem `id`s for local/http items).
 */
export async function searchMedia(params: {
  q?: string
  person?: string
  year?: string
  tag?: string
}): Promise<string[]> {
  const qs = new URLSearchParams()
  if (params.q) qs.set('q', params.q)
  if (params.person) qs.set('person', params.person)
  if (params.year) qs.set('year', params.year)
  if (params.tag) qs.set('tag', params.tag)
  const r = await req<{ paths: string[] }>('/search?' + qs.toString())
  return r?.paths || []
}
