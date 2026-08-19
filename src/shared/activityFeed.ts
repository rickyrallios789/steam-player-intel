/**
 * Cross-player activity feed for the command-center home. (v0.7.0)
 *
 * Pure and side-effect free. Given each tracked player's stored scan timeline
 * (oldest → newest), it diffs consecutive scans with the same change detection
 * used everywhere else and emits one event per scan that actually changed. Events
 * are sorted newest-first and capped. It invents nothing: an event only exists
 * where this app recorded a real change between two of its own scans.
 */
import { diffSnapshots } from './changeDetection'
import type { ScanTimelineEntry } from './scanTimeline'
import type { ChangeEntry } from './types'

export interface PlayerTimeline {
  steam64: string
  displayName: string | null
  entries: ScanTimelineEntry[]
}

export interface ActivityEvent {
  steam64: string
  displayName: string | null
  /** ISO timestamp of the newer scan in which the change was observed. */
  at: string
  changes: ChangeEntry[]
}

/** True when an event contains a high-signal change (new ban or privacy flip). */
export function isHighSignal(event: ActivityEvent): boolean {
  return event.changes.some((c) => c.kind === 'ban' || (c.kind === 'privacy' && c.after === 'private'))
}

export function buildActivityFeed(timelines: PlayerTimeline[], maxEvents = 60): ActivityEvent[] {
  const events: ActivityEvent[] = []
  for (const t of timelines) {
    for (let i = 1; i < t.entries.length; i++) {
      const changes = diffSnapshots(t.entries[i - 1].snapshot, t.entries[i].snapshot)
      if (changes.length > 0) {
        events.push({ steam64: t.steam64, displayName: t.displayName, at: t.entries[i].scannedAt, changes })
      }
    }
  }
  events.sort((a, b) => b.at.localeCompare(a.at))
  return events.slice(0, maxEvents)
}
