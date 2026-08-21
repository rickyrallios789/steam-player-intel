/**
 * BattleMetricsProvider — OPTIONAL, authorized-only (spec §8, §31).
 *
 * BattleMetrics only exposes Steam-ID → player matching and player identifiers
 * to tokens that have been granted the appropriate access. This provider uses
 * the official API with the user's own Bearer token and NEVER attempts to bypass
 * authentication, rate limits or access controls. If a token is missing or the
 * account lacks permission, it returns a clear "unavailable" issue and null data
 * so the rest of the app keeps working. No server data is ever invented.
 */
import type {
  Capability,
  DataProvider,
  ProviderContext,
  ServerHistoryData
} from './types'
import { issue } from './types'
import type { ServerObservation } from '../../shared/types'
import { extractMatchPlayerId, extractSearchPlayerId, type BmRelPlayer } from '../../shared/battleMetricsMatch'

const BM_HOST = 'api.battlemetrics.com'
const BASE = `https://${BM_HOST}`

interface BmMatchResponse {
  data?: Array<{ type: string; id: string; relationships?: BmRelPlayer }>
}
interface BmIncluded {
  type: string
  id: string
  attributes?: Record<string, unknown>
  relationships?: BmRelPlayer
  meta?: Record<string, unknown>
}
interface BmPlayerResponse {
  included?: BmIncluded[]
}
interface BmSearchResponse {
  data?: Array<{ type: string; id: string }>
  included?: BmIncluded[]
}

export class BattleMetricsProvider implements DataProvider {
  readonly id = 'battlemetrics'
  readonly name = 'BattleMetrics'
  readonly source = 'battlemetrics' as const

  async isConfigured(getCredential: ProviderContext['getCredential']): Promise<boolean> {
    return Boolean(await getCredential('BATTLEMETRICS_API_TOKEN'))
  }

  private async authedGetJson<T>(
    url: string,
    token: string
  ): Promise<{ ok: boolean; status: number; data: T | null }> {
    // We inline fetch here (rather than the shared client) so the Authorization
    // header is attached in the main process only. BattleMetrics' own 429 handling
    // is respected by returning the status upward instead of silently retrying.
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }
      })
      const text = await res.text()
      let data: unknown = null
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        data = null
      }
      return { ok: res.ok, status: res.status, data: data as T }
    } catch {
      return { ok: false, status: 0, data: null }
    }
  }

  /**
   * Steam64 → BattleMetrics player id. Tries two strategies, most-authoritative first:
   *   1. POST /players/match  — the quick-match endpoint (needs a token with the right
   *      access, e.g. RCON/organization scope). The player id is under
   *      relationships.player.data.id (NOT data[0].id, which is the identifier's own id).
   *   2. GET /players?filter[search]=<steam64>&include=identifier — the public search,
   *      which some tokens can use where /players/match is denied. We ONLY accept a
   *      result whose returned steamID identifier EXACTLY equals the queried id, so we
   *      never guess or fabricate a match.
   */
  private async matchPlayer(ctx: ProviderContext, token: string): Promise<string | null> {
    return (
      (await this.matchViaQuickMatch(ctx.steam64, token)) ?? (await this.matchViaSearch(ctx.steam64, token))
    )
  }

  private async matchViaQuickMatch(steam64: string, token: string): Promise<string | null> {
    try {
      const res = await fetch(`${BASE}/players/match`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          data: [{ type: 'identifier', attributes: { type: 'steamID', identifier: steam64 } }]
        })
      })
      if (!res.ok) return null
      return extractMatchPlayerId((await res.json()) as BmMatchResponse)
    } catch {
      return null
    }
  }

  private async matchViaSearch(steam64: string, token: string): Promise<string | null> {
    const url = `${BASE}/players?filter[search]=${encodeURIComponent(steam64)}&include=identifier&page[size]=10`
    const res = await this.authedGetJson<BmSearchResponse>(url, token)
    if (!res.ok) return null
    // Only trust an EXACT steamID identifier match — never a coincidental name hit.
    return extractSearchPlayerId(res.data, steam64)
  }

  async getServerHistory(ctx: ProviderContext): Promise<Capability<ServerHistoryData>> {
    const token = await ctx.getCredential('BATTLEMETRICS_API_TOKEN')
    if (!token) {
      return { data: null, source: 'battlemetrics', issue: issue(this.name, 'bm_no_token') }
    }

    const playerId = await this.matchPlayer(ctx, token)
    if (!playerId) {
      // Either no match, or the token lacks identifier-search permission.
      return {
        data: { servers: [] },
        source: 'battlemetrics',
        issue: issue(
          this.name,
          'bm_unavailable',
          'BattleMetrics did not return a match for this Steam ID with your token. BattleMetrics only resolves a Steam ID to a player for tokens that have the right access — typically RCON / admin access to a server the player has been on. Apps tied to specific servers (or with server-side access) can show this where a personal read-only token cannot. All Steam-sourced data above is unaffected.'
        )
      }
    }

    const url = `${BASE}/players/${playerId}?include=server`
    const res = await this.authedGetJson<BmPlayerResponse>(url, token)
    if (!res.ok || !res.data) {
      return { data: { servers: [], playerId }, source: 'battlemetrics', issue: issue(this.name, 'bm_unavailable') }
    }

    const servers: ServerObservation[] = (res.data.included ?? [])
      .filter((i) => i.type === 'server')
      .map((s) => {
        const a = s.attributes ?? {}
        const m = s.meta ?? {}
        return {
          serverName: String(a.name ?? 'Unknown server'),
          serverId: s.id,
          ip: (a.ip as string) ?? null,
          game: String(a.game ?? 'unknown'),
          region: (a.country as string) ?? null,
          firstSeen: String((m.firstSeen as string) ?? ''),
          lastSeen: String((m.lastSeen as string) ?? ''),
          observations: Number(m.timePlayed ?? 0) > 0 ? 1 : 0,
          source: 'battlemetrics',
          status: 'unknown'
        }
      })

    return { data: { servers, playerId }, source: 'battlemetrics', raw: res.data }
  }
}
