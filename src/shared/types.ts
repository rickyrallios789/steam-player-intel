/**
 * Shared domain types for the player report.
 *
 * Design principle (spec §18, §33, §34): every meaningful data point carries a
 * value, a SOURCE, a STATUS/confidence and a timestamp. Missing data is
 * represented explicitly (status 'private' | 'unavailable' | 'unknown') and is
 * never fabricated.
 */

export type DataSource =
  | 'steam' // Steam Web API
  | 'battlemetrics' // BattleMetrics API (authorized)
  | 'application' // This app's own observation history
  | 'derived' // Computed from other sourced fields
  | 'other'

export type FieldStatus =
  | 'verified' // directly returned by an authoritative source
  | 'estimated' // best-effort estimate, clearly not exact
  | 'inferred' // derived/computed from other data
  | 'unknown' // source did not provide it
  | 'unavailable' // source exists but could not be queried
  | 'private' // exists but hidden by the account's privacy settings

export interface Field<T> {
  value: T | null
  source: DataSource
  status: FieldStatus
  /** ISO timestamp of when this value was obtained. */
  updatedAt: string
  /** Optional human note, e.g. "from public `timecreated`" or "assumes continuous play". */
  note?: string
}

export function field<T>(
  value: T | null,
  source: DataSource,
  status: FieldStatus,
  note?: string
): Field<T> {
  return { value, source, status, updatedAt: new Date().toISOString(), note }
}

/** A field that is known to be missing for a stated reason. */
export function missing<T>(
  source: DataSource,
  status: Extract<FieldStatus, 'unknown' | 'unavailable' | 'private'>,
  note?: string
): Field<T> {
  return { value: null, source, status, updatedAt: new Date().toISOString(), note }
}

export interface ProviderIssue {
  provider: string
  /** Machine code used to pick a friendly message, e.g. 'private_profile'. */
  code: string
  /** Already human-readable message safe to show a normal user. */
  message: string
}

export interface GameStat {
  appId: number
  name: string | null
  playtimeForeverMinutes: number
  playtime2weeksMinutes: number
  iconUrl: string | null
  lastPlayed?: number | null // unix seconds when available
}

export interface OwnedGamesSummary {
  totalGames: Field<number>
  playedGames: Field<number>
  neverPlayed: Field<number>
  totalPlaytimeMinutes: Field<number>
  averagePlaytimeMinutes: Field<number>
  medianPlaytimeMinutes: Field<number>
  topGames: Field<GameStat[]>
  recentGames: Field<GameStat[]>
  allGames: Field<GameStat[]>
}

export interface BanInfo {
  vacBanned: Field<boolean>
  numberOfVacBans: Field<number>
  gameBanned: Field<boolean>
  numberOfGameBans: Field<number>
  communityBanned: Field<boolean>
  economyBan: Field<string> // 'none' | 'probation' | 'banned' | ...
  daysSinceLastBan: Field<number>
}

export interface AccountAgeInfo {
  createdAt: Field<number> // unix seconds
  ageYears: Field<number>
  ageText: Field<string> // e.g. "8 years, 4 months"
  daysSinceCreation: Field<number>
  approxCreationYear: Field<number>
}

export interface RustSummary {
  owned: Field<boolean>
  totalHours: Field<number>
  recentHours: Field<number>
  percentOfTotalPlaytime: Field<number>
  firstObserved: Field<string> // application history
  lastObserved: Field<string>
  serversObserved: Field<number>
  lastKnownServer: Field<string>
}

export interface ServerObservation {
  serverName: string
  serverId: string | null
  ip: string | null
  game: string
  region: string | null
  firstSeen: string
  lastSeen: string
  observations: number
  source: DataSource
  status: 'online' | 'offline' | 'unknown'
}

export interface NameObservation {
  name: string
  firstSeen: string
  lastSeen: string
  source: DataSource
  /** 'current' = the name Steam reports now; 'observed' = seen historically by a source. */
  kind: 'current' | 'observed'
}

export interface TimelineEvent {
  date: string // ISO
  category: 'steam' | 'rust' | 'game' | 'server' | 'name' | 'security' | 'application'
  title: string
  detail?: string
  source: DataSource
}

export interface ProfileScore {
  /** 0..100 informational only. Higher = more items warranting attention, NOT proof of anything. */
  score: number
  band: 'LOW CONCERN' | 'MODERATE' | 'ELEVATED' | 'INSUFFICIENT DATA'
  summary: string
  factors: Array<{ label: string; detail: string; direction: 'neutral' | 'attention'; points: number }>
  disclaimer: string
}

export interface PlaytimeVsAge {
  computable: boolean
  hoursPerDay: number | null
  totalHours: number | null
  accountAgeDays: number | null
  unusual: boolean
  note: string
}

export type PersonaState = 'offline' | 'online' | 'busy' | 'away' | 'snooze' | 'looking-to-trade' | 'looking-to-play'
export type CommunityVisibility = 'private' | 'friends-only' | 'public' | 'unknown'

export interface PlayerIdentity {
  steam64: string
  steam3: string
  steam2: string
  accountId: string
  profileUrl: string
  vanityUrl: Field<string>
  displayName: Field<string>
  realName: Field<string>
  avatarUrl: Field<string>
  avatarHash: Field<string>
  countryCode: Field<string>
  personaState: Field<PersonaState>
  communityVisibility: Field<CommunityVisibility>
  profileConfigured: Field<boolean>
  lastLogoff: Field<number> // unix seconds
  steamLevel: Field<number>
}

export interface ChangeEntry {
  field: string
  label: string
  before: string | number | boolean | null
  after: string | number | boolean | null
  kind: 'name' | 'avatar' | 'level' | 'games' | 'playtime' | 'ban' | 'privacy' | 'server' | 'rust'
}

export interface PlayerReport {
  input: {
    raw: string
    detectedKind: string
    detectedLabel: string
    resolvedViaApi: boolean
  }
  identity: PlayerIdentity
  accountAge: AccountAgeInfo
  games: OwnedGamesSummary
  rust: RustSummary
  bans: BanInfo
  servers: ServerObservation[]
  names: NameObservation[]
  timeline: TimelineEvent[]
  profileScore: ProfileScore
  playtimeVsAge: PlaytimeVsAge
  /** Set only when a previous scan exists in the local DB. */
  changes: {
    hasPrevious: boolean
    previousScanAt: string | null
    entries: ChangeEntry[]
  }
  application: {
    firstObserved: string | null
    lastObserved: string | null
    scanCount: number
  }
  issues: ProviderIssue[]
  sourcesUsed: DataSource[]
  generatedAt: string
  /** Raw, source-tagged payloads for the "Raw Data" tab. Never shown as if normalized. */
  raw: Record<string, unknown>
}

export const RUST_APP_ID = 252490
