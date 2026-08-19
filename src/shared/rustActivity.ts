/**
 * Rust playtime-over-time trend, built purely from this app's own stored scans. (v0.6.1)
 *
 * Reuses the scan-timeline entries (each carries a snapshot with rustPlaytimeMinutes)
 * to plot how a player's cumulative Rust hours grew across the scans this app
 * recorded. It is honest by construction: only scans that actually captured a
 * Rust playtime value contribute a point, and nothing is interpolated or invented
 * for gaps. Labelled in the UI as "Application Observed History".
 */
import type { ScanTimelineEntry } from './scanTimeline'

export interface RustActivityPoint {
  scannedAt: string
  rustHours: number
  /** Hours gained since the previous recorded point; null for the first point. */
  deltaHours: number | null
}

export interface RustActivityTrend {
  points: RustActivityPoint[]
  /** Total hours gained across the recorded window (last − first), or null if < 2 points. */
  gainedHours: number | null
  firstScan: string | null
  lastScan: string | null
}

const round1 = (n: number): number => Math.round(n * 10) / 10

export function buildRustActivityTrend(entries: ScanTimelineEntry[]): RustActivityTrend {
  const known = entries.filter((e) => e.snapshot.rustPlaytimeMinutes != null)
  const points: RustActivityPoint[] = []
  let prevHours: number | null = null

  for (const e of known) {
    const hours = round1((e.snapshot.rustPlaytimeMinutes as number) / 60)
    points.push({
      scannedAt: e.scannedAt,
      rustHours: hours,
      deltaHours: prevHours == null ? null : round1(hours - prevHours)
    })
    prevHours = hours
  }

  const gainedHours =
    points.length >= 2 ? round1(points[points.length - 1].rustHours - points[0].rustHours) : null

  return {
    points,
    gainedHours,
    firstScan: points[0]?.scannedAt ?? null,
    lastScan: points[points.length - 1]?.scannedAt ?? null
  }
}
