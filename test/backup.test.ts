import { describe, it, expect } from 'vitest'
import { validateBackup, BACKUP_VERSION } from '../src/shared/backup'

const good = {
  version: BACKUP_VERSION,
  exportedAt: '2026-01-01T00:00:00Z',
  players: [{ steam64: '76561198000000000' }],
  scans: [],
  notes: [{ steam64: '76561198000000000', body: 'note', created_at: '2026-01-01T00:00:00Z' }]
}

describe('validateBackup (v0.8.0)', () => {
  it('accepts a valid backup and defaults missing arrays to []', () => {
    const b = validateBackup(good)
    expect(b.version).toBe(BACKUP_VERSION)
    expect(b.players.length).toBe(1)
    expect(b.notes.length).toBe(1)
    // absent sections normalize to empty arrays
    expect(b.names).toEqual([])
    expect(b.servers).toEqual([])
    expect(b.tags).toEqual([])
    expect(b.rosters).toEqual([])
    expect(b.settings).toEqual([])
  })

  it('rejects non-objects', () => {
    expect(() => validateBackup(null)).toThrow()
    expect(() => validateBackup('nope')).toThrow()
    expect(() => validateBackup(42)).toThrow()
  })

  it('rejects a missing version', () => {
    expect(() => validateBackup({ players: [] })).toThrow(/version/i)
  })

  it('rejects a newer backup format', () => {
    expect(() => validateBackup({ version: BACKUP_VERSION + 1 })).toThrow(/newer version/i)
  })

  it('rejects a malformed section (non-array)', () => {
    expect(() => validateBackup({ version: BACKUP_VERSION, players: { not: 'an array' } })).toThrow(/malformed/i)
  })
})
