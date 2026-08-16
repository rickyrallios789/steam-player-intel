/**
 * analyzePlayer — the orchestration core.
 *
 * Resolves the input to a Steam64, queries every configured provider IN PARALLEL,
 * merges the results into one normalized, source-tagged PlayerReport, records the
 * scan in local history and computes change detection vs the previous scan.
 *
 * Guarantees:
 *  - One failing source never fails the whole report (spec §26).
 *  - Missing data is labelled private/unavailable/unknown, never fabricated (§33).
 *  - Every field carries a source + status + timestamp (§18, §34).
 */
import type { HttpClient } from '../core/httpClient'
import type { CredentialStore } from '../credentials'
import type { Repositories } from '../db/repositories'
import { SteamProvider } from '../providers/SteamProvider'
import { BattleMetricsProvider } from '../providers/BattleMetricsProvider'
import { LocalHistoryProvider } from '../providers/LocalHistoryProvider'
import type { Capability, ProviderContext, ProviderIssue, ServerHistoryData } from '../providers/types'
import { resolveToSteam64 } from '../../shared/steamid'
import { steam64ToSet } from '../../shared/steamid'
import { buildAccountAge, creationIso } from '../../shared/accountAge'
import { computeGameStats, computePlaytimeVsAge, computeProfileScore } from '../../shared/analysis'
import { diffSnapshots, type PlayerSnapshot } from '../../shared/changeDetection'
import {
  field,
  missing,
  RUST_APP_ID,
  type CommunityVisibility,
  type DataSource,
  type NameObservation,
  type PersonaState,
  type PlayerReport,
  type ServerObservation,
  type TimelineEvent
} from '../../shared/types'
import { minutesToHours, visibilityLabel } from '../../shared/format'

export interface AnalyzeDeps {
  http: HttpClient
  credentials: CredentialStore
  repos: Repositories
}

export interface AnalyzeOptions {
  raw: string
  bypassCache?: boolean
  /** When false, the scan is not written to local history (preview only). */
  persist?: boolean
}

const steam = new SteamProvider()
const battlemetrics = new BattleMetricsProvider()

function personaState(n: number): PersonaState {
  const map: Record<number, PersonaState> = {
    0: 'offline',
    1: 'online',
    2: 'busy',
    3: 'away',
    4: 'snooze',
    5: 'looking-to-trade',
    6: 'looking-to-play'
  }
  return map[n] ?? 'offline'
}

function visibility(n: number | null): CommunityVisibility {
  if (n === 1) return 'private'
  if (n === 2) return 'friends-only'
  if (n === 3) return 'public'
  return 'unknown'
}

