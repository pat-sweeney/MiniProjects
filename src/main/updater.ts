import { app, BrowserWindow, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'

let initialized = false

/**
 * Wire up electron-updater. No-op during development (updates only make sense
 * for a packaged, code-signed build published to a release feed).
 */
export function initAutoUpdater(getWindow: () => BrowserWindow | null): void {
  if (initialized) return
  initialized = true

  if (!app.isPackaged) {
    console.log('[updater] skipped (not packaged)')
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  const send = (channel: string, payload?: unknown): void => {
    getWindow()?.webContents.send(channel, payload)
  }

  autoUpdater.on('checking-for-update', () => send('update:checking'))
  autoUpdater.on('update-available', (info) => send('update:available', info))
  autoUpdater.on('update-not-available', () => send('update:none'))
  autoUpdater.on('error', (err) =>
    send('update:error', String(err?.message ?? err))
  )
  autoUpdater.on('download-progress', (p) => send('update:progress', p))
  autoUpdater.on('update-downloaded', async (info) => {
    send('update:downloaded', info)
    const res = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Version ${info.version} has been downloaded.`,
      detail: 'Restart the app to apply the update.'
    })
    if (res.response === 0) {
      autoUpdater.quitAndInstall()
    }
  })

  autoUpdater.checkForUpdatesAndNotify().catch((e) =>
    console.warn('[updater] check failed:', e)
  )

  // Re-check every 6 hours while the app is running.
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 6 * 60 * 60 * 1000)
}
