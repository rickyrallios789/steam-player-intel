import { describe, it, expect } from 'vitest'
import { SteamProvider } from '../src/main/providers/SteamProvider'
import type { ProviderContext } from '../src/main/providers/types'

function ctxWith(routes: Record<string, unknown>): ProviderContext {
  const http = {
    async getJson(url: string) {
      for (const [needle, data] of Object.entries(routes)) {
        if (url.includes(needle)) return { ok: true, status: 200, data, fromCache: false }
      }
      return { ok: false, status: 404, data: null, fromCache: false, error: 'HTTP 404' }
    },
    clearCache() {}
  }
  return {
    steam64: '76561198000000000',
    http: http as unknown as ProviderContext['http'],
    getCredential: async () => 'KEY',
    bypassCache: false
  }
}

describe('SteamProvider parsing (audit F-18)', () => {
  const steam = new SteamProvider()

  it('parses a public profile summary', async () => {
    const cap = await steam.getPlayerProfile(
      ctxWith({
        GetPlayerSummaries: {
          response: {
            players: [
              {
                steamid: '76561198000000000',
                personaname: 'Tester',
                communityvisibilitystate: 3,
                personastate: 1,
                timecreated: 1262304000,
                profileurl: 'https://steamcommunity.com/id/tester/',
                avatarfull: 'a.jpg',
                avatarhash: 'hash',
                loccountrycode: 'US',
                lastlogoff: 1600000000,
                profilestate: 1
              }
            ]
          }
        }
      })
    )
    expect(cap.issue).toBeUndefined()
    expect(cap.data?.personaname).toBe('Tester')
    expect(cap.data?.communityvisibilitystate).toBe(3)
    expect(cap.data?.timecreated).toBe(1262304000)
  })

  it('flags a not-found profile without fabricating data', async () => {
    const cap = await steam.getPlayerProfile(ctxWith({ GetPlayerSummaries: { response: { players: [] } } }))
    expect(cap.data).toBeNull()
    expect(cap.issue?.code).toBe('profile_not_found')
  })

  it('treats a private library (no games array) as private, not empty', async () => {
    const cap = await steam.getGames(ctxWith({ GetOwnedGames: { response: {} } }))
    expect(cap.data?.privateGameDetails).toBe(true)
    expect(cap.data?.games).toEqual([])
    expect(cap.issue?.code).toBe('private_games')
  })

  it('parses owned games with playtime', async () => {
    const cap = await steam.getGames(
      ctxWith({
        GetOwnedGames: {
          response: {
            game_count: 2,
            games: [
              { appid: 252490, name: 'Rust', playtime_forever: 12000, playtime_2weeks: 120, img_icon_url: 'abc' },
              { appid: 730, name: 'CS', playtime_forever: 6000 }
            ]
          }
        }
      })
    )
    expect(cap.data?.privateGameDetails).toBe(false)
    expect(cap.data?.games.length).toBe(2)
    expect(cap.data?.games[0].playtimeForeverMinutes).toBe(12000)
  })

  it('parses ban records', async () => {
    const cap = await steam.getSecurityData(
      ctxWith({
        GetPlayerBans: {
          players: [
            {
              SteamId: '76561198000000000',
              VACBanned: true,
              NumberOfVACBans: 2,
              NumberOfGameBans: 0,
              CommunityBanned: false,
              EconomyBan: 'none',
              DaysSinceLastBan: 100
            }
          ]
        }
      })
    )
    expect(cap.data?.bans?.vacBanned).toBe(true)
    expect(cap.data?.bans?.numberOfVacBans).toBe(2)
  })
})
