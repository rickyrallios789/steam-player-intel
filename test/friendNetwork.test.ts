import { describe, it, expect } from 'vitest'
import { summarizeFriendNetwork } from '../src/shared/friendNetwork'
import type { FriendBanEntry } from '../src/shared/types'

const mk = (over: Partial<FriendBanEntry>): FriendBanEntry => ({
  steam64: '76561190000000000',
  name: null,
  avatarUrl: null,
  vacBans: 0,
  gameBans: 0,
  communityBanned: false,
  daysSinceLastBan: 0,
  ...over
})

describe('summarizeFriendNetwork (friend ban screening)', () => {
  it('treats a clean friend list as zero flagged', () => {
    const s = summarizeFriendNetwork([mk({ steam64: 'a' }), mk({ steam64: 'b' })])
    expect(s.friendsWithBans).toBe(0)
    expect(s.vacBanned).toBe(0)
    expect(s.gameBanned).toBe(0)
    expect(s.communityBanned).toBe(0)
    expect(s.flagged).toEqual([])
  })

  it('counts VAC, game and community bans independently', () => {
    const s = summarizeFriendNetwork([
      mk({ steam64: 'a', vacBans: 2 }),
      mk({ steam64: 'b', gameBans: 1 }),
      mk({ steam64: 'c', communityBanned: true }),
      mk({ steam64: 'd', vacBans: 1, communityBanned: true })
    ])
    expect(s.friendsWithBans).toBe(4)
    expect(s.vacBanned).toBe(2)
    expect(s.gameBanned).toBe(1)
    expect(s.communityBanned).toBe(2)
  })

  it('ranks the most-severe friends first (VAC > game > community)', () => {
    const s = summarizeFriendNetwork([
      mk({ steam64: 'community', communityBanned: true }),
      mk({ steam64: 'vac', vacBans: 1 }),
      mk({ steam64: 'game', gameBans: 1 })
    ])
    expect(s.flagged.map((f) => f.steam64)).toEqual(['vac', 'game', 'community'])
  })

  it('caps the flagged list to maxFlagged but still counts all', () => {
    const many: FriendBanEntry[] = Array.from({ length: 40 }, (_, i) => mk({ steam64: String(i), vacBans: 1 }))
    const s = summarizeFriendNetwork(many, 25)
    expect(s.friendsWithBans).toBe(40)
    expect(s.flagged.length).toBe(25)
  })
})
