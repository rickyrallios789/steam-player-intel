import type { PlayerReport } from '@shared/types'
import type { SettingsStatus, AnalyzeResult, HistoryItem, NoteItem, UpdateStatus, RosterRow } from '@shared/ipc'
import type { ScanTimelineEntry } from '@shared/scanTimeline'

// Re-export the shared IPC types so existing `from '../global'` imports keep working. (audit F-13)
export type { SettingsStatus, AnalyzeResult, HistoryItem, NoteItem, UpdateStatus, RosterRow }

export interface RendererApi {
  settings: {
    status(): Promise<SettingsStatus>
    setCredential(name: string, value: string): Promise<SettingsStatus>
  }
  analyze(
    raw: string,
    opts?: { bypassCache?: boolean; persist?: boolean; includeFriends?: boolean }
  ): Promise<AnalyzeResult>
  history: {
    list(): Promise<HistoryItem[]>
    setFavorite(steam64: string, favorite: boolean): Promise<{ ok: boolean }>
    remove(steam64: string): Promise<{ ok: boolean }>
    clearAll(): Promise<{ ok: boolean }>
    scanTimeline(steam64: string): Promise<ScanTimelineEntry[]>
  }
  rosters: {
    list(): Promise<RosterRow[]>
    create(name: string, members: string): Promise<RosterRow>
    update(id: number, patch: { name?: string; members?: string; intervalHours?: number }): Promise<{ ok: boolean }>
    remove(id: number): Promise<{ ok: boolean }>
  }
  notes: {
    list(steam64: string): Promise<NoteItem[]>
    add(steam64: string, body: string): Promise<NoteItem>
    remove(id: number): Promise<{ ok: boolean }>
  }
  tags: {
    add(steam64: string, tag: string): Promise<string[]>
    remove(steam64: string, tag: string): Promise<string[]>
  }
  cache: { clear(match?: string): Promise<{ ok: boolean }> }
  updates: {
    check(): Promise<{ ok: boolean }>
    install(): Promise<{ ok: boolean }>
    current(): Promise<UpdateStatus>
    onStatus(cb: (status: UpdateStatus) => void): () => void
  }
  monitor: {
    status(): Promise<{ enabled: boolean }>
    setEnabled(enabled: boolean): Promise<{ enabled: boolean }>
    runNow(): Promise<{ checked: number; alerts: number }>
    getWebhook(): Promise<{ url: string }>
    setWebhook(url: string): Promise<{ ok: boolean }>
    testWebhook(url: string): Promise<{ ok: boolean; error?: string }>
    onOpen(cb: (steam64: string) => void): () => void
  }
  openExternal(url: string): Promise<{ ok: boolean }>
  exportReport(
    report: PlayerReport,
    format: 'json' | 'txt' | 'csv' | 'pdf',
    suggestedName?: string
  ): Promise<{ ok: boolean; filePath?: string; canceled?: boolean }>
  appInfo(): Promise<{ version: string; name: string }>
}

declare global {
  interface Window {
    api: RendererApi
  }
}
