import { describe, it, expect } from 'vitest'
import { buildRustActivityTrend } from '../src/shared/rustActivity'
import type { ScanTimelineEntry } from '../src/shared/scanTimeline'

const entry = (scannedAt: string, rustMin: number | null): ScanTimelineEntry => ({
  scannedAt,
  snapshot: {
    displayName: null,
    avatarHash: null,
    steamLevel: null,
    gameCount: null,
    totalPlaytimeMinutes: null,
    rustPlaytimeMinutes: rustMin,
    vacBans: null,
    gameBans: null,
    communityBanned: null,
    visibility: null
  }
})

describe('buildRustActivityTrend (v0.6.1)', () => {
  it('skips scans with unknown Rust playtime', () => {
    const t = buildRustActivityTrend([entry('2024-01-01T00:00:00Z', null), entry('2024-01-02T00:00:00Z', 600)])
    expect(t.points.length).toBe(1)
    expect(t.points[0].rustHours).toBe(10)
    expect(t.points[0].deltaHours).toBe(null)
    expect(t.gainedHours).toBe(null)
  })

  it('computes per-scan deltas and total gained across the window', () => {
    const t = buildRustActivityTrend([
      entry('2024-01-01T00:00:00Z', 600), // 10h
      entry('2024-01-08T00:00:00Z', 1200), // 20h
      entry('2024-01-15T00:00:00Z', 1500) // 25h
    ])
    expect(t.points.map((p) => p.rustHours)).toEqual([10, 20, 25])
    expect(t.points.map((p) => p.deltaHours)).toEqual([null, 10, 5])
    expect(t.gainedHours).toBe(15)
    expect(t.firstScan).toBe('2024-01-01T00:00:00Z')
    expect(t.lastScan).toBe('2024-01-15T00:00:00Z')
  })

  it('returns an empty trend when no scan has Rust data', () => {
    const t = buildRustActivityTrend([entry('2024-01-01T00:00:00Z', null)])
    expect(t.points).toEqual([])
    expect(t.gainedHours).toBe(null)
    expect(t.firstScan).toBe(null)
  })
})
