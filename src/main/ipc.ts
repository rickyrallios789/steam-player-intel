/**
 * IPC surface (spec §28, §29). The renderer can ONLY reach the main process
 * through these whitelisted, validated channels — it has no Node or network access.
 * Handlers never return raw API errors; they return friendly, structured results.
 */
import { ipcMain, dialog, shell, app } from 'electron'
import type { CredentialName, CredentialStore } from './credentials'
import type { Repositories } from './db/repositories'
import type { HttpClient } from './core/httpClient'
import { analyzePlayer } from './services/analyzePlayer'
import { exportReport, type ExportFormat } from './services/exportReport'
import type { MonitorService } from './services/monitor'
import { checkForUpdates, quitAndInstall, getLastStatus } from './updater'
import { isValidSteam64 } from '../shared/steamid'
import type { PlayerReport } from '../shared/types'
import { buildDiscordAlert } from '../shared/webhook'

export interface IpcDeps {
  repos: Repositories
  credentials: CredentialStore
  http: HttpClient
  monitor: MonitorService
  openExternal: (url: string) => void
}

const ALLOWED_CREDENTIALS: CredentialName[] = ['STEAM_API_KEY', 'BATTLEMETRICS_API_TOKEN']
const ALLOWED_EXPORT: ExportFormat[] = ['json', 'txt', 'csv', 'pdf']

function assertSteam64(v: unknown): string {
  if (typeof v !== 'string' || !isValidSteam64(v)) throw new Error('Invalid Steam64 id.')
  return v
}
function assertString(v: unknown, max = 4000): string {
  if (typeof v !== 'string' || v.length > max) throw new Error('Invalid string input.')
  return v
}

