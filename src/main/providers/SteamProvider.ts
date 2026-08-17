/**
 * SteamProvider — the primary, official data source (spec §2, §31).
 *
 * Wraps the Steam Web API. Runs in the main process; the API key is read from
 * the secure credential store and attached here, never exposed to the renderer.
 * Respects privacy: when Steam returns no data because a profile/library is
 * private, we surface that as an issue and null data — we never fabricate.
 */
import type {
  Capability,
  DataProvider,
  GamesData,
  ProviderContext,
  SecurityData,
  SteamSummaryData
} from './types'
import { issue } from './types'
import type { GameStat } from '../../shared/types'

const STEAM_HOST = 'api.steampowered.com'
const BASE = `https://${STEAM_HOST}`

const TTL = {
  summary: 2 * 60_000,
  bans: 5 * 60_000,
  games: 5 * 60_000,
  level: 10 * 60_000,
  recent: 2 * 60_000
}

function gameIcon(appid: number, hash: string | null | undefined): string | null {
  return hash
    ? `https://media.steampowered.com/steamcommunity/public/images/apps/${appid}/${hash}.jpg`
    : null
}

interface RawSummary {
  response?: { players?: Array<Record<string, unknown>> }
}
interface RawBans {
  players?: Array<Record<string, unknown>>
}
interface RawOwned {
  response?: { game_count?: number; games?: Array<Record<string, unknown>> }
}
interface RawLevel {
  response?: { player_level?: number }
}
interface RawVanity {
  response?: { success?: number; steamid?: string; message?: string }
}

export class SteamProvider implements DataProvider {
  readonly id = 'steam'
  readonly name = 'Steam Web API'
  readonly source = 'steam' as const

  async isConfigured(getCredential: ProviderContext['getCredential']): Promise<boolean> {
    return Boolean(await getCredential('STEAM_API_KEY'))
  }

  private async key(ctx: ProviderContext): Promise<string | null> {
    return ctx.getCredential('STEAM_API_KEY')
  }

  async resolveVanity(vanity: string, ctx: ProviderContext): Promise<string | null> {
    const key = await this.key(ctx)
    if (!key) return null
    const url = `${BASE}/ISteamUser/ResolveVanityURL/v1/?key=${key}&vanityurl=${encodeURIComponent(vanity)}`
    const res = await ctx.http.getJson<RawVanity>(url, {
      host: STEAM_HOST,
      cacheKey: `vanity:${vanity}`,
      cacheTtlMs: 10 * 60_000,
      bypassCache: ctx.bypassCache
    })
    if (res.ok && res.data?.response?.success === 1 && res.data.response.steamid) {
      return res.data.response.steamid
    }
    return null
  }

  async getPlayerProfile(ctx: ProviderContext): Promise<Capability<SteamSummaryData>> {
    const key = await this.key(ctx)
    if (!key) return { data: null, source: 'steam', issue: issue(this.name, 'no_api_key') }

    const url = `${BASE}/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${ctx.steam64}`
    const res = await ctx.http.getJson<RawSummary>(url, {
      host: STEAM_HOST,
      cacheKey: `summary:${ctx.steam64}`,
      cacheTtlMs: TTL.summary,
      bypassCache: ctx.bypassCache
    })
    if (!res.ok) {
      return { data: null, source: 'steam', issue: issue(this.name, res.status === 429 ? 'rate_limited' : 'api_unavailable'), raw: res.data }
    }
    const p = res.data?.response?.players?.[0]
    if (!p) {
      return { data: null, source: 'steam', issue: issue(this.name, 'profile_not_found'), raw: res.data }
    }
    const data: SteamSummaryData = {
      steamid: String(p.steamid ?? ctx.steam64),
      personaname: (p.personaname as string) ?? null,
      profileurl: (p.profileurl as string) ?? null,
      avatarfull: (p.avatarfull as string) ?? null,
      avatarhash: (p.avatarhash as string) ?? null,
      personastate: typeof p.personastate === 'number' ? p.personastate : null,
      communityvisibilitystate:
        typeof p.communityvisibilitystate === 'number' ? p.communityvisibilitystate : null,
      profilestate: typeof p.profilestate === 'number' ? p.profilestate : null,
      lastlogoff: typeof p.lastlogoff === 'number' ? p.lastlogoff : null,
      timecreated: typeof p.timecreated === 'number' ? p.timecreated : null,
      loccountrycode: (p.loccountrycode as string) ?? null,
      realname: (p.realname as string) ?? null
    }
    return { data, source: 'steam', raw: p, fromCache: res.fromCache, cachedAt: res.cachedAt, stale: res.stale }
  }

  async getSteamLevel(ctx: ProviderContext): Promise<Capability<number>> {
    const key = await this.key(ctx)
    if (!key) return { data: null, source: 'steam', issue: issue(this.name, 'no_api_key') }
    const url = `${BASE}/IPlayerService/GetSteamLevel/v1/?key=${key}&steamid=${ctx.steam64}`
    const res = await ctx.http.getJson<RawLevel>(url, {
      host: STEAM_HOST,
      cacheKey: `level:${ctx.steam64}`,
      cacheTtlMs: TTL.level,
      bypassCache: ctx.bypassCache
    })
    const level = res.data?.response?.player_level
    if (!res.ok || typeof level !== 'number') {
      return { data: null, source: 'steam', issue: issue(this.name, 'private_profile'), raw: res.data }
    }
    return { data: level, source: 'steam', raw: res.data?.response, fromCache: res.fromCache, cachedAt: res.cachedAt, stale: res.stale }
  }

