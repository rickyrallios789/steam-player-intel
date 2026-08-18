/**
 * Build the JSON body for a Discord (or Discord-compatible) webhook alert.
 * Kept pure so it can be unit-tested and reused by the monitor. (webhook alerts)
 */
export interface DiscordPayload {
  content: string
}

export function buildDiscordAlert(playerName: string, message: string, steam64: string): DiscordPayload {
  return {
    content: `**Steam Player Intel** — ${playerName}: ${message}\nhttps://steamcommunity.com/profiles/${steam64}`
  }
}
