/**
 * Provider architecture (spec §30, §31).
 *
 * Every data source implements the same DataProvider interface so sources can be
 * added or removed without rewriting the app. Capability methods are optional —
 * a provider only implements what it can legitimately supply. Each result is
 * tagged with its source, and failures surface as a ProviderIssue (never a crash).
 */
import type { HttpClient } from '../core/httpClient'
import type { DataSource, GameStat, ServerObservation, NameObservation } from '../../shared/types'

export interface ProviderIssue {
  provider: string
  code: string
  message: string
}

export interface ProviderContext {
  steam64: string
  http: HttpClient
  /** Resolve a stored credential by name (async, main-process only). */
  getCredential: (name: string) => Promise<string | null>
  bypassCache?: boolean
}

export interface Capability<T> {
  data: T | null
  source: DataSource
  issue?: ProviderIssue
  /** Raw payload for the transparency ("Raw Data") tab. */
  raw?: unknown
  fromCache?: boolean
  cachedAt?: string
  /** True when served as last-known-good because the live fetch failed. (audit F-12) */
  stale?: boolean
}

// ---- Normalized capability payloads ----

export interface SteamSummaryData {
  steamid: string
  personaname: string | null
  profileurl: string | null
  avatarfull: string | null
  avatarhash: string | null
  personastate: number | null
  communityvisibilitystate: number | null
  profilestate: number | null
  lastlogoff: number | null
  timecreated: number | null
  loccountrycode: string | null
  realname: string | null
}

export interface SteamBansData {
  vacBanned: boolean
  numberOfVacBans: number
  gameBanned: boolean
  numberOfGameBans: number
  communityBanned: boolean
  economyBan: string
  daysSinceLastBan: number
}

export interface GamesData {
  games: GameStat[]
  /** True when the games list is hidden by the account's privacy settings. */
  privateGameDetails: boolean
}

export interface SecurityData {
  bans: SteamBansData | null
}

export interface ServerHistoryData {
  servers: ServerObservation[]
}

export interface NameHistoryData {
  names: NameObservation[]
}

/**
 * The common provider interface. All methods are optional; the ProviderManager
 * calls whatever a given provider implements and merges the tagged results.
 */
export interface DataProvider {
  readonly id: string
  readonly name: string
  readonly source: DataSource
  isConfigured(getCredential: ProviderContext['getCredential']): Promise<boolean>

  resolveVanity?(vanity: string, ctx: ProviderContext): Promise<string | null>
  getPlayerProfile?(ctx: ProviderContext): Promise<Capability<SteamSummaryData>>
  getSteamLevel?(ctx: ProviderContext): Promise<Capability<number>>
  getGames?(ctx: ProviderContext): Promise<Capability<GamesData>>
  getRecentActivity?(ctx: ProviderContext): Promise<Capability<GameStat[]>>
  getSecurityData?(ctx: ProviderContext): Promise<Capability<SecurityData>>
  getServerHistory?(ctx: ProviderContext): Promise<Capability<ServerHistoryData>>
  getNameHistory?(ctx: ProviderContext): Promise<Capability<NameHistoryData>>
}

/** Friendly messages for common failure codes (spec §26). */
export const FRIENDLY_MESSAGES: Record<string, string> = {
  no_api_key:
    'A Steam Web API key has not been configured yet. Add one in Settings to enable Steam lookups.',
  private_profile:
    'This Steam profile is private, so some information could not be retrieved. Public fields are still shown where available.',
  private_games:
    'This player’s game details are private. Game and playtime data cannot be shown for a private library.',
  profile_not_found: 'No Steam account was found for that ID.',
  rate_limited: 'Steam is rate-limiting requests right now. Please try again in a moment.',
  api_unavailable:
    'The Steam Web API could not be reached. This is usually temporary — check your connection and retry.',
  bm_unavailable: 'BattleMetrics data is unavailable. Steam-sourced information is unaffected.',
  bm_no_token:
    'No BattleMetrics API token is configured. Server history from BattleMetrics is disabled until one is added in Settings.',
  vanity_unresolved: 'That custom URL / vanity name does not match any Steam account.',
  source_timeout: 'A data source timed out. Other sources continued normally.'
}

export function issue(provider: string, code: string, override?: string): ProviderIssue {
  return { provider, code, message: override ?? FRIENDLY_MESSAGES[code] ?? 'An unexpected error occurred.' }
}
