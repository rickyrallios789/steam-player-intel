import { describe, it, expect } from 'vitest'
import { analyzePlayer, type AnalyzeDeps } from '../src/main/services/analyzePlayer'

const STEAM64 = '76561198000000000'
type Route = { ok?: boolean; status?: number; data: unknown }

function deps(routes: Record<string, Route>): AnalyzeDeps {
  const http = {
    async getJson(url: string) {
      for (const [needle, r] of Object.entries(routes)) {
        if (url.includes(needle)) return { ok: r.ok ?? true, status: r.status ?? 200, data: r.data, fromCache: false }
      }
      return { ok: false, status: 404, data: null, fromCache: false, error: 'HTTP 404' }
    },
    clearCache() {}
  }
  const repos = {
    getPlayer: () => null,
    getNameObservations: () => [],
    getServerObservations: () => [],
    recordScan: () => ({ player: { first_observed: null, last_observed: null, scan_count: 1 }, previousScan: null, newScan: null }),
    getLatestScan: () => null
  }
  return {
    http: http as unknown as AnalyzeDeps['http'],
    credentials: { get: async (n: string) => (n === 'STEAM_API_KEY' ? 'KEY' : null) } as unknown as AnalyzeDeps['credentials'],
    repos: repos as unknown as AnalyzeDeps['repos']
  }
}

const publicRoutes: Record<string, Route> = {
  GetPlayerSummaries: {
    data: {
      response: {
        players: [
          {
            steamid: STEAM64,
            personaname: 'PublicGuy',
            communityvisibilitystate: 3,
            personastate: 1,
            timecreated: 1262304000,
            profileurl: 'https://steamcommunity.com/id/x/',
            avatarfull: 'a.jpg',
            avatarhash: 'h',
            loccountrycode: 'US',
            lastlogoff: 1600000000,
            profilestate: 1
          }
        ]
      }
    }
  },
  GetSteamLevel: { data: { response: { player_level: 42 } } },
  GetOwnedGames: {
    data: {
      response: {
        game_count: 2,
        games: [
          { appid: 252490, name: 'Rust', playtime_forever: 12000, playtime_2weeks: 120 },
          { appid: 730, name: 'CS', playtime_forever: 6000 }
        ]
      }
    }
  },
  GetRecentlyPlayedGames: { data: { response: { games: [{ appid: 252490, name: 'Rust', playtime_2weeks: 120, playtime_forever: 12000 }] } } },
  GetPlayerBans: {
    data: {
      players: [
        { SteamId: STEAM64, VACBanned: false, NumberOfVACBans: 0, NumberOfGameBans: 0, CommunityBanned: false, EconomyBan: 'none', DaysSinceLastBan: 0 }
      ]
    }
  }
}

describe('analyzePlayer integration (audit F-18)', () => {
  it('builds a verified report for a public profile', async () => {
    const res = await analyzePlayer(deps(publicRoutes), { raw: STEAM64 })
    expect(res.ok).toBe(true)
    const r = res.report!
    expect(r.identity.displayName.value).toBe('PublicGuy')
    expect(r.identity.communityVisibility.value).toBe('public')
    expect(r.accountAge.createdAt.status).toBe('verified')
    expect(r.games.totalGames.value).toBe(2)
    expect(r.rust.owned.value).toBe(true)
    expect(r.rust.totalHours.value).toBe(200)
    expect(r.bans.numberOfVacBans.value).toBe(0)
  })

  it('labels a private profile as private without fabricating', async () => {
    const privateRoutes: Record<string, Route> = {
      GetPlayerSummaries: { data: { response: { players: [{ steamid: STEAM64, personaname: 'PrivGuy', communityvisibilitystate: 1, personastate: 0, profilestate: 1 }] } } },
      GetSteamLevel: { data: { response: {} } },
      GetOwnedGames: { data: { response: {} } },
      GetRecentlyPlayedGames: { ok: false, status: 401, data: null },
      GetPlayerBans: { data: { players: [{ SteamId: STEAM64, VACBanned: false, NumberOfVACBans: 0, NumberOfGameBans: 0, CommunityBanned: false, EconomyBan: 'none', DaysSinceLastBan: 0 }] } }
    }
    const res = await analyzePlayer(deps(privateRoutes), { raw: STEAM64 })
    expect(res.ok).toBe(true)
    const r = res.report!
    expect(r.identity.communityVisibility.value).toBe('private')
    expect(r.accountAge.createdAt.status).toBe('private')
    expect(r.games.totalGames.value).toBeNull()
  })

  it('stays resilient when the bans source fails (partial failure)', async () => {
    const routes: Record<string, Route> = { ...publicRoutes, GetPlayerBans: { ok: false, status: 500, data: null } }
    const res = await analyzePlayer(deps(routes), { raw: STEAM64 })
    expect(res.ok).toBe(true)
    expect(res.report!.bans.numberOfVacBans.value).toBeNull()
    expect(res.report!.identity.displayName.value).toBe('PublicGuy')
  })
})
