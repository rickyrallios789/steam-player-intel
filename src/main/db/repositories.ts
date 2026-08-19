/**
 * Repository layer over the local SQLite database. All application-history
 * reads/writes go through here. (spec §19, §20, §21, §22)
 */
import type { AppDatabase, NoteRow, PlayerRow, ScanRow } from './database'
import type { PlayerSnapshot } from '../../shared/changeDetection'
import type { RosterRow } from '../../shared/ipc'

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

  /** Every stored scan for a player as timeline entries, oldest → newest. (cross-time timeline) */
  getScanTimeline(steam64: string): Array<{ scannedAt: string; snapshot: PlayerSnapshot }> {
    const rows = this.db
      .prepare('SELECT * FROM scans WHERE steam64 = ? ORDER BY scanned_at ASC, id ASC')
      .all(steam64) as ScanRow[]
    return rows.map((r) => ({ scannedAt: r.scanned_at, snapshot: this.rowToSnapshot(r) }))
  }

  private rowToSnapshot(r: ScanRow): PlayerSnapshot {
    return {
      displayName: r.display_name,
      avatarHash: r.avatar_hash,
      steamLevel: r.steam_level,
      gameCount: r.game_count,
      totalPlaytimeMinutes: r.total_playtime_min,
      rustPlaytimeMinutes: r.rust_playtime_min,
      vacBans: r.vac_bans,
      gameBans: r.game_bans,
      communityBanned: r.community_banned == null ? null : r.community_banned === 1,
      visibility: r.visibility
    }
  }

  private sameSnapshot(a: PlayerSnapshot, b: PlayerSnapshot): boolean {
    return (
      a.displayName === b.displayName &&
      a.avatarHash === b.avatarHash &&
      a.steamLevel === b.steamLevel &&
      a.gameCount === b.gameCount &&
      a.totalPlaytimeMinutes === b.totalPlaytimeMinutes &&
      a.rustPlaytimeMinutes === b.rustPlaytimeMinutes &&
      a.vacBans === b.vacBans &&
      a.gameBans === b.gameBans &&
      a.communityBanned === b.communityBanned &&
      a.visibility === b.visibility
    )
  }

  /**
   * Record a scan: read the previous latest scan (for change detection), upsert
   * the player, and store a NEW scan row only when the snapshot actually changed
   * (dedup, audit F-8). scan_count still counts every look-up. Atomic.
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

      // Store a scan row only when something actually changed vs the last one.
      let newScan: ScanRow | null = previousScan
      const changed = !previousScan || !this.sameSnapshot(this.rowToSnapshot(previousScan), snapshot)
      if (changed) {
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
        newScan = this.db.prepare('SELECT * FROM scans WHERE id = ?').get(info.lastInsertRowid) as ScanRow
      }

      if (snapshot.displayName) {
        this.recordNameObservation(steam64, snapshot.displayName, nowIso)
      }

      const player = this.getPlayer(steam64)!
      return { player, previousScan, newScan: newScan! }
    })
    return tx()
  }

  /** Keep only the most recent `keepPerPlayer` scans per player. (audit F-8) */
  pruneHistory(keepPerPlayer = 200): void {
    this.db
      .prepare(
        `DELETE FROM scans WHERE id IN (
           SELECT id FROM (
             SELECT id, ROW_NUMBER() OVER (PARTITION BY steam64 ORDER BY scanned_at DESC, id DESC) AS rn
             FROM scans
           ) WHERE rn > ?
         )`
      )
      .run(keepPerPlayer)
  }

  /** Wipe all locally stored player history, notes and tags. (audit F-8, spec §25) */
  clearAllHistory(): void {
    const tx = this.db.transaction(() => {
      for (const t of ['scans', 'name_observations', 'server_observations', 'notes', 'tags', 'players']) {
        this.db.prepare(`DELETE FROM ${t}`).run()
      }
    })
    tx()
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
    // Single tags query instead of one-per-player (audit F-10).
    const tagRows = this.db.prepare('SELECT steam64, tag FROM tags').all() as { steam64: string; tag: string }[]
    const byId = new Map<string, string[]>()
    for (const t of tagRows) {
      const arr = byId.get(t.steam64)
      if (arr) arr.push(t.tag)
      else byId.set(t.steam64, [t.tag])
    }
    return players.map((p) => ({ ...p, tags: byId.get(p.steam64) ?? [] }))
  }

  setFavorite(steam64: string, favorite: boolean): void {
    this.db.prepare('UPDATE players SET favorite = ? WHERE steam64 = ?').run(favorite ? 1 : 0, steam64)
  }

  /** Steam64 ids of favorited players — the set the background monitor watches. */
  listFavorites(): string[] {
    return (
      this.db
        .prepare('SELECT steam64 FROM players WHERE favorite = 1 ORDER BY last_observed DESC')
        .all() as { steam64: string }[]
    ).map((r) => r.steam64)
  }

  // ---- App settings (small key/value store, e.g. monitoring on/off) ----
  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value ?? null
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value)
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

  // ---- Rosters (saved lists of players to screen together) ----
  listRosters(): RosterRow[] {
    return this.db.prepare('SELECT * FROM rosters ORDER BY name COLLATE NOCASE ASC').all() as RosterRow[]
  }

  createRoster(name: string, members: string): RosterRow {
    const info = this.db
      .prepare('INSERT INTO rosters (name, members, interval_hours, last_run, created_at) VALUES (?, ?, 0, NULL, ?)')
      .run(name, members, new Date().toISOString())
    return this.db.prepare('SELECT * FROM rosters WHERE id = ?').get(info.lastInsertRowid) as RosterRow
  }

  updateRoster(id: number, patch: { name?: string; members?: string; intervalHours?: number }): void {
    const cur = this.db.prepare('SELECT * FROM rosters WHERE id = ?').get(id) as RosterRow | undefined
    if (!cur) return
    this.db
      .prepare('UPDATE rosters SET name = ?, members = ?, interval_hours = ? WHERE id = ?')
      .run(patch.name ?? cur.name, patch.members ?? cur.members, patch.intervalHours ?? cur.interval_hours, id)
  }

  deleteRoster(id: number): void {
    this.db.prepare('DELETE FROM rosters WHERE id = ?').run(id)
  }
}
