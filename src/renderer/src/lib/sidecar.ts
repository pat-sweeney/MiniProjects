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

export async function renamePerson(personId: number, name: string): Promise<boolean> {
  const r = await req<{ ok: boolean }>('/people/rename', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ personId, name })
  })
  return !!r?.ok
}

export async function getMetadata(path: string): Promise<ImageMetadata> {  const r = await req<ImageMetadata>('/metadata?path=' + encodeURIComponent(path))
  return r || { path, description: '', place: '', year: '', tags: [] }
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
