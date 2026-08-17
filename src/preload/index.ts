/**
 * Preload bridge. Exposes a small, explicit, typed API to the renderer via
 * contextBridge. No Node modules, no ipcRenderer, and no credential VALUES are
 * ever exposed — only whitelisted invoke wrappers. (spec §28)
 */
import { contextBridge, ipcRenderer } from 'electron'
import type { PlayerReport } from '../shared/types'
import type { UpdateStatus } from '../main/updater'

export interface SettingsStatus {
  steamKeySet: boolean
  battlemetricsTokenSet: boolean
  encryptionAvailable: boolean
  persistent: boolean
}

export interface AnalyzeResult {
  ok: boolean
  report?: PlayerReport
  error?: string
  detectedLabel?: string
}

export interface HistoryItem {
  steam64: string
  first_observed: string
  last_observed: string
  scan_count: number
  favorite: number
  display_name: string | null
  tags: string[]
}

export interface NoteItem {
  id: number
  steam64: string
  body: string
  created_at: string
}

const api = {
  settings: {
    status: (): Promise<SettingsStatus> => ipcRenderer.invoke('settings:status'),
    setCredential: (name: string, value: string): Promise<SettingsStatus> =>
      ipcRenderer.invoke('settings:setCredential', { name, value })
  },
  analyze: (raw: string, opts?: { bypassCache?: boolean; persist?: boolean }): Promise<AnalyzeResult> =>
    ipcRenderer.invoke('player:analyze', { raw, ...(opts ?? {}) }),
  history: {
    list: (): Promise<HistoryItem[]> => ipcRenderer.invoke('history:list'),
    setFavorite: (steam64: string, favorite: boolean) =>
      ipcRenderer.invoke('history:setFavorite', { steam64, favorite }),
    remove: (steam64: string) => ipcRenderer.invoke('history:delete', { steam64 }),
    clearAll: () => ipcRenderer.invoke('history:clearAll')
  },
  notes: {
    list: (steam64: string): Promise<NoteItem[]> => ipcRenderer.invoke('notes:list', { steam64 }),
    add: (steam64: string, body: string): Promise<NoteItem> => ipcRenderer.invoke('notes:add', { steam64, body }),
    remove: (id: number) => ipcRenderer.invoke('notes:delete', { id })
  },
  tags: {
    add: (steam64: string, tag: string): Promise<string[]> => ipcRenderer.invoke('tags:add', { steam64, tag }),
    remove: (steam64: string, tag: string): Promise<string[]> => ipcRenderer.invoke('tags:remove', { steam64, tag })
  },
  cache: {
    clear: (match?: string) => ipcRenderer.invoke('cache:clear', { match })
  },
  updates: {
    check: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('update:check'),
    install: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('update:install'),
    current: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:status'),
    onStatus: (cb: (status: UpdateStatus) => void): (() => void) => {
      const listener = (_e: unknown, status: UpdateStatus) => cb(status)
      ipcRenderer.on('update:status', listener)
      return () => ipcRenderer.removeListener('update:status', listener)
    }
  },
  openExternal: (url: string) => ipcRenderer.invoke('external:open', { url }),
  exportReport: (
    report: PlayerReport,
    format: 'json' | 'txt' | 'csv' | 'pdf',
    suggestedName?: string
  ): Promise<{ ok: boolean; filePath?: string; canceled?: boolean }> =>
    ipcRenderer.invoke('report:export', { report, format, suggestedName }),
  appInfo: (): Promise<{ version: string; name: string }> => ipcRenderer.invoke('app:info')
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
