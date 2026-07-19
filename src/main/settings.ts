import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { AppSettings, DEFAULT_SETTINGS } from '../shared/types'

let settingsPath = ''

function getPath(): string {
  if (!settingsPath) settingsPath = join(app.getPath('userData'), 'settings.json')
  return settingsPath
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(getPath(), 'utf-8')
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  const merged = { ...DEFAULT_SETTINGS, ...settings }
  await fs.writeFile(getPath(), JSON.stringify(merged, null, 2), 'utf-8')
  return merged
}
