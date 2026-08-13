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

/** Break a duration (in seconds) into years / months / days. Calendar-approximate. */
export function ageBreakdown(fromUnix: number, nowUnix: number): AgeParts {
  const totalDays = Math.max(0, Math.floor((nowUnix - fromUnix) / DAY_SECONDS))
  const years = Math.floor(totalDays / 365)
  const remAfterYears = totalDays - years * 365
  const months = Math.floor(remAfterYears / 30)
  const days = remAfterYears - months * 30
  return {
    years,
    months,
    days,
    totalDays,
    totalYears: Number((totalDays / 365).toFixed(1))
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
