// Shared types used across main, preload and renderer.

export type MediaKind = 'image' | 'video'

export interface MediaItem {
  /** Stable identifier: absolute local path or full http(s) url */
  id: string
  /** Local absolute path OR remote url */
  src: string
  /** 'local' | 'http' */
  source: 'local' | 'http'
  kind: MediaKind
  name: string
  /** relative path from the scanned root, for display */
  relPath: string
}

export type TransitionType =
  | 'none'
  | 'fade'
  | 'dissolve'
  | 'swipe-left'
  | 'swipe-right'
  | 'swipe-up'
  | 'swipe-down'
  | 'zoom'
  | 'flip'
  | 'random'

export interface AppSettings {
  /** Local folder path to scan (optional) */
  localFolder: string
  /** Http(s) base url pointing at a directory listing (optional) */
  httpFolder: string
  /** Seconds each image is shown */
  intervalSeconds: number
  /** Seconds of a video to play before advancing (0 = play whole clip) */
  videoSeconds: number
  transition: TransitionType
  /** ms of transition animation */
  transitionMs: number
  shuffle: boolean
  loop: boolean
  muteVideo: boolean
  faceRecognitionEnabled: boolean
  voiceEnabled: boolean
  ollamaUrl: string
  ollamaModel: string
  /** Python sidecar base url */
  sidecarUrl: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  localFolder: '',
  httpFolder: '',
  intervalSeconds: 6,
  videoSeconds: 15,
  transition: 'fade',
  transitionMs: 900,
  shuffle: false,
  loop: true,
  muteVideo: false,
  faceRecognitionEnabled: true,
  voiceEnabled: false,
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.1',
  sidecarUrl: 'http://127.0.0.1:8756'
}

export interface FaceBox {
  /** face row id in sidecar db */
  faceId: number
  personId: number
  name: string
  /** normalized 0..1 coordinates relative to image */
  top: number
  right: number
  bottom: number
  left: number
  confidence: number
}

export interface Person {
  id: number
  name: string
  faceCount: number
}

/** Context gathered about a media item, used to ask the LLM for a filename. */
export interface FilenameContext {
  currentName: string
  kind: MediaKind
  description?: string
  place?: string
  year?: string
  people?: string[]
  dateTaken?: string
  camera?: string
}

/** Result of renaming a local file on disk. */
export interface RenameResult {
  ok: boolean
  error?: string
  /** Updated identity fields when ok === true */
  id?: string
  src?: string
  name?: string
}

export interface DeleteResult {
  ok: boolean
  error?: string
}

export interface ImageMetadata {
  path: string
  description: string
  place: string
  year: string
  tags: string[]
  /** People identified in the image (render-time labels; not baked into the file) */
  people?: PersonTag[]
}

/** A named face box (normalized 0..1 coords) persisted as image metadata. */
export interface PersonTag {
  name: string
  top: number
  right: number
  bottom: number
  left: number
}

/** Result of asking the LLM to parse a natural language instruction. */
export interface ParsedIntent {
  action:
    | 'label_person'
    | 'set_metadata'
    | 'next'
    | 'previous'
    | 'pause'
    | 'play'
    | 'unknown'
  /** For label_person: the name to assign */
  name?: string
  /** For label_person: which person/face is targeted (e.g. "unknown 1", or a face index) */
  target?: string
  /** For set_metadata */
  description?: string
  place?: string
  year?: string
  tags?: string[]
  /** LLM's short explanation */
  reason?: string
}
