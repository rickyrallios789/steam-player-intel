import { AccountAgeInfo, field, missing } from './types'
import { unixToIsoDate } from './format'

const DAY_SECONDS = 86400

export interface AgeParts {
  years: number
  months: number
  days: number
  totalDays: number
  totalYears: number
}

/**
 * Break a duration into years / months / days using real calendar math (UTC),
 * so the human-readable breakdown does not drift by weeks over long spans the way
 * a fixed 365/30 division does. `totalDays` remains the exact day count used by
 * downstream calculations. (audit F-11)
 */
export function ageBreakdown(fromUnix: number, nowUnix: number): AgeParts {
  const totalDays = Math.max(0, Math.floor((nowUnix - fromUnix) / DAY_SECONDS))
  const nowMs = nowUnix * 1000
  const from = new Date(fromUnix * 1000)

  // Walk whole calendar years, then whole calendar months, then leftover days,
  // letting Date handle real month lengths and leap years. No 365/30 drift.
  let years = 0
  let months = 0
  const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  for (;;) {
    const next = new Date(Date.UTC(cur.getUTCFullYear() + 1, cur.getUTCMonth(), cur.getUTCDate()))
    if (next.getTime() <= nowMs) {
      years++
      cur.setTime(next.getTime())
    } else break
  }
  for (;;) {
    const next = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, cur.getUTCDate()))
    if (next.getTime() <= nowMs) {
      months++
      cur.setTime(next.getTime())
    } else break
  }
  const days = Math.max(0, Math.floor((nowMs - cur.getTime()) / (DAY_SECONDS * 1000)))

  return {
    years,
    months,
    days,
    totalDays,
    totalYears: Number((totalDays / 365.25).toFixed(1))
  }
}

export function ageText(parts: AgeParts): string {
  const bits: string[] = []
  if (parts.years) bits.push(`${parts.years} year${parts.years === 1 ? '' : 's'}`)
  if (parts.months) bits.push(`${parts.months} month${parts.months === 1 ? '' : 's'}`)
  if (!parts.years && parts.days) bits.push(`${parts.days} day${parts.days === 1 ? '' : 's'}`)
  return bits.length ? bits.join(', ') : 'less than a day'
}

/**
 * Build the account-age section.
 *
 * Steam's GetPlayerSummaries returns `timecreated` (unix) ONLY when the profile
 * is public. When present it is the exact creation date → status 'verified'.
 * When absent we do NOT invent one — we mark it unavailable/private. (spec §3)
 */
export function buildAccountAge(
  timecreated: number | null | undefined,
  profileIsPrivate: boolean,
  nowUnix = Math.floor(Date.now() / 1000)
): AccountAgeInfo {
  if (timecreated && timecreated > 0) {
    const parts = ageBreakdown(timecreated, nowUnix)
    return {
      createdAt: field(timecreated, 'steam', 'verified', 'Exact — from public `timecreated`'),
      ageYears: field(parts.totalYears, 'derived', 'inferred'),
      ageText: field(ageText(parts), 'derived', 'inferred'),
      daysSinceCreation: field(parts.totalDays, 'derived', 'inferred'),
      approxCreationYear: field(new Date(timecreated * 1000).getUTCFullYear(), 'steam', 'verified')
    }
  }

  const reason = profileIsPrivate
    ? 'Creation date hidden by profile privacy settings.'
    : 'Steam did not expose a creation date for this account.'
  const status = profileIsPrivate ? 'private' : 'unknown'
  return {
    createdAt: missing(profileIsPrivate ? 'steam' : 'steam', status, reason),
    ageYears: missing('derived', 'unknown', reason),
    ageText: missing('derived', 'unknown', reason),
    daysSinceCreation: missing('derived', 'unknown', reason),
    approxCreationYear: missing('steam', status, reason)
  }
}

/** Convenience for the timeline: ISO date of creation, or null. */
export function creationIso(timecreated: number | null | undefined): string | null {
  return unixToIsoDate(timecreated)
}
