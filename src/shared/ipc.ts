/**
 * Shared IPC contract types — the single source of truth for the small data
 * shapes that cross the main ⇆ preload ⇆ renderer boundary. Previously these were
 * declared separately in preload, the renderer's global.d.ts and the updater,
 * which allowed them to drift. Define once here and import everywhere. (audit F-13)
 */
import type { PlayerReport } from './types'
import type { ActivityEvent } from './activityFeed'
import type { AltLead } from './altLeads'

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

export interface HomeOverview {
  trackedPlayers: number
  favorites: number
  totalScans: number
  /** Most recent cross-player changes, newest first. */
  events: ActivityEvent[]
}

export interface ConnectionsResult {
  /** How many scanned accounts were considered. */
  players: number
  /** Possible connections to review (leads, never proof), strongest first. */
  leads: AltLead[]
}

export interface RosterRow {
  id: number
  name: string
  /** Newline/comma/space-separated raw Steam identifiers pasted by the user. */
  members: string
  /** Background re-screen cadence in hours; 0 = manual only. */
  interval_hours: number
  last_run: string | null
  created_at: string
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'dev'; message: string }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }
