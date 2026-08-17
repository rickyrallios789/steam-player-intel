/**
 * Which detected changes are worth a desktop notification for a watched player.
 *
 * Per the monitoring design we alert only on the high-signal, investigative
 * events: a new ban, or a profile flipping to private. Everything else the
 * change detector finds (name/level/playtime/games) is visible in-app but does
 * not fire a notification, to keep alerts rare and meaningful.
 */
import type { ChangeEntry } from './types'

export interface MonitorAlert {
  label: string
  kind: ChangeEntry['kind']
}

export function selectAlerts(entries: ChangeEntry[]): MonitorAlert[] {
  const out: MonitorAlert[] = []
  for (const e of entries) {
    // New VAC / game / community ban — but not a community ban being lifted.
    const isNewBan = e.kind === 'ban' && !(e.field === 'communityBanned' && e.after === false)
    // Profile visibility flipping to private.
    const wentPrivate = e.kind === 'privacy' && e.after === 'private'
    if (isNewBan || wentPrivate) out.push({ label: e.label, kind: e.kind })
  }
  return out
}
