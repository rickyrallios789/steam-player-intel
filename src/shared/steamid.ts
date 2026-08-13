/**
 * Steam ID detection, validation and normalization.
 *
 * Pure, dependency-free logic. Everything here is deterministic maths on the
 * 64-bit SteamID and can be unit-tested in plain Node (see test/steamid.test.ts).
 *
 * Vanity names / custom URLs cannot be resolved offline — they require Steam's
 * ResolveVanityURL Web API. This module DETECTS them and hands them to a
 * resolver callback; it never guesses a SteamID for a vanity name.
 */

/** Magic offset for an individual account: 0x0110000100000000. */
export const STEAM64_INDIVIDUAL_BASE = 76561197960265728n
const MAX_ACCOUNT_ID = 4294967295n // 2^32 - 1

export type SteamInputKind =
  | 'steam64'
  | 'steam3'
  | 'steam2'
  | 'profileUrl' // steamcommunity.com/profiles/<steam64>
  | 'vanityUrl'  // steamcommunity.com/id/<vanity>
  | 'vanity'     // bare custom name
  | 'unknown'

export interface DetectionResult {
  /** What the raw input looks like. */
  kind: SteamInputKind
  /** Present when the input could be resolved to a 64-bit id without a network call. */
  steam64?: string
  /** Present for vanity/vanityUrl kinds — the name that must be resolved via the Steam API. */
  vanity?: string
  /** Human friendly label, e.g. "Steam64 ID", "Steam3 ID", "Vanity URL". */
  label: string
  /** The cleaned-up input we actually parsed. */
  normalizedInput: string
}

export interface SteamIdSet {
  steam64: string
  steam3: string
  steam2: string
  accountId: string
  profileUrl: string
  /** Only known after a successful vanity resolution. */
  vanityUrl?: string
}

const KIND_LABELS: Record<SteamInputKind, string> = {
  steam64: 'Steam64 ID',
  steam3: 'Steam3 ID',
  steam2: 'Steam2 ID',
  profileUrl: 'Steam Profile URL',
  vanityUrl: 'Vanity URL',
  vanity: 'Vanity / custom name',
  unknown: 'Unrecognized input'
}

/** True if the string is a syntactically valid individual Steam64 id. */
export function isValidSteam64(value: string): boolean {
  if (!/^\d{17}$/.test(value.trim())) return false
  try {
    const n = BigInt(value.trim())
    const accountId = n - STEAM64_INDIVIDUAL_BASE
    return accountId >= 0n && accountId <= MAX_ACCOUNT_ID
  } catch {
    return false
  }
}

/** Convert a Steam64 id to the full identifier set. Throws on invalid input. */
export function steam64ToSet(steam64: string): SteamIdSet {
  const clean = steam64.trim()
  if (!isValidSteam64(clean)) {
    throw new Error(`Not a valid Steam64 id: ${steam64}`)
  }
  const id = BigInt(clean)
  const accountId = id - STEAM64_INDIVIDUAL_BASE
  const y = accountId & 1n
  const z = accountId >> 1n
  return {
    steam64: clean,
    steam3: `[U:1:${accountId.toString()}]`,
    // Universe rendered as 1 (public). STEAM_0:Y:Z legacy input is also accepted on parse.
    steam2: `STEAM_1:${y.toString()}:${z.toString()}`,
    accountId: accountId.toString(),
    profileUrl: `https://steamcommunity.com/profiles/${clean}`
  }
}

/** Build a Steam64 id from a raw 32-bit account id. */
export function accountIdToSteam64(accountId: string | bigint): string {
  const acc = typeof accountId === 'bigint' ? accountId : BigInt(accountId)
  if (acc < 0n || acc > MAX_ACCOUNT_ID) throw new Error(`Account id out of range: ${accountId}`)
  return (STEAM64_INDIVIDUAL_BASE + acc).toString()
}

function parseSteam2(input: string): string | null {
  // STEAM_X:Y:Z  — X is the universe (0 legacy / 1 public), Y is the lowest bit, Z the rest.
  const m = /^STEAM_([0-5]):([01]):(\d+)$/i.exec(input.trim())
  if (!m) return null
  const y = BigInt(m[2])
  const z = BigInt(m[3])
  const accountId = z * 2n + y
  if (accountId <= 0n || accountId > MAX_ACCOUNT_ID) return null
  return accountIdToSteam64(accountId)
}

