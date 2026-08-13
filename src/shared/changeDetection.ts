import { ChangeEntry } from './types'
import { formatHours } from './format'

/**
 * The minimal, comparable snapshot we persist per scan. Diffing two snapshots
 * powers "N changes detected since last scan". (spec §20)
 */
export interface PlayerSnapshot {
  displayName: string | null
  avatarHash: string | null
  steamLevel: number | null
  gameCount: number | null
  totalPlaytimeMinutes: number | null
  rustPlaytimeMinutes: number | null
  vacBans: number | null
  gameBans: number | null
  communityBanned: boolean | null
  visibility: string | null
}

function push(
  out: ChangeEntry[],
  field: string,
  label: string,
  before: PlayerSnapshot[keyof PlayerSnapshot],
  after: PlayerSnapshot[keyof PlayerSnapshot],
  kind: ChangeEntry['kind']
) {
  out.push({ field, label, before: before ?? null, after: after ?? null, kind })
}

/**
 * Compare the previous stored snapshot to the current one. Only reports fields
 * where a real, comparable change happened (both sides known). Never invents
 * history — if a field was unknown before, we don't report a "change". (spec §19, §20)
 */
export function diffSnapshots(prev: PlayerSnapshot, curr: PlayerSnapshot): ChangeEntry[] {
  const out: ChangeEntry[] = []

  if (prev.displayName != null && curr.displayName != null && prev.displayName !== curr.displayName) {
    push(out, 'displayName', 'Name changed', prev.displayName, curr.displayName, 'name')
  }
  if (prev.avatarHash != null && curr.avatarHash != null && prev.avatarHash !== curr.avatarHash) {
    push(out, 'avatarHash', 'Avatar changed', 'previous', 'new', 'avatar')
  }
  if (prev.steamLevel != null && curr.steamLevel != null && prev.steamLevel !== curr.steamLevel) {
    push(out, 'steamLevel', 'Steam level changed', prev.steamLevel, curr.steamLevel, 'level')
  }
  if (prev.gameCount != null && curr.gameCount != null && prev.gameCount !== curr.gameCount) {
    const delta = curr.gameCount - prev.gameCount
    push(out, 'gameCount', delta > 0 ? `+${delta} games` : `${delta} games`, prev.gameCount, curr.gameCount, 'games')
  }
  if (
    prev.totalPlaytimeMinutes != null &&
    curr.totalPlaytimeMinutes != null &&
    prev.totalPlaytimeMinutes !== curr.totalPlaytimeMinutes
  ) {
    const delta = curr.totalPlaytimeMinutes - prev.totalPlaytimeMinutes
    push(
      out,
      'totalPlaytime',
      `${delta > 0 ? '+' : ''}${formatHours(delta)} total playtime`,
      prev.totalPlaytimeMinutes,
      curr.totalPlaytimeMinutes,
      'playtime'
    )
  }
  if (
    prev.rustPlaytimeMinutes != null &&
    curr.rustPlaytimeMinutes != null &&
    prev.rustPlaytimeMinutes !== curr.rustPlaytimeMinutes
  ) {
    const delta = curr.rustPlaytimeMinutes - prev.rustPlaytimeMinutes
    push(
      out,
      'rustPlaytime',
      `${delta > 0 ? '+' : ''}${formatHours(delta)} Rust`,
      prev.rustPlaytimeMinutes,
      curr.rustPlaytimeMinutes,
      'rust'
    )
  }
  if (prev.vacBans != null && curr.vacBans != null && curr.vacBans > prev.vacBans) {
    push(out, 'vacBans', 'New VAC ban detected', prev.vacBans, curr.vacBans, 'ban')
  }
  if (prev.gameBans != null && curr.gameBans != null && curr.gameBans > prev.gameBans) {
    push(out, 'gameBans', 'New game ban detected', prev.gameBans, curr.gameBans, 'ban')
  }
  if (
    prev.communityBanned != null &&
    curr.communityBanned != null &&
    prev.communityBanned !== curr.communityBanned
  ) {
    push(
      out,
      'communityBanned',
      curr.communityBanned ? 'Community banned' : 'Community ban lifted',
      prev.communityBanned,
      curr.communityBanned,
      'ban'
    )
  }
  if (prev.visibility != null && curr.visibility != null && prev.visibility !== curr.visibility) {
    push(
      out,
      'visibility',
      `Profile changed from ${prev.visibility} → ${curr.visibility}`,
      prev.visibility,
      curr.visibility,
      'privacy'
    )
  }

  return out
}
