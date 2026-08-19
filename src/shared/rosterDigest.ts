/**
 * Build a Discord-ready digest for a scheduled roster re-screen. (v0.5.1)
 *
 * Pure and side-effect free so it can be unit-tested and reused by the scheduler.
 * It only summarises high-signal, investigative changes (the same new-ban /
 * went-private alerts the favorites monitor uses). It never accuses: flagged
 * members are presented as "changes to review", never as proof of anything.
 * When nothing notable changed, `hasNotable` is false and `content` is empty so
 * the scheduler can stay quiet.
 */
const DISCORD_SAFE_LIMIT = 1900 // leave headroom under Discord's 2000-char cap

export interface RosterMemberResult {
  steam64: string
  name: string
  /** High-signal alert labels (from selectAlerts); empty means nothing notable. */
  alerts: string[]
  /** True if the re-scan failed (private/unavailable/network) — not counted as flagged. */
  error?: boolean
}

export interface RosterDigest {
  rosterName: string
  checked: number
  flagged: number
  errors: number
  hasNotable: boolean
  /** Discord webhook message body; empty string when there is nothing to report. */
  content: string
}

export function buildRosterDigest(rosterName: string, results: RosterMemberResult[]): RosterDigest {
  const checked = results.length
  const flaggedMembers = results.filter((r) => r.alerts.length > 0)
  const flagged = flaggedMembers.length
  const errors = results.filter((r) => r.error).length
  const hasNotable = flagged > 0

  if (!hasNotable) {
    return { rosterName, checked, flagged, errors, hasNotable, content: '' }
  }

  const lines: string[] = [
    `**Steam Player Intel** — roster "${rosterName}"`,
    `Re-screened ${checked} ${checked === 1 ? 'player' : 'players'} · ${flagged} with new changes to review:`
  ]
  for (const m of flaggedMembers) {
    const url = `https://steamcommunity.com/profiles/${m.steam64}`
    lines.push(`• ${m.name}: ${m.alerts.join('; ')} — <${url}>`)
  }

  let content = lines.join('\n')
  if (content.length > DISCORD_SAFE_LIMIT) content = content.slice(0, DISCORD_SAFE_LIMIT) + '\n…(truncated)'

  return { rosterName, checked, flagged, errors, hasNotable, content }
}
