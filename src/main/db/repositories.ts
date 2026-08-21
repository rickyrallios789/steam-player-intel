/**
 * Repository layer over the local SQLite database. All application-history
 * reads/writes go through here. (spec §19, §20, §21, §22)
 */
import type { AppDatabase, NoteRow, PlayerRow, ScanRow } from './database'
import type { PlayerSnapshot } from '../../shared/changeDetection'
import type { RosterRow } from '../../shared/ipc'
import { BACKUP_VERSION, type BackupData, type ImportSummary } from '../../shared/backup'
import type { CorrelationPlayer } from '../../shared/altLeads'

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

  /** Stamp a roster's last scheduled re-screen time (used by the roster scheduler). */
  markRosterRun(id: number, whenIso = new Date().toISOString()): void {
    this.db.prepare('UPDATE rosters SET last_run = ? WHERE id = ?').run(whenIso, id)
  }

  // ---- Backup / restore (local-first data portability) — (v0.8.0) ----
  /** A portable JSON snapshot of the app's observation history. Excludes the HTTP cache and credentials. */
  exportBackup(): BackupData {
    const all = (table: string): Record<string, unknown>[] =>
      this.db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]
    return {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      players: all('players'),
      scans: all('scans'),
      names: all('name_observations'),
      servers: all('server_observations'),
      notes: all('notes'),
      tags: all('tags'),
      settings: all('app_settings'),
      rosters: all('rosters'),
      friendEdges: all('friend_edges')
    }
  }

  /** Merge a validated backup into the local DB. Adds missing rows; never clobbers existing data. */
  importBackup(data: BackupData): ImportSummary {
    const summary: ImportSummary = { players: 0, scans: 0, notes: 0, rosters: 0 }
    const s = (v: unknown, fallback = ''): string => (v == null ? fallback : String(v))
    const nOrNull = (v: unknown): number | null => (v == null ? null : Number(v))
    const sOrNull = (v: unknown): string | null => (v == null ? null : String(v))

    const tx = this.db.transaction(() => {
      const insPlayer = this.db.prepare(
        'INSERT OR IGNORE INTO players (steam64, first_observed, last_observed, scan_count, favorite, display_name) VALUES (?, ?, ?, ?, ?, ?)'
      )
      for (const p of data.players) {
        if (!s(p.steam64)) continue
        const info = insPlayer.run(
          s(p.steam64),
          s(p.first_observed, new Date().toISOString()),
          s(p.last_observed, new Date().toISOString()),
          Number(p.scan_count ?? 0),
          Number(p.favorite ?? 0),
          sOrNull(p.display_name)
        )
        if (info.changes > 0) summary.players++
      }

      const scanExists = this.db.prepare('SELECT 1 FROM scans WHERE steam64 = ? AND scanned_at = ? LIMIT 1')
      const insScan = this.db.prepare(
        `INSERT INTO scans (steam64, scanned_at, display_name, avatar_hash, steam_level, game_count,
          total_playtime_min, rust_playtime_min, vac_bans, game_bans, community_banned, visibility)
         VALUES (@steam64, @scanned_at, @display_name, @avatar_hash, @steam_level, @game_count,
          @total_playtime_min, @rust_playtime_min, @vac_bans, @game_bans, @community_banned, @visibility)`
      )
      for (const sc of data.scans) {
        const steam64 = s(sc.steam64)
        const scanned_at = s(sc.scanned_at)
        if (!steam64 || !scanned_at) continue
        if (!this.db.prepare('SELECT 1 FROM players WHERE steam64 = ? LIMIT 1').get(steam64)) continue // FK safety
        if (scanExists.get(steam64, scanned_at)) continue
        insScan.run({
          steam64,
          scanned_at,
          display_name: sOrNull(sc.display_name),
          avatar_hash: sOrNull(sc.avatar_hash),
          steam_level: nOrNull(sc.steam_level),
          game_count: nOrNull(sc.game_count),
          total_playtime_min: nOrNull(sc.total_playtime_min),
          rust_playtime_min: nOrNull(sc.rust_playtime_min),
          vac_bans: nOrNull(sc.vac_bans),
          game_bans: nOrNull(sc.game_bans),
          community_banned: nOrNull(sc.community_banned),
          visibility: sOrNull(sc.visibility)
        })
        summary.scans++
      }

      const insName = this.db.prepare(
        'INSERT OR IGNORE INTO name_observations (steam64, name, first_seen, last_seen) VALUES (?, ?, ?, ?)'
      )
      for (const n of data.names) {
        if (!s(n.steam64) || !s(n.name)) continue
        insName.run(s(n.steam64), s(n.name), s(n.first_seen), s(n.last_seen))
      }

      const insServer = this.db.prepare(
        `INSERT OR IGNORE INTO server_observations (steam64, server_id, server_name, game, region, first_seen, last_seen, observations)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      for (const sv of data.servers) {
        if (!s(sv.steam64) || !s(sv.server_name)) continue
        insServer.run(
          s(sv.steam64),
          sOrNull(sv.server_id),
          s(sv.server_name),
          sOrNull(sv.game),
          sOrNull(sv.region),
          s(sv.first_seen),
          s(sv.last_seen),
          Number(sv.observations ?? 1)
        )
      }

      const noteExists = this.db.prepare('SELECT 1 FROM notes WHERE steam64 = ? AND body = ? AND created_at = ? LIMIT 1')
      const insNote = this.db.prepare('INSERT INTO notes (steam64, body, created_at) VALUES (?, ?, ?)')
      for (const nt of data.notes) {
        const steam64 = s(nt.steam64)
        const body = s(nt.body)
        const created_at = s(nt.created_at, new Date().toISOString())
        if (!steam64 || !body) continue
        if (noteExists.get(steam64, body, created_at)) continue
        insNote.run(steam64, body, created_at)
        summary.notes++
      }

      const insTag = this.db.prepare('INSERT OR IGNORE INTO tags (steam64, tag) VALUES (?, ?)')
      for (const tg of data.tags) {
        if (!s(tg.steam64) || !s(tg.tag)) continue
        insTag.run(s(tg.steam64), s(tg.tag))
      }

      const insSetting = this.db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)')
      for (const st of data.settings) {
        if (!s(st.key)) continue
        insSetting.run(s(st.key), sOrNull(st.value))
      }

      const rosterExists = this.db.prepare('SELECT 1 FROM rosters WHERE name = ? LIMIT 1')
      const insRoster = this.db.prepare(
        'INSERT INTO rosters (name, members, interval_hours, last_run, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      for (const r of data.rosters) {
        const name = s(r.name)
        if (!name) continue
        if (rosterExists.get(name)) continue
        insRoster.run(name, s(r.members), Number(r.interval_hours ?? 0), sOrNull(r.last_run), s(r.created_at, new Date().toISOString()))
        summary.rosters++
      }

      const insFriend = this.db.prepare(
        'INSERT OR IGNORE INTO friend_edges (owner, friend, seen_at) VALUES (?, ?, ?)'
      )
      for (const fe of data.friendEdges) {
        const owner = s(fe.owner)
        const friend = s(fe.friend)
        if (!owner || !friend) continue
        insFriend.run(owner, friend, s(fe.seen_at, new Date().toISOString()))
      }
    })
    tx()
    return summary
  }

  // ---- Alt-account correlation data (all local) — (v0.10.0 / v0.10.1) ----
  /** Replace the stored friend list for one account (captured during friend screening). */
  setFriendEdges(owner: string, friends: string[]): void {
    const nowIso = new Date().toISOString()
    const del = this.db.prepare('DELETE FROM friend_edges WHERE owner = ?')
    const ins = this.db.prepare('INSERT OR IGNORE INTO friend_edges (owner, friend, seen_at) VALUES (?, ?, ?)')
    const tx = this.db.transaction(() => {
      del.run(owner)
      for (const f of friends) if (f && f !== owner) ins.run(owner, f, nowIso)
    })
    tx()
  }

  /** Assemble every scanned account with its known names, observed avatar hashes, and friends. */
  getCorrelationData(): CorrelationPlayer[] {
    const players = this.db.prepare('SELECT steam64, display_name FROM players').all() as {
      steam64: string
      display_name: string | null
    }[]
    const nameRows = this.db.prepare('SELECT steam64, name FROM name_observations').all() as {
      steam64: string
      name: string
    }[]
    const avatarRows = this.db
      .prepare('SELECT DISTINCT steam64, avatar_hash FROM scans WHERE avatar_hash IS NOT NULL')
      .all() as { steam64: string; avatar_hash: string }[]
    const friendRows = this.db.prepare('SELECT owner, friend FROM friend_edges').all() as {
      owner: string
      friend: string
    }[]

    const namesBy = new Map<string, Set<string>>()
    for (const r of nameRows) {
      const set = namesBy.get(r.steam64) ?? new Set<string>()
      if (r.name) set.add(r.name)
      namesBy.set(r.steam64, set)
    }
    const avatarsBy = new Map<string, string[]>()
    for (const r of avatarRows) {
      const arr = avatarsBy.get(r.steam64) ?? []
      arr.push(r.avatar_hash)
      avatarsBy.set(r.steam64, arr)
    }
    const friendsBy = new Map<string, string[]>()
    for (const r of friendRows) {
      const arr = friendsBy.get(r.owner) ?? []
      arr.push(r.friend)
      friendsBy.set(r.owner, arr)
    }

    return players.map((p) => {
      const names = namesBy.get(p.steam64) ?? new Set<string>()
      if (p.display_name) names.add(p.display_name)
      return {
        steam64: p.steam64,
        displayName: p.display_name,
        names: [...names],
        avatarHashes: avatarsBy.get(p.steam64) ?? [],
        friends: friendsBy.get(p.steam64) ?? []
      }
    })
  }
}