export function registerIpc(deps: IpcDeps): void {
  // ---- Settings / credentials ----
  ipcMain.handle('settings:status', async () => deps.credentials.status())

  ipcMain.handle('settings:setCredential', async (_e, payload: { name: string; value: string }) => {
    const name = payload?.name as CredentialName
    if (!ALLOWED_CREDENTIALS.includes(name)) throw new Error('Unknown credential.')
    deps.credentials.set(name, assertString(payload.value ?? '', 500))
    return deps.credentials.status()
  })

  // ---- Analyze ----
  ipcMain.handle(
    'player:analyze',
    async (_e, payload: { raw: string; bypassCache?: boolean; persist?: boolean; includeFriends?: boolean }) => {
      try {
        const result = await analyzePlayer(
          { http: deps.http, credentials: deps.credentials, repos: deps.repos },
          {
            raw: assertString(payload?.raw ?? '', 300),
            bypassCache: !!payload?.bypassCache,
            persist: payload?.persist,
            includeFriends: !!payload?.includeFriends
          }
        )
        return result
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Analysis failed unexpectedly.' }
      }
    }
  )

  // ---- History / search list ----
  ipcMain.handle('history:list', async () => deps.repos.listPlayers())
  ipcMain.handle('history:setFavorite', async (_e, p: { steam64: string; favorite: boolean }) => {
    deps.repos.setFavorite(assertSteam64(p.steam64), !!p.favorite)
    return { ok: true }
  })
  ipcMain.handle('history:delete', async (_e, p: { steam64: string }) => {
    deps.repos.deletePlayer(assertSteam64(p.steam64))
    return { ok: true }
  })
  ipcMain.handle('history:clearAll', async () => {
    deps.repos.clearAllHistory()
    return { ok: true }
  })
  ipcMain.handle('player:scanHistory', async (_e, p: { steam64: string }) =>
    deps.repos.getScanTimeline(assertSteam64(p.steam64))
  )

  // ---- Rosters (saved lists) ----
  ipcMain.handle('rosters:list', async () => deps.repos.listRosters())
  ipcMain.handle('rosters:create', async (_e, p: { name: string; members: string }) =>
    deps.repos.createRoster(assertString(p?.name ?? 'Untitled roster', 100), assertString(p?.members ?? '', 20000))
  )
  ipcMain.handle(
    'rosters:update',
    async (_e, p: { id: number; name?: string; members?: string; intervalHours?: number }) => {
      if (typeof p?.id !== 'number') throw new Error('Invalid roster id.')
      deps.repos.updateRoster(p.id, {
        name: p.name != null ? assertString(p.name, 100) : undefined,
        members: p.members != null ? assertString(p.members, 20000) : undefined,
        intervalHours: typeof p.intervalHours === 'number' ? p.intervalHours : undefined
      })
      return { ok: true }
    }
  )
  ipcMain.handle('rosters:delete', async (_e, p: { id: number }) => {
    if (typeof p?.id !== 'number') throw new Error('Invalid roster id.')
    deps.repos.deleteRoster(p.id)
    return { ok: true }
  })

  // ---- Notes (user-entered) ----
  ipcMain.handle('notes:list', async (_e, p: { steam64: string }) => deps.repos.listNotes(assertSteam64(p.steam64)))
  ipcMain.handle('notes:add', async (_e, p: { steam64: string; body: string }) =>
    deps.repos.addNote(assertSteam64(p.steam64), assertString(p.body, 4000))
  )
  ipcMain.handle('notes:delete', async (_e, p: { id: number }) => {
    if (typeof p.id !== 'number') throw new Error('Invalid note id.')
    deps.repos.deleteNote(p.id)
    return { ok: true }
  })

  // ---- Tags ----
  ipcMain.handle('tags:add', async (_e, p: { steam64: string; tag: string }) => {
    deps.repos.addTag(assertSteam64(p.steam64), assertString(p.tag, 40))
    return deps.repos.listTags(p.steam64)
  })
  ipcMain.handle('tags:remove', async (_e, p: { steam64: string; tag: string }) => {
    deps.repos.removeTag(assertSteam64(p.steam64), assertString(p.tag, 40))
    return deps.repos.listTags(p.steam64)
  })

  // ---- Cache ----
  ipcMain.handle('cache:clear', async (_e, p: { match?: string }) => {
    deps.http.clearCache(p?.match)
    return { ok: true }
  })

  // ---- External links (validated) ----
  ipcMain.handle('external:open', async (_e, p: { url: string }) => {
    const url = assertString(p?.url, 500)
    if (!/^https:\/\//i.test(url)) throw new Error('Only https links may be opened.')
    await shell.openExternal(url)
    return { ok: true }
  })

  // ---- Export ----
  ipcMain.handle(
    'report:export',
    async (_e, p: { report: PlayerReport; format: ExportFormat; suggestedName?: string }) => {
      if (!ALLOWED_EXPORT.includes(p?.format)) throw new Error('Unsupported export format.')
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Export report',
        defaultPath: `${p.suggestedName ?? 'player-report'}.${p.format}`,
        filters: [{ name: p.format.toUpperCase(), extensions: [p.format] }]
      })
      if (canceled || !filePath) return { ok: false, canceled: true }
      await exportReport(p.report, p.format, filePath)
      return { ok: true, filePath }
    }
  )

  ipcMain.handle('app:info', async () => ({ version: app.getVersion(), name: app.getName() }))

  // ---- Watchlist monitoring ----
  ipcMain.handle('monitor:status', async () => ({ enabled: deps.monitor.isActive }))
  ipcMain.handle('monitor:setEnabled', async (_e, p: { enabled: boolean }) => {
    const enabled = !!p?.enabled
    deps.repos.setSetting('monitor.enabled', enabled ? '1' : '0')
    if (enabled) deps.monitor.start()
    else deps.monitor.stop()
    return { enabled: deps.monitor.isActive }
  })
  ipcMain.handle('monitor:runNow', async () => deps.monitor.runOnce())
  ipcMain.handle('monitor:getWebhook', async () => ({ url: deps.repos.getSetting('monitor.webhook') ?? '' }))
  ipcMain.handle('monitor:setWebhook', async (_e, p: { url: string }) => {
    deps.repos.setSetting('monitor.webhook', assertString(p?.url ?? '', 500).trim())
    return { ok: true }
  })
  ipcMain.handle('monitor:testWebhook', async (_e, p: { url: string }) => {
    const url = assertString(p?.url ?? '', 500).trim()
    if (!/^https:\/\//i.test(url)) return { ok: false, error: 'Enter an https webhook URL.' }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildDiscordAlert('Test', 'Steam Player Intel webhook is working', '76561197960287930'))
      })
      return res.ok ? { ok: true } : { ok: false, error: `Webhook returned HTTP ${res.status}` }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Request failed' }
    }
  })

  // ---- Auto-update ----
  ipcMain.handle('update:check', async () => {
    await checkForUpdates()
    return { ok: true }
  })
  ipcMain.handle('update:install', async () => {
    quitAndInstall()
    return { ok: true }
  })
  ipcMain.handle('update:status', async () => getLastStatus())
}
