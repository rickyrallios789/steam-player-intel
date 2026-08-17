/**
 * Electron main process entry.
 *
 * Security posture (spec §28, §29):
 *  - contextIsolation ON, nodeIntegration OFF, sandbox ON.
 *  - The renderer has NO Node access and NO direct network access; it can only
 *    call the whitelisted IPC methods exposed by the preload bridge.
 *  - API keys live only in the main process credential store.
 *
 * A single-instance lock prevents a second launch from opening a duplicate
 * window / second SQLite writer. (audit F-3)
 */
import { app, BrowserWindow, shell } from 'electron'
import { join, dirname } from 'node:path'
import { AppDatabase } from './db/database'
import { Repositories } from './db/repositories'
import { CredentialStore } from './credentials'
import { httpClient } from './core/httpClient'
import { registerIpc } from './ipc'
import { loadEnvFile } from './env'
import { initUpdater, checkForUpdates } from './updater'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: '#0b0f17',
    title: 'Steam Player Intel',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // Open external links in the user's browser, never in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // A second launch: focus the existing window instead of opening a duplicate.
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    // Auto-load a local, gitignored .env (main process only) so the Steam API key
    // works without manual entry, while staying out of source control and the UI.
    loadEnvFile([
      join(app.getAppPath(), '.env'),
      join(process.cwd(), '.env'),
      join(dirname(app.getPath('exe')), '.env')
    ])

    const db = new AppDatabase(app.getPath('userData'))
    const repos = new Repositories(db)
    repos.pruneHistory() // trim old history on startup (audit F-8)
    const credentials = new CredentialStore(app.getPath('userData'))

    registerIpc({ repos, credentials, http: httpClient, openExternal: (u) => shell.openExternal(u) })

    createWindow()

    // Auto-update: only meaningful in the packaged app. Check shortly after launch.
    initUpdater()
    if (app.isPackaged) setTimeout(() => void checkForUpdates(), 4000)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    app.on('before-quit', () => db.close())
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