export async function analyzePlayer(
  deps: AnalyzeDeps,
  opts: AnalyzeOptions
): Promise<{ ok: boolean; report?: PlayerReport; error?: string; detectedLabel?: string }> {
  const getCredential = (name: string) => deps.credentials.get(name as 'STEAM_API_KEY')
  const issues: ProviderIssue[] = []
  const raw: Record<string, unknown> = {}

  // 1. Resolve to Steam64 (vanity resolution goes through the Steam API).
  const resolution = await resolveToSteam64(opts.raw, async (vanity) =>
    steam.resolveVanity(vanity, { steam64: '', http: deps.http, getCredential, bypassCache: opts.bypassCache })
  )
  if (!resolution.steam64) {
    return { ok: false, error: resolution.error ?? 'Could not resolve input.', detectedLabel: resolution.detection.label }
  }
  const steam64 = resolution.steam64
  const ids = steam64ToSet(steam64)
  const ctx: ProviderContext = { steam64, http: deps.http, getCredential, bypassCache: opts.bypassCache }
  const local = new LocalHistoryProvider(deps.repos)

  // 2. Query Steam capabilities in parallel; BattleMetrics only if configured.
  const bmConfigured = await battlemetrics.isConfigured(getCredential)
  const bmPromise: Promise<Capability<ServerHistoryData>> = bmConfigured
    ? battlemetrics
        .getServerHistory(ctx)
        .catch<Capability<ServerHistoryData>>(() => ({ data: { servers: [] }, source: 'battlemetrics' }))
    : Promise.resolve<Capability<ServerHistoryData>>({ data: null, source: 'battlemetrics' })
  const [profileCap, levelCap, gamesCap, recentCap, securityCap, bmCap] = await Promise.all([
    steam.getPlayerProfile(ctx),
    steam.getSteamLevel(ctx),
    steam.getGames(ctx),
    steam.getRecentActivity(ctx),
    steam.getSecurityData(ctx),
    bmPromise
  ])

  for (const cap of [profileCap, levelCap, gamesCap, recentCap, securityCap, bmCap]) {
    if (cap.issue) issues.push(cap.issue)
  }
  raw.steam_summary = profileCap.raw ?? null
  raw.steam_level = levelCap.raw ?? null
  raw.steam_games = gamesCap.raw ?? null
  raw.steam_bans = securityCap.raw ?? null
  if (bmCap.raw) raw.battlemetrics = bmCap.raw

  // If Steam has no key at all, the profile call reports 'no_api_key' — fail clearly.
  if (profileCap.issue?.code === 'no_api_key') {
    return { ok: false, error: profileCap.issue.message, detectedLabel: resolution.detection.label }
  }
  if (profileCap.issue?.code === 'profile_not_found') {
    return { ok: false, error: profileCap.issue.message, detectedLabel: resolution.detection.label }
  }

  const summary = profileCap.data
  const vis = visibility(summary?.communityvisibilitystate ?? null)
  const isPrivate = vis === 'private'

  // 3. Identity.
  const identity: PlayerReport['identity'] = {
    steam64: ids.steam64,
    steam3: ids.steam3,
    steam2: ids.steam2,
    accountId: ids.accountId,
    profileUrl: ids.profileUrl,
    vanityUrl: summary?.profileurl?.includes('/id/')
      ? field(summary.profileurl.split('/id/')[1]?.replace(/\/$/, '') ?? '', 'steam', 'verified')
      : missing('steam', 'unknown', 'No custom (vanity) URL is set, or it is not public.'),
    displayName: summary?.personaname
      ? field(summary.personaname, 'steam', 'verified')
      : missing('steam', isPrivate ? 'private' : 'unknown'),
    realName: summary?.realname ? field(summary.realname, 'steam', 'verified') : missing('steam', 'unknown'),
    avatarUrl: summary?.avatarfull ? field(summary.avatarfull, 'steam', 'verified') : missing('steam', 'unknown'),
    avatarHash: summary?.avatarhash ? field(summary.avatarhash, 'steam', 'verified') : missing('steam', 'unknown'),
    countryCode: summary?.loccountrycode
      ? field(summary.loccountrycode, 'steam', 'verified')
      : missing('steam', isPrivate ? 'private' : 'unknown', 'Country is only shown when public.'),
    personaState:
      summary?.personastate != null
        ? field(personaState(summary.personastate), 'steam', 'verified')
        : missing('steam', isPrivate ? 'private' : 'unknown'),
    communityVisibility: field(vis, 'steam', summary ? 'verified' : 'unknown'),
    profileConfigured: field((summary?.profilestate ?? 0) === 1, 'steam', summary ? 'verified' : 'unknown'),
    lastLogoff: summary?.lastlogoff
      ? field(summary.lastlogoff, 'steam', 'verified')
      : missing('steam', isPrivate ? 'private' : 'unknown'),
    steamLevel:
      levelCap.data != null
        ? field(levelCap.data, 'steam', 'verified')
        : missing('steam', isPrivate ? 'private' : 'unavailable')
  }

  // 4. Account age.
  const accountAge = buildAccountAge(summary?.timecreated ?? null, isPrivate)

  // 5. Games + Rust.
  const gamesList = gamesCap.data?.games ?? []
  const gamesPrivate = gamesCap.data?.privateGameDetails ?? true
  const stats = computeGameStats(gamesList)
  const recentGames = recentCap.data ?? []

  const gStatus = gamesPrivate ? ('private' as const) : ('verified' as const)
  const games: PlayerReport['games'] = gamesPrivate
    ? {
        totalGames: missing('steam', 'private', 'Game library is private.'),
        playedGames: missing('steam', 'private'),
        neverPlayed: missing('steam', 'private'),
        totalPlaytimeMinutes: missing('steam', 'private'),
        averagePlaytimeMinutes: missing('steam', 'private'),
        medianPlaytimeMinutes: missing('steam', 'private'),
        topGames: field([], 'steam', 'private'),
        recentGames: field(recentGames, 'steam', recentGames.length ? 'verified' : 'unknown'),
        allGames: field([], 'steam', 'private')
      }
    : {
        totalGames: field(stats.total, 'steam', 'verified'),
        playedGames: field(stats.played, 'steam', 'verified'),
        neverPlayed: field(stats.neverPlayed, 'steam', 'verified'),
        totalPlaytimeMinutes: field(stats.totalMinutes, 'steam', 'verified'),
        averagePlaytimeMinutes: field(stats.averageMinutes, 'derived', 'inferred'),
        medianPlaytimeMinutes: field(stats.medianMinutes, 'derived', 'inferred'),
        topGames: field(stats.topGames, 'steam', 'verified'),
        recentGames: field(recentGames.length ? recentGames : stats.recentGames, 'steam', gStatus),
        allGames: field(gamesList, 'steam', 'verified')
      }

  const rustGame = gamesList.find((g) => g.appId === RUST_APP_ID)
  const rustRecent = recentGames.find((g) => g.appId === RUST_APP_ID)
  const rustMinutes = rustGame?.playtimeForeverMinutes ?? (rustRecent ? rustRecent.playtimeForeverMinutes : null)
  const rustRecentMin = rustGame?.playtime2weeksMinutes ?? rustRecent?.playtime2weeksMinutes ?? 0
  const totalMin = gamesPrivate ? null : stats.totalMinutes

  // 6. Assemble snapshot for history + change detection.
  const snapshot: PlayerSnapshot = {
    displayName: summary?.personaname ?? null,
    avatarHash: summary?.avatarhash ?? null,
    steamLevel: levelCap.data ?? null,
    gameCount: gamesPrivate ? null : stats.total,
    totalPlaytimeMinutes: totalMin,
    rustPlaytimeMinutes: rustGame?.playtimeForeverMinutes ?? null,
    vacBans: securityCap.data?.bans?.numberOfVacBans ?? null,
    gameBans: securityCap.data?.bans?.numberOfGameBans ?? null,
    communityBanned: securityCap.data?.bans?.communityBanned ?? null,
    visibility: summary ? visibilityLabel(summary.communityvisibilitystate) : null
  }

  const persist = opts.persist !== false
  const historyRecord = persist
    ? deps.repos.recordScan(steam64, snapshot)
    : { player: null, previousScan: deps.repos.getLatestScan(steam64) ?? null, newScan: null }

  // Change detection vs previous scan (if any).
  const previous = historyRecord.previousScan
  const changeEntries = previous
    ? diffSnapshots(
        {
          displayName: previous.display_name,
          avatarHash: previous.avatar_hash,
          steamLevel: previous.steam_level,
          gameCount: previous.game_count,
          totalPlaytimeMinutes: previous.total_playtime_min,
          rustPlaytimeMinutes: previous.rust_playtime_min,
          vacBans: previous.vac_bans,
          gameBans: previous.game_bans,
          communityBanned: previous.community_banned == null ? null : previous.community_banned === 1,
          visibility: previous.visibility
        },
        snapshot
      )
    : []

  // 7. Application history + names.
  const appHistory = local.getApplicationHistory(steam64)
  const observedNames = local.getObservedNames(steam64)
  const names: NameObservation[] = []
  if (summary?.personaname) {
    names.push({
      name: summary.personaname,
      firstSeen: appHistory.firstObserved ?? new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      source: 'steam',
      kind: 'current'
    })
  }
  for (const n of observedNames) {
    if (n.name !== summary?.personaname) names.push(n)
  }

  // 8. Servers (BattleMetrics + application-observed), Rust-focused summary.
  const bmServers = bmCap.data?.servers ?? []
  const localServers = local.getObservedServers(steam64)
  const servers: ServerObservation[] = [...bmServers, ...localServers]
  const rustServers = servers.filter((s) => /rust/i.test(s.game))

  const rust: PlayerReport['rust'] = {
    owned:
      rustGame || rustRecent
        ? field(true, 'steam', 'verified')
        : gamesPrivate
          ? missing('steam', 'private', 'Cannot confirm Rust ownership on a private library.')
          : field(false, 'steam', 'verified'),
    totalHours:
      rustMinutes != null ? field(minutesToHours(rustMinutes), 'steam', 'verified') : missing('steam', gamesPrivate ? 'private' : 'unknown'),
    recentHours: field(minutesToHours(rustRecentMin), 'steam', rustRecent || rustGame ? 'verified' : 'unknown'),
    percentOfTotalPlaytime:
      rustMinutes != null && totalMin
        ? field(Number(((rustMinutes / totalMin) * 100).toFixed(1)), 'derived', 'inferred')
        : missing('derived', 'unknown'),
    firstObserved: appHistory.firstObserved
      ? field(appHistory.firstObserved, 'application', 'inferred', 'First time THIS app observed the account.')
      : missing('application', 'unknown', 'Not yet observed by this application.'),
    lastObserved: appHistory.lastObserved
      ? field(appHistory.lastObserved, 'application', 'inferred')
      : missing('application', 'unknown'),
    serversObserved:
      rustServers.length > 0
        ? field(rustServers.length, rustServers[0].source, 'verified')
        : missing('application', 'unknown', 'No Rust server observations from authorized sources yet.'),
    lastKnownServer:
      rustServers[0] ? field(rustServers[0].serverName, rustServers[0].source, 'verified') : missing('application', 'unknown')
  }

  // 9. Bans section.
  const b = securityCap.data?.bans
  const bans: PlayerReport['bans'] = b
    ? {
        vacBanned: field(b.vacBanned, 'steam', 'verified'),
        numberOfVacBans: field(b.numberOfVacBans, 'steam', 'verified'),
        gameBanned: field(b.gameBanned, 'steam', 'verified'),
        numberOfGameBans: field(b.numberOfGameBans, 'steam', 'verified'),
        communityBanned: field(b.communityBanned, 'steam', 'verified'),
        economyBan: field(b.economyBan, 'steam', 'verified'),
        daysSinceLastBan: field(b.daysSinceLastBan, 'steam', 'verified')
      }
    : {
        vacBanned: missing('steam', 'unavailable'),
        numberOfVacBans: missing('steam', 'unavailable'),
        gameBanned: missing('steam', 'unavailable'),
        numberOfGameBans: missing('steam', 'unavailable'),
        communityBanned: missing('steam', 'unavailable'),
        economyBan: missing('steam', 'unavailable'),
        daysSinceLastBan: missing('steam', 'unavailable')
      }

  // 10. Profile score + playtime-vs-age.
  const profileScore = computeProfileScore({
    accountAgeDays: accountAge.daysSinceCreation.value,
    steamLevel: levelCap.data,
    totalGames: gamesPrivate ? null : stats.total,
    totalHours: totalMin != null ? minutesToHours(totalMin) : null,
    vacBans: b?.numberOfVacBans ?? null,
    gameBans: b?.numberOfGameBans ?? null,
    communityBanned: b?.communityBanned ?? null,
    economyBan: b?.economyBan ?? null,
    daysSinceLastBan: b?.daysSinceLastBan ?? null,
    visibility: vis
  })
  const playtimeVsAge = computePlaytimeVsAge(totalMin, accountAge.daysSinceCreation.value)

  // 11. Timeline (only real, sourced events).
  const timeline: TimelineEvent[] = []
  const createdIso = creationIso(summary?.timecreated ?? null)
  if (createdIso) timeline.push({ date: createdIso, category: 'steam', title: 'Steam account created', source: 'steam' })
  if (appHistory.firstObserved)
    timeline.push({
      date: appHistory.firstObserved,
      category: 'application',
      title: 'First seen by this application',
      source: 'application'
    })
  for (const n of observedNames)
    timeline.push({ date: n.firstSeen, category: 'name', title: `Name observed: ${n.name}`, source: 'application' })
  for (const c of changeEntries)
    if (c.kind === 'ban')
      timeline.push({ date: new Date().toISOString(), category: 'security', title: c.label, source: 'steam' })
  if (summary?.lastlogoff)
    timeline.push({
      date: new Date(summary.lastlogoff * 1000).toISOString(),
      category: 'steam',
      title: 'Last logoff',
      source: 'steam'
    })
  timeline.sort((a, z) => a.date.localeCompare(z.date))

  const sourcesUsed: DataSource[] = ['steam', 'derived', 'application']
  if (bmConfigured) sourcesUsed.push('battlemetrics')

  const report: PlayerReport = {
    input: {
      raw: opts.raw,
      detectedKind: resolution.detection.kind,
      detectedLabel: resolution.detection.label,
      resolvedViaApi: resolution.resolvedViaApi
    },
    identity,
    accountAge,
    games,
    rust,
    bans,
    servers,
    names,
    timeline,
    profileScore,
    playtimeVsAge,
    changes: {
      hasPrevious: Boolean(previous),
      previousScanAt: previous?.scanned_at ?? null,
      entries: changeEntries
    },
    application: appHistory,
    issues,
    sourcesUsed,
    generatedAt: new Date().toISOString(),
    raw
  }

  return { ok: true, report, detectedLabel: resolution.detection.label }
}
