/**
 * Aggregate a screened friend list into ban counts + a ranked list of leads. (v0.6.0)
 *
 * Pure and side-effect free so it can be unit-tested and reused. It only counts
 * public ban records — it makes NO judgement about the profile whose friends
 * these are. A friend with a ban is a lead to investigate, never proof that the
 * profile itself did anything.
 */
import type { FriendBanEntry } from './types'

export interface FriendNetworkSummary {
  friendsWithBans: number
  vacBanned: number
  gameBanned: number
  communityBanned: number
  /** Banned friends, most-severe first, capped to maxFlagged. */
  flagged: FriendBanEntry[]
}

/** Rough severity ordering: VAC > game ban > community, with ban counts as tie-breakers. */
function severity(f: FriendBanEntry): number {
  return (
    (f.vacBans > 0 ? 1000 : 0) +
    (f.gameBans > 0 ? 500 : 0) +
    (f.communityBanned ? 100 : 0) +
    f.vacBans * 10 +
    f.gameBans
  )
}

export function summarizeFriendNetwork(friends: FriendBanEntry[], maxFlagged = 25): FriendNetworkSummary {
  let vacBanned = 0
  let gameBanned = 0
  let communityBanned = 0
  const banned: FriendBanEntry[] = []

  for (const f of friends) {
    if (f.vacBans > 0) vacBanned++
    if (f.gameBans > 0) gameBanned++
    if (f.communityBanned) communityBanned++
    if (f.vacBans > 0 || f.gameBans > 0 || f.communityBanned) banned.push(f)
  }

  banned.sort((a, b) => severity(b) - severity(a))

  return {
    friendsWithBans: banned.length,
    vacBanned,
    gameBanned,
    communityBanned,
    flagged: banned.slice(0, maxFlagged)
  }
}
