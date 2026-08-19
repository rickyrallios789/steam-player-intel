import { describe, it, expect } from 'vitest'
import { buildActivityFeed, isHighSignal, type PlayerTimeline } from '../src/shared/activityFeed'
import type { PlayerSnapshot } from '../src/shared/changeDetection'

const snap = (over: Partial<PlayerSnapshot>): PlayerSnapshot => ({
  displayName: null,
  avatarHash: null,
  steamLevel: null,
  gameCount: null,
  totalPlaytimeMinutes: null,
  rustPlaytimeMinutes: null,
  vacBans: 0,
  gameBans: 0,
  communityBanned: false,
  visibility: 'public',
  ...over
})

describe('buildActivityFeed (command center home)', () => {
  it('emits one event per changed scan, newest first', () => {
    const timelines: PlayerTimeline[] = [
      {
        steam64: 'A',
        displayName: 'Alice',
        entries: [
          { scannedAt: '2024-01-01T00:00:00Z', snapshot: snap({ vacBans: 0 }) },
          { scannedAt: '2024-01-02T00:00:00Z', snapshot: snap({ vacBans: 1 }) }
        ]
      },
      {
        steam64: 'B',
        displayName: 'Bob',
        entries: [
          { scannedAt: '2024-01-03T00:00:00Z', snapshot: snap({ visibility: 'public' }) },
          { scannedAt: '2024-01-04T00:00:00Z', snapshot: snap({ visibility: 'private' }) }
        ]
      }
    ]
    const feed = buildActivityFeed(timelines)
    expect(feed.length).toBe(2)
    expect(feed[0].steam64).toBe('B') // newest first
    expect(feed[0].at).toBe('2024-01-04T00:00:00Z')
    expect(feed[1].steam64).toBe('A')
  })

  it('skips players with no changes between scans', () => {
    const feed = buildActivityFeed([
      {
        steam64: 'C',
        displayName: null,
        entries: [
          { scannedAt: '2024-01-01T00:00:00Z', snapshot: snap({}) },
          { scannedAt: '2024-01-02T00:00:00Z', snapshot: snap({}) }
        ]
      }
    ])
    expect(feed).toEqual([])
  })

  it('classifies high-signal (ban / went-private) vs routine events', () => {
    const banned = buildActivityFeed([
      {
        steam64: 'A',
        displayName: 'Alice',
        entries: [
          { scannedAt: '2024-01-01T00:00:00Z', snapshot: snap({ vacBans: 0 }) },
          { scannedAt: '2024-01-02T00:00:00Z', snapshot: snap({ vacBans: 1 }) }
        ]
      }
    ])
    expect(isHighSignal(banned[0])).toBe(true)

    const levelOnly = buildActivityFeed([
      {
        steam64: 'A',
        displayName: 'Alice',
        entries: [
          { scannedAt: '2024-01-01T00:00:00Z', snapshot: snap({ steamLevel: 10 }) },
          { scannedAt: '2024-01-02T00:00:00Z', snapshot: snap({ steamLevel: 11 }) }
        ]
      }
    ])
    expect(levelOnly.length).toBe(1)
    expect(isHighSignal(levelOnly[0])).toBe(false)
  })

  it('respects the maxEvents cap', () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      scannedAt: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
      snapshot: snap({ steamLevel: i })
    }))
    const feed = buildActivityFeed([{ steam64: 'A', displayName: 'A', entries }], 3)
    expect(feed.length).toBe(3)
  })
})
