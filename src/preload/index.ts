import { contextBridge, ipcRenderer } from 'electron'
import { AppSettings, MediaItem, ParsedIntent } from '../shared/types'

const api = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (s: AppSettings): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:set', s),
  scanMedia: (localFolder: string, httpFolder: string): Promise<MediaItem[]> =>
    ipcRenderer.invoke('media:scan', localFolder, httpFolder),
  pickFolder: (): Promise<string> => ipcRenderer.invoke('dialog:pickFolder'),
  parseInstruction: (
    ollamaUrl: string,
    model: string,
    text: string
  ): Promise<ParsedIntent> => ipcRenderer.invoke('llm:parse', ollamaUrl, model, text),
  ollamaHealth: (ollamaUrl: string): Promise<boolean> =>
    ipcRenderer.invoke('llm:health', ollamaUrl),
  sidecarInfo: (): Promise<{ port: number; url: string }> =>
    ipcRenderer.invoke('sidecar:info'),
  onUpdateEvent: (cb: (type: string, payload?: unknown) => void): (() => void) => {
    const channels = [
      'update:checking',
      'update:available',
      'update:none',
      'update:error',
      'update:progress',
      'update:downloaded'
    ]
    const listeners = channels.map((ch) => {
      const handler = (_e: unknown, payload: unknown): void => cb(ch, payload)
      ipcRenderer.on(ch, handler)
      return { ch, handler }
    })
    return () => listeners.forEach(({ ch, handler }) => ipcRenderer.removeListener(ch, handler))
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