  async getGames(ctx: ProviderContext): Promise<Capability<GamesData>> {
    const key = await this.key(ctx)
    if (!key) return { data: null, source: 'steam', issue: issue(this.name, 'no_api_key') }
    const url =
      `${BASE}/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${ctx.steam64}` +
      `&include_appinfo=1&include_played_free_games=1&include_free_sub=0`
    const res = await ctx.http.getJson<RawOwned>(url, {
      host: STEAM_HOST,
      cacheKey: `games:${ctx.steam64}`,
      cacheTtlMs: TTL.games,
      bypassCache: ctx.bypassCache
    })
    if (!res.ok) {
      return { data: null, source: 'steam', issue: issue(this.name, 'api_unavailable'), raw: res.data }
    }
    const resp = res.data?.response
    // A private library returns an empty response object (no `games` array).
    if (!resp || resp.games == null) {
      return {
        data: { games: [], privateGameDetails: true },
        source: 'steam',
        issue: issue(this.name, 'private_games'),
        raw: res.data
      }
    }
    const games: GameStat[] = resp.games.map((g) => {
      const appId = Number(g.appid)
      return {
        appId,
        name: (g.name as string) ?? null,
        playtimeForeverMinutes: Number(g.playtime_forever ?? 0),
        playtime2weeksMinutes: Number(g.playtime_2weeks ?? 0),
        iconUrl: gameIcon(appId, g.img_icon_url as string),
        lastPlayed: typeof g.rtime_last_played === 'number' ? g.rtime_last_played : null
      }
    })
    return {
      data: { games, privateGameDetails: false },
      source: 'steam',
      raw: { game_count: resp.game_count },
      fromCache: res.fromCache,
      cachedAt: res.cachedAt,
      stale: res.stale
    }
  }

  async getRecentActivity(ctx: ProviderContext): Promise<Capability<GameStat[]>> {
    const key = await this.key(ctx)
    if (!key) return { data: null, source: 'steam', issue: issue(this.name, 'no_api_key') }
    const url = `${BASE}/IPlayerService/GetRecentlyPlayedGames/v1/?key=${key}&steamid=${ctx.steam64}`
    const res = await ctx.http.getJson<RawOwned>(url, {
      host: STEAM_HOST,
      cacheKey: `recent:${ctx.steam64}`,
      cacheTtlMs: TTL.recent,
      bypassCache: ctx.bypassCache
    })
    if (!res.ok || !res.data?.response?.games) {
      return { data: [], source: 'steam', raw: res.data, fromCache: res.fromCache, cachedAt: res.cachedAt, stale: res.stale }
    }
    const games: GameStat[] = res.data.response.games.map((g) => {
      const appId = Number(g.appid)
      return {
        appId,
        name: (g.name as string) ?? null,
        playtimeForeverMinutes: Number(g.playtime_forever ?? 0),
        playtime2weeksMinutes: Number(g.playtime_2weeks ?? 0),
        iconUrl: gameIcon(appId, g.img_icon_url as string)
      }
    })
    return { data: games, source: 'steam', fromCache: res.fromCache, cachedAt: res.cachedAt, stale: res.stale }
  }

  async getSecurityData(ctx: ProviderContext): Promise<Capability<SecurityData>> {
    const key = await this.key(ctx)
    if (!key) return { data: null, source: 'steam', issue: issue(this.name, 'no_api_key') }
    const url = `${BASE}/ISteamUser/GetPlayerBans/v1/?key=${key}&steamids=${ctx.steam64}`
    const res = await ctx.http.getJson<RawBans>(url, {
      host: STEAM_HOST,
      cacheKey: `bans:${ctx.steam64}`,
      cacheTtlMs: TTL.bans,
      bypassCache: ctx.bypassCache
    })
    const p = res.data?.players?.[0]
    if (!res.ok || !p) {
      return { data: { bans: null }, source: 'steam', issue: issue(this.name, 'api_unavailable'), raw: res.data }
    }
    return {
      data: {
        bans: {
          vacBanned: Boolean(p.VACBanned),
          numberOfVacBans: Number(p.NumberOfVACBans ?? 0),
          gameBanned: Number(p.NumberOfGameBans ?? 0) > 0,
          numberOfGameBans: Number(p.NumberOfGameBans ?? 0),
          communityBanned: Boolean(p.CommunityBanned),
          economyBan: String(p.EconomyBan ?? 'none'),
          daysSinceLastBan: Number(p.DaysSinceLastBan ?? 0)
        }
      },
      source: 'steam',
      raw: p,
      fromCache: res.fromCache,
      cachedAt: res.cachedAt,
      stale: res.stale
    }
  }
}
