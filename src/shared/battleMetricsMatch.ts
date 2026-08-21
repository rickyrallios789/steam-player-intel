/**
 * Pure parsers for BattleMetrics Steam-ID → player-id resolution. (v0.10.2)
 *
 * Extracted so the exact response-shape handling is unit-testable and regression-proof.
 * The historical bug: reading `data[0].id` (the identifier's own resource id) instead of
 * the player id under `relationships.player.data.id`.
 */
export interface BmRelPlayer {
  player?: { data?: { id?: string } }
}

/** Player id from a POST /players/match response, or null. */
export function extractMatchPlayerId(
  body: { data?: Array<{ id?: string; relationships?: BmRelPlayer }> } | null | undefined
): string | null {
  return body?.data?.[0]?.relationships?.player?.data?.id ?? null
}

/**
 * Player id from a GET /players?filter[search]=<steam64>&include=identifier response —
 * but ONLY when an included steamID identifier EXACTLY equals the queried id. This
 * refuses coincidental name matches so a wrong player is never fabricated.
 */
export function extractSearchPlayerId(
  body:
    | { included?: Array<{ type: string; attributes?: Record<string, unknown>; relationships?: BmRelPlayer }> }
    | null
    | undefined,
  steam64: string
): string | null {
  for (const inc of body?.included ?? []) {
    if (
      inc.type === 'identifier' &&
      inc.attributes?.type === 'steamID' &&
      String(inc.attributes?.identifier ?? '') === steam64
    ) {
      const pid = inc.relationships?.player?.data?.id
      if (pid) return pid
    }
  }
  return null
}
