/**
 * Alt-account "possible connection" leads, computed purely from the app's own
 * local scan history. (v0.10.0)
 *
 * IMPORTANT FRAMING: this surfaces *leads to review*, never proof. Two accounts
 * sharing an avatar or a similar name is a reason to look closer — nothing more.
 * People reuse avatars and names for countless innocent reasons. The UI states
 * this plainly and never labels anyone an "alt".
 *
 * Signals (all from data already stored locally):
 *  - Shared avatar image: two accounts that have used the same avatar hash, where
 *    that hash is NOT ubiquitous (shared by only a few accounts — this filters out
 *    Steam's default avatars, which would otherwise create noise).
 *  - Similar name: normalized display / observed names that match exactly, contain
 *    one another, or are within a small edit distance.
 */
export interface CorrelationPlayer {
  steam64: string
  displayName: string | null
  /** All known names for this account (current + historically observed). */
  names: string[]
  /** All distinct avatar hashes this app has seen for this account. */
  avatarHashes: string[]
}

export interface AltLead {
  a: string
  b: string
  aName: string | null
  bName: string | null
  /** Human-readable reasons this pair surfaced. */
  signals: string[]
  /** Rough strength, for sorting only — not a probability. */
  score: number
}

const MAX_PLAYERS = 500
const MAX_NAMES = 8
/** Avatar hashes shared by more than this many accounts are treated as generic (e.g. Steam defaults). */
const MAX_AVATAR_SHARE = 4
const MAX_LEADS = 100

export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Classic Levenshtein edit distance (small strings only). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  let curr = new Array<number>(b.length + 1)
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[b.length]
}

/** Best name-similarity signal between two accounts' name lists, or null. */
function nameSimilarity(
  aNames: string[],
  bNames: string[]
): { matched: [string, string]; score: number } | null {
  let best: { matched: [string, string]; score: number } | null = null
  for (const an of aNames.slice(0, MAX_NAMES)) {
    const na = normalizeName(an)
    if (na.length < 3) continue
    for (const bn of bNames.slice(0, MAX_NAMES)) {
      const nb = normalizeName(bn)
      if (nb.length < 3) continue

      let score = 0
      if (na === nb) {
        score = 3
      } else if ((na.length >= 4 && nb.includes(na)) || (nb.length >= 4 && na.includes(nb))) {
        score = 2
      } else {
        // Fuzzy match only for longer names — short names (e.g. "user1"/"user2")
        // differ by one char too easily and would create noise.
        const maxLen = Math.max(na.length, nb.length)
        const allowed = maxLen >= 8 ? 2 : 1
        if (maxLen >= 6 && Math.abs(na.length - nb.length) <= 2 && levenshtein(na, nb) <= allowed) {
          score = 2
        }
      }

      if (score > 0 && (!best || score > best.score)) best = { matched: [an, bn], score }
    }
  }
  return best
}

export function findAltLeads(players: CorrelationPlayer[]): AltLead[] {
  const list = players.slice(0, MAX_PLAYERS)

  // Map each distinctive avatar hash to the accounts that used it, then keep only
  // hashes shared by a small number of accounts (drops ubiquitous default avatars).
  const owners = new Map<string, string[]>()
  for (const p of list) {
    for (const h of new Set(p.avatarHashes)) {
      if (!h) continue
      const arr = owners.get(h) ?? []
      arr.push(p.steam64)
      owners.set(h, arr)
    }
  }
  const distinctive = new Map<string, Set<string>>() // steam64 -> distinctive hashes
  for (const [h, accounts] of owners) {
    if (accounts.length >= 2 && accounts.length <= MAX_AVATAR_SHARE) {
      for (const s of accounts) {
        const set = distinctive.get(s) ?? new Set<string>()
        set.add(h)
        distinctive.set(s, set)
      }
    }
  }

  const leads: AltLead[] = []
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]
      const b = list[j]
      const signals: string[] = []
      let score = 0

      const aH = distinctive.get(a.steam64)
      const bH = distinctive.get(b.steam64)
      if (aH && bH) {
        let shared = false
        for (const h of aH) {
          if (bH.has(h)) {
            shared = true
            break
          }
        }
        if (shared) {
          signals.push('Shared avatar image')
          score += 3
        }
      }

      const nameSim = nameSimilarity(a.names, b.names)
      if (nameSim) {
        signals.push(`Similar name: "${nameSim.matched[0]}" ↔ "${nameSim.matched[1]}"`)
        score += nameSim.score
      }

      if (score >= 2 && signals.length > 0) {
        leads.push({ a: a.steam64, b: b.steam64, aName: a.displayName, bName: b.displayName, signals, score })
      }
    }
  }

  leads.sort((x, y) => y.score - x.score)
  return leads.slice(0, MAX_LEADS)
}
