/**
 * Repository layer over the local SQLite database. All application-history
 * reads/writes go through here. (spec §19, §20, §21, §22)
 */
import type { AppDatabase, NoteRow, PlayerRow, ScanRow } from './database'
import type { PlayerSnapshot } from '../../shared/changeDetection'

export interface HistoryRecord {
  player: PlayerRow
  previousScan: ScanRow | null
  newScan: ScanRow
}

export class Repositories {
  constructor(private appDb: AppDatabase) {}

  private get db() {
    return this.appDb.raw
  }

  getPlayer(steam64: string): PlayerRow | undefined {
    return this.db.prepare('SELECT * FROM players WHERE steam64 = ?').get(steam64) as PlayerRow | undefined
  }

  getLatestScan(steam64: string): ScanRow | undefined {
    return this.db
      .prepare('SELECT * FROM scans WHERE steam64 = ? ORDER BY scanned_at DESC, id DESC LIMIT 1')
      .get(steam64) as ScanRow | undefined
  }

  /**
   * Record a scan: read the previous latest scan (for change detection), upsert
   * the player, insert the new scan and update name history — all atomically.
   */
  recordScan(steam64: string, snapshot: PlayerSnapshot, nowIso = new Date().toISOString()): HistoryRecord {
    const tx = this.db.transaction((): HistoryRecord => {
      const previousScan = this.getLatestScan(steam64) ?? null

      const existing = this.getPlayer(steam64)
      if (existing) {
        this.db
          .prepare(
            'UPDATE players SET last_observed = ?, scan_count = scan_count + 1, display_name = ? WHERE steam64 = ?'
          )
          .run(nowIso, snapshot.displayName, steam64)
      } else {
        this.db
          .prepare(
            'INSERT INTO players (steam64, first_observed, last_observed, scan_count, favorite, display_name) VALUES (?, ?, ?, 1, 0, ?)'
          )
          .run(steam64, nowIso, nowIso, snapshot.displayName)
      }

      const info = this.db
        .prepare(
          `INSERT INTO scans
            (steam64, scanned_at, display_name, avatar_hash, steam_level, game_count,
             total_playtime_min, rust_playtime_min, vac_bans, game_bans, community_banned, visibility)
           VALUES (@steam64, @scanned_at, @display_name, @avatar_hash, @steam_level, @game_count,
             @total_playtime_min, @rust_playtime_min, @vac_bans, @game_bans, @community_banned, @visibility)`
        )
        .run({
          steam64,
          scanned_at: nowIso,
          display_name: snapshot.displayName,
          avatar_hash: snapshot.avatarHash,
          steam_level: snapshot.steamLevel,
          game_count: snapshot.gameCount,
          total_playtime_min: snapshot.totalPlaytimeMinutes,
          rust_playtime_min: snapshot.rustPlaytimeMinutes,
          vac_bans: snapshot.vacBans,
          game_bans: snapshot.gameBans,
          community_banned: snapshot.communityBanned == null ? null : snapshot.communityBanned ? 1 : 0,
          visibility: snapshot.visibility
        })

      if (snapshot.displayName) {
        this.recordNameObservation(steam64, snapshot.displayName, nowIso)
      }

      const newScan = this.db.prepare('SELECT * FROM scans WHERE id = ?').get(info.lastInsertRowid) as ScanRow
      const player = this.getPlayer(steam64)!
      return { player, previousScan, newScan }
    })
    return tx()
  }

  recordNameObservation(steam64: string, name: string, nowIso: string): void {
    this.db
      .prepare(
        `INSERT INTO name_observations (steam64, name, first_seen, last_seen)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(steam64, name) DO UPDATE SET last_seen = excluded.last_seen`
      )
      .run(steam64, name, nowIso, nowIso)
  }

  getNameObservations(steam64: string): Array<{ name: string; first_seen: string; last_seen: string }> {
    return this.db
      .prepare('SELECT name, first_seen, last_seen FROM name_observations WHERE steam64 = ? ORDER BY first_seen ASC')
      .all(steam64) as Array<{ name: string; first_seen: string; last_seen: string }>
  }

  recordServerObservation(
    steam64: string,
    server: { serverId: string | null; serverName: string; game: string | null; region: string | null },
    nowIso: string
  ): void {
    this.db
      .prepare(
        `INSERT INTO server_observations (steam64, server_id, server_name, game, region, first_seen, last_seen, observations)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(steam64, server_name) DO UPDATE SET last_seen = excluded.last_seen, observations = observations + 1`
      )
      .run(steam64, server.serverId, server.serverName, server.game, server.region, nowIso, nowIso)
  }

  getServerObservations(steam64: string) {
    return this.db
      .prepare('SELECT * FROM server_observations WHERE steam64 = ? ORDER BY last_seen DESC')
      .all(steam64)
  }

  // ---- Search history / player list ----
  listPlayers(): Array<PlayerRow & { tags: string[] }> {
    const players = this.db
      .prepare('SELECT * FROM players ORDER BY last_observed DESC')
      .all() as PlayerRow[]
    return players.map((p) => ({
      ...p,
      tags: (this.db.prepare('SELECT tag FROM tags WHERE steam64 = ?').all(p.steam64) as { tag: string }[]).map(
        (t) => t.tag
      )
    }))
  }

  setFavorite(steam64: string, favorite: boolean): void {
    this.db.prepare('UPDATE players SET favorite = ? WHERE steam64 = ?').run(favorite ? 1 : 0, steam64)
  }

  deletePlayer(steam64: string): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM scans WHERE steam64 = ?').run(steam64)
      this.db.prepare('DELETE FROM name_observations WHERE steam64 = ?').run(steam64)
      this.db.prepare('DELETE FROM server_observations WHERE steam64 = ?').run(steam64)
      this.db.prepare('DELETE FROM notes WHERE steam64 = ?').run(steam64)
      this.db.prepare('DELETE FROM tags WHERE steam64 = ?').run(steam64)
      this.db.prepare('DELETE FROM players WHERE steam64 = ?').run(steam64)
    })
    tx()
  }

  // ---- Notes (user-entered, kept separate from verified data — spec §22) ----
  addNote(steam64: string, body: string): NoteRow {
    const nowIso = new Date().toISOString()
    const info = this.db
      .prepare('INSERT INTO notes (steam64, body, created_at) VALUES (?, ?, ?)')
      .run(steam64, body, nowIso)
    return this.db.prepare('SELECT * FROM notes WHERE id = ?').get(info.lastInsertRowid) as NoteRow
  }

  listNotes(steam64: string): NoteRow[] {
    return this.db
      .prepare('SELECT * FROM notes WHERE steam64 = ? ORDER BY created_at DESC')
      .all(steam64) as NoteRow[]
  }

  deleteNote(id: number): void {
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id)
  }

  // ---- Tags ----
  addTag(steam64: string, tag: string): void {
    this.db.prepare('INSERT OR IGNORE INTO tags (steam64, tag) VALUES (?, ?)').run(steam64, tag)
  }

  removeTag(steam64: string, tag: string): void {
    this.db.prepare('DELETE FROM tags WHERE steam64 = ? AND tag = ?').run(steam64, tag)
  }

  listTags(steam64: string): string[] {
    return (this.db.prepare('SELECT tag FROM tags WHERE steam64 = ?').all(steam64) as { tag: string }[]).map(
      (t) => t.tag
    )
  }
}
