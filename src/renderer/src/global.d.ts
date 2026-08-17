import type { PlayerReport } from '@shared/types'
import type { SettingsStatus, AnalyzeResult, HistoryItem, NoteItem, UpdateStatus } from '@shared/ipc'

// Re-export the shared IPC types so existing `from '../global'` imports keep working. (audit F-13)
export type { SettingsStatus, AnalyzeResult, HistoryItem, NoteItem, UpdateStatus }

export interface RendererApi {
  settings: {
    status(): Promise<SettingsStatus>
    setCredential(name: string, value: string): Promise<SettingsStatus>
  }
  analyze(raw: string, opts?: { bypassCache?: boolean; persist?: boolean }): Promise<AnalyzeResult>
  history: {
    list(): Promise<HistoryItem[]>
    setFavorite(steam64: string, favorite: boolean): Promise<{ ok: boolean }>
    remove(steam64: string): Promise<{ ok: boolean }>
    clearAll(): Promise<{ ok: boolean }>
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
