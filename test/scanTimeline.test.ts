import { describe, it, expect } from 'vitest'
import { buildScanTimeline } from '../src/shared/scanTimeline'
import type { PlayerSnapshot } from '../src/shared/changeDetection'

const snap = (over: Partial<PlayerSnapshot>): PlayerSnapshot => ({
  displayName: 'A',
  avatarHash: 'h',
  steamLevel: 10,
  gameCount: 5,
  totalPlaytimeMinutes: 600,
  rustPlaytimeMinutes: 100,
  vacBans: 0,
  gameBans: 0,
  communityBanned: false,
  visibility: 'public',
  ...over
})

describe('buildScanTimeline (cross-time timeline)', () => {
  it('reports no changes on the first scan, then diffs consecutive scans', () => {
    const steps = buildScanTimeline([
      { scannedAt: '2026-01-01T00:00:00Z', snapshot: snap({}) },
      { scannedAt: '2026-01-02T00:00:00Z', snapshot: snap({ vacBans: 1 }) },
      { scannedAt: '2026-01-03T00:00:00Z', snapshot: snap({ vacBans: 1, visibility: 'private' }) }
    ])
    expect(steps).toHaveLength(3)
    expect(steps[0].changes).toEqual([])
    expect(steps[1].changes.some((c) => c.kind === 'ban')).toBe(true)
    expect(steps[2].changes.some((c) => c.kind === 'privacy')).toBe(true)
  })
})