function parseSteam3(input: string): string | null {
  // [U:1:accountId] or U:1:accountId — only individual ("U") accounts resolve to a player.
  const m = /^\[?([IUMGAPCgTLca]):([0-5]):(\d+)(?::\d+)?\]?$/.exec(input.trim())
  if (!m) return null
  if (m[1] !== 'U') return null // only individual user accounts map to a player profile
  const accountId = BigInt(m[3])
  if (accountId <= 0n || accountId > MAX_ACCOUNT_ID) return null
  return accountIdToSteam64(accountId)
}

/** A syntactically legal Steam vanity/custom-url segment. */
function isPlausibleVanity(value: string): boolean {
  // Steam custom URLs allow letters, digits, underscores and hyphens, length 2-32.
  return /^[A-Za-z0-9_-]{2,32}$/.test(value)
}

/**
 * Detect the format of arbitrary user input and, when possible, resolve it to a
 * Steam64 id without any network call. Vanity inputs are flagged for API resolution.
 */
export function detectSteamInput(raw: string): DetectionResult {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return { kind: 'unknown', label: KIND_LABELS.unknown, normalizedInput: trimmed }

  // 1. Full community URLs.
  const urlMatch = /^(?:https?:\/\/)?(?:www\.)?steamcommunity\.com\/(profiles|id)\/([^/?#]+)\/?/i.exec(
    trimmed
  )
  if (urlMatch) {
    const [, kind, value] = urlMatch
    if (kind.toLowerCase() === 'profiles') {
      if (isValidSteam64(value)) {
        return {
          kind: 'profileUrl',
          steam64: value,
          label: KIND_LABELS.profileUrl,
          normalizedInput: value
        }
      }
      // /profiles/ that is not a valid 64 — try steam3/steam2 embedded, else unknown.
    } else {
      // /id/<vanity>
      if (isPlausibleVanity(value)) {
        return { kind: 'vanityUrl', vanity: value, label: KIND_LABELS.vanityUrl, normalizedInput: value }
      }
    }
  }

  // 2. Raw Steam64.
  if (isValidSteam64(trimmed)) {
    return { kind: 'steam64', steam64: trimmed, label: KIND_LABELS.steam64, normalizedInput: trimmed }
  }

  // 3. Steam2 (STEAM_0:1:123).
  const s2 = parseSteam2(trimmed)
  if (s2) return { kind: 'steam2', steam64: s2, label: KIND_LABELS.steam2, normalizedInput: trimmed }

  // 4. Steam3 ([U:1:123]).
  const s3 = parseSteam3(trimmed)
  if (s3) return { kind: 'steam3', steam64: s3, label: KIND_LABELS.steam3, normalizedInput: trimmed }

  // 5. Bare vanity / custom name.
  if (isPlausibleVanity(trimmed)) {
    return { kind: 'vanity', vanity: trimmed, label: KIND_LABELS.vanity, normalizedInput: trimmed }
  }

  return { kind: 'unknown', label: KIND_LABELS.unknown, normalizedInput: trimmed }
}

export type VanityResolver = (vanity: string) => Promise<string | null>

export interface ResolveResult {
  steam64: string | null
  detection: DetectionResult
  /** True when a network resolution (ResolveVanityURL) was required. */
  resolvedViaApi: boolean
  error?: string
}

/**
 * Resolve any supported input to a Steam64 id. For vanity inputs the provided
 * async resolver (Steam ResolveVanityURL) is used; if it cannot be resolved we
 * return null rather than guessing.
 */
export async function resolveToSteam64(
  raw: string,
  resolveVanity: VanityResolver
): Promise<ResolveResult> {
  const detection = detectSteamInput(raw)

  if (detection.steam64) {
    return { steam64: detection.steam64, detection, resolvedViaApi: false }
  }

  if ((detection.kind === 'vanity' || detection.kind === 'vanityUrl') && detection.vanity) {
    try {
      const resolved = await resolveVanity(detection.vanity)
      if (resolved && isValidSteam64(resolved)) {
        return { steam64: resolved, detection, resolvedViaApi: true }
      }
      return {
        steam64: null,
        detection,
        resolvedViaApi: true,
        error: `No Steam account matches the custom URL "${detection.vanity}".`
      }
    } catch (err) {
      return {
        steam64: null,
        detection,
        resolvedViaApi: true,
        error: err instanceof Error ? err.message : 'Vanity resolution failed.'
      }
    }
  }

  return {
    steam64: null,
    detection,
    resolvedViaApi: false,
    error: 'Could not recognize this as a Steam ID, profile URL or vanity name.'
  }
}
