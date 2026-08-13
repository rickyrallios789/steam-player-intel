import { GameStat, PlaytimeVsAge, ProfileScore } from './types'
import { median, minutesToHours } from './format'

export interface GameStatsResult {
  total: number
  played: number
  neverPlayed: number
  totalMinutes: number
  averageMinutes: number
  medianMinutes: number
  topGames: GameStat[]
  recentGames: GameStat[]
}

/** Aggregate an owned-games list into the numbers the Games tab shows. */
export function computeGameStats(games: GameStat[]): GameStatsResult {
  const total = games.length
  const played = games.filter((g) => g.playtimeForeverMinutes > 0)
  const totalMinutes = games.reduce((sum, g) => sum + g.playtimeForeverMinutes, 0)
  const playedMinutes = played.map((g) => g.playtimeForeverMinutes)
  const topGames = [...games]
    .sort((a, b) => b.playtimeForeverMinutes - a.playtimeForeverMinutes)
    .slice(0, 10)
  const recentGames = games
    .filter((g) => g.playtime2weeksMinutes > 0)
    .sort((a, b) => b.playtime2weeksMinutes - a.playtime2weeksMinutes)
  return {
    total,
    played: played.length,
    neverPlayed: total - played.length,
    totalMinutes,
    averageMinutes: played.length ? Math.round(totalMinutes / played.length) : 0,
    medianMinutes: Math.round(median(playedMinutes)),
    topGames,
    recentGames
  }
}

/**
 * Compare recorded playtime against account age. This is a *statistical note*,
 * never an accusation. We surface an average and flag only mathematically
 * unusual values, with an explicit caveat about idle/background/shared time. (spec §13)
 */
export function computePlaytimeVsAge(
  totalPlaytimeMinutes: number | null,
  accountAgeDays: number | null
): PlaytimeVsAge {
  if (
    totalPlaytimeMinutes == null ||
    accountAgeDays == null ||
    accountAgeDays <= 0
  ) {
    return {
      computable: false,
      hoursPerDay: null,
      totalHours: totalPlaytimeMinutes != null ? minutesToHours(totalPlaytimeMinutes) : null,
      accountAgeDays: accountAgeDays ?? null,
      unusual: false,
      note: 'Not enough public data to compare playtime against account age.'
    }
  }
  const totalHours = minutesToHours(totalPlaytimeMinutes)
  const hoursPerDay = Number((totalHours / accountAgeDays).toFixed(2))
  // A sustained lifetime average above ~12h/day is mathematically unusual for a
  // single human operator, but is commonly explained by idle games, background
  // sessions, shared computers, or Steam counting time with the client open.
  const unusual = hoursPerDay > 12
  const note = unusual
    ? 'This lifetime average is mathematically high. This calculation assumes the recorded playtime is accurate and continuously accumulated. Steam playtime may include idle time, background sessions, shared systems, family sharing, or other factors, and does not by itself indicate anything improper.'
    : 'This calculation assumes the recorded playtime is accurate and continuously accumulated. Steam playtime may include idle time, background sessions, or shared systems.'
  return { computable: true, hoursPerDay, totalHours, accountAgeDays, unusual, note }
}

export interface ProfileScoreInput {
  accountAgeDays: number | null
  steamLevel: number | null
  totalGames: number | null
  totalHours: number | null
  vacBans: number | null
  gameBans: number | null
  communityBanned: boolean | null
  economyBan: string | null
  daysSinceLastBan: number | null
  visibility: 'public' | 'private' | 'friends-only' | 'unknown'
}

const SCORE_DISCLAIMER =
  'This is an informational summary of observable, public account factors — NOT proof of wrongdoing. ' +
  'It never identifies anyone as a cheater, hacker, scammer, bot or alt account. ' +
  'A higher score only means more items an investigator may wish to look at manually.'

/**
 * Transparent, non-accusatory ACCOUNT PROFILE score. (spec §12)
 * Returns every factor and the points it contributed so the result is fully explainable.
 */
export function computeProfileScore(input: ProfileScoreInput): ProfileScore {
  const factors: ProfileScore['factors'] = []
  let score = 0
  const add = (
    label: string,
    detail: string,
    direction: 'neutral' | 'attention',
    points: number
  ) => {
    factors.push({ label, detail, direction, points })
    score += points
  }

  // Bans — factual, public.
  const vac = input.vacBans ?? 0
  if (input.vacBans == null) {
    add('VAC status', 'Ban data unavailable.', 'neutral', 0)
  } else if (vac > 0) {
    add('VAC bans', `${vac} VAC ban${vac === 1 ? '' : 's'} on record.`, 'attention', 25)
  } else {
    add('VAC bans', 'No VAC bans on record.', 'neutral', 0)
  }

  const gb = input.gameBans ?? 0
  if (gb > 0) add('Game bans', `${gb} game ban${gb === 1 ? '' : 's'} on record.`, 'attention', 15)
  else if (input.gameBans != null) add('Game bans', 'No game bans on record.', 'neutral', 0)

  if (input.communityBanned) add('Community ban', 'Account is community banned.', 'attention', 10)
  if (input.economyBan && input.economyBan !== 'none')
    add('Trade/economy', `Economy status: ${input.economyBan}.`, 'attention', 8)

  if (
    input.daysSinceLastBan != null &&
    input.daysSinceLastBan >= 0 &&
    input.daysSinceLastBan < 365 &&
    (vac > 0 || gb > 0)
  ) {
    add('Recent ban', `Most recent ban was ${input.daysSinceLastBan} day(s) ago.`, 'attention', 10)
  }

  // Account age — a very new account is context, not a red flag by itself.
  if (input.accountAgeDays != null) {
    if (input.accountAgeDays < 30)
      add('Account age', 'Account is under 30 days old — limited history to review.', 'attention', 5)
    else add('Account age', `Account is ~${Math.round(input.accountAgeDays / 365 * 10) / 10} years old.`, 'neutral', 0)
  }

  // Visibility — private limits verification; explicitly NOT treated as suspicious.
  if (input.visibility === 'private')
    add('Profile visibility', 'Profile is private — fewer facts can be verified.', 'attention', 3)
  else if (input.visibility === 'public')
    add('Profile visibility', 'Profile is public.', 'neutral', 0)

  // Decide band, accounting for missing data.
  const haveBanData = input.vacBans != null || input.gameBans != null
  let band: ProfileScore['band']
  let summary: string
  if (!haveBanData && input.visibility !== 'public') {
    band = 'INSUFFICIENT DATA'
    summary = 'Too little public data to summarize. No obvious account-level red flags could be evaluated.'
  } else if (score >= 35) {
    band = 'ELEVATED'
    summary = 'Multiple public factors warrant manual review. Additional investigation may be warranted.'
  } else if (score >= 15) {
    band = 'MODERATE'
    summary = 'Some public factors are worth a closer look. Additional investigation may be warranted.'
  } else {
    band = 'LOW CONCERN'
    summary = 'No obvious account-level red flags detected in the public data.'
  }

  return { score, band, summary, factors, disclaimer: SCORE_DISCLAIMER }
}
