/**
 * Turn this app's stored scans for a player (oldest → newest) into a timeline
 * of what changed at each scan, reusing the same change detection as the live
 * "changes since last scan" banner. Pure and side-effect free. (cross-time timeline)
 */
import { diffSnapshots, type PlayerSnapshot } from './changeDetection'
import type { ChangeEntry } from './types'

export interface ScanTimelineEntry {
  scannedAt: string
  snapshot: PlayerSnapshot
}

export interface ScanTimelineStep {
  scannedAt: string
  changes: ChangeEntry[]
}

export function buildScanTimeline(scans: ScanTimelineEntry[]): ScanTimelineStep[] {
  return scans.map((s, i) => ({
    scannedAt: s.scannedAt,
    changes: i > 0 ? diffSnapshots(scans[i - 1].snapshot, s.snapshot) : []
  }))
}
