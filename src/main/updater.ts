/**
 * Auto-update via electron-updater (GitHub Releases provider; configured in
 * electron-builder.yml). Behaves safely in development (autoUpdater only works
 * in a packaged, code-signed/published build) by reporting a 'dev' status
 * instead of throwing.
 *
 * Update progress/state is pushed to the renderer over the 'update:status'
 * channel so the Settings screen can show live feedback.
 */
import electronUpdater from 'electron-updater'
import { app, BrowserWindow } from 'electron'

const { autoUpdater } = electronUpdater

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'dev'; message: string }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

let lastStatus: UpdateStatus = { state: 'idle' }
let initialized = false

function broadcast(status: UpdateStatus): void {
  lastStatus = status
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('update:status', status)
  }
}

export function getLastStatus(): UpdateStatus {
  return lastStatus
}

export function initUpdater(): void {
  if (initialized) return
  initialized = true

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => broadcast({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => broadcast({ state: 'available', version: info.version }))
  autoUpdater.on('update-not-available', (info) => broadcast({ state: 'not-available', version: info.version }))
  autoUpdater.on('download-progress', (p) =>
    broadcast({ state: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) => broadcast({ state: 'downloaded', version: info.version }))
  autoUpdater.on('error', (err) =>
    broadcast({ state: 'error', message: err instanceof Error ? err.message : 'Update error' })
  )
}

export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) {
    broadcast({ state: 'dev', message: 'Auto-update runs only in the packaged (published) app.' })
    return
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    broadcast({ state: 'error', message: err instanceof Error ? err.message : 'Update check failed.' })
  }
}

export function quitAndInstall(): void {
  if (!app.isPackaged) return
  // false, true = don't force-run silently, but restart the app after install.
  autoUpdater.quitAndInstall(false, true)
}
