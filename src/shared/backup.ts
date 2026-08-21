/**
 * Portable local-data backup format + validator. (v0.8.0)
 *
 * A backup is a plain JSON snapshot of the app's own observation history so a
 * user can move it between machines or keep a safety copy (local-first, spec §19).
 * The transient HTTP cache and encrypted credentials are deliberately excluded —
 * a backup never contains API keys. validateBackup is pure and side-effect free so
 * imports can be checked before any database write.
 */
export const BACKUP_VERSION = 1

type Row = Record<string, unknown>

export interface BackupData {
  version: number
  exportedAt: string
  players: Row[]
  scans: Row[]
  names: Row[]
  servers: Row[]
  notes: Row[]
  tags: Row[]
  settings: Row[]
  rosters: Row[]
  friendEdges: Row[]
}

export interface ImportSummary {
  players: number
  scans: number
  notes: number
  rosters: number
}

/** Parse/validate an untrusted object into a BackupData, throwing a friendly error otherwise. */
export function validateBackup(raw: unknown): BackupData {
  if (!raw || typeof raw !== 'object') throw new Error('This file is not a valid Steam Player Intel backup.')
  const o = raw as Row
  if (typeof o.version !== 'number') throw new Error('Backup is missing a version number.')
  if (o.version > BACKUP_VERSION) {
    throw new Error(`This backup was made by a newer version of the app (format v${o.version}). Update first.`)
  }
  const arr = (key: string): Row[] => {
    const v = o[key]
    if (v == null) return []
    if (!Array.isArray(v)) throw new Error(`Backup section "${key}" is malformed.`)
    return v as Row[]
  }
  return {
    version: o.version,
    exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : '',
    players: arr('players'),
    scans: arr('scans'),
    names: arr('names'),
    servers: arr('servers'),
    notes: arr('notes'),
    tags: arr('tags'),
    settings: arr('settings'),
    rosters: arr('rosters'),
    friendEdges: arr('friendEdges')
  }
}
