/**
 * Local SQLite database — the application's OWN observation history (spec §19).
 *
 * This is the key differentiator over a one-off Steam lookup: it records what
 * THIS app has seen over time, enabling "when did I first see this player",
 * "what changed since last scan", personal notes, tags and favorites.
 *
 * Data recorded here is always labelled as "Application Observed History" in the
 * UI, and is never presented as if it pre-dated the app's first observation.
 */
import Database from 'better-sqlite3'
import { join } from 'node:path'

export interface PlayerRow {
  steam64: string
  first_observed: string
  last_observed: string
  scan_count: number
  favorite: number
  display_name: string | null
}

export interface ScanRow {
  id: number
  steam64: string
  scanned_at: string
  display_name: string | null
  avatar_hash: string | null
  steam_level: number | null
  game_count: number | null
  total_playtime_min: number | null
  rust_playtime_min: number | null
  vac_bans: number | null
  game_bans: number | null
  community_banned: number | null
  visibility: string | null
}

export interface NoteRow {
  id: number
  steam64: string
  body: string
  created_at: string
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  steam64        TEXT PRIMARY KEY,
  first_observed TEXT NOT NULL,
  last_observed  TEXT NOT NULL,
  scan_count     INTEGER NOT NULL DEFAULT 0,
  favorite       INTEGER NOT NULL DEFAULT 0,
  display_name   TEXT
);

CREATE TABLE IF NOT EXISTS scans (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  steam64            TEXT NOT NULL,
  scanned_at         TEXT NOT NULL,
  display_name       TEXT,
  avatar_hash        TEXT,
  steam_level        INTEGER,
  game_count         INTEGER,
  total_playtime_min INTEGER,
  rust_playtime_min  INTEGER,
  vac_bans           INTEGER,
  game_bans          INTEGER,
  community_banned   INTEGER,
  visibility         TEXT,
  FOREIGN KEY (steam64) REFERENCES players(steam64) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_scans_steam64 ON scans(steam64, scanned_at);

CREATE TABLE IF NOT EXISTS name_observations (
  steam64    TEXT NOT NULL,
  name       TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen  TEXT NOT NULL,
  PRIMARY KEY (steam64, name)
);

CREATE TABLE IF NOT EXISTS server_observations (
  steam64      TEXT NOT NULL,
  server_id    TEXT,
  server_name  TEXT NOT NULL,
  game         TEXT,
  region       TEXT,
  first_seen   TEXT NOT NULL,
  last_seen    TEXT NOT NULL,
  observations INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (steam64, server_name)
);

CREATE TABLE IF NOT EXISTS notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  steam64    TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_steam64 ON notes(steam64);

CREATE TABLE IF NOT EXISTS tags (
  steam64 TEXT NOT NULL,
  tag     TEXT NOT NULL,
  PRIMARY KEY (steam64, tag)
);
`

export class AppDatabase {
  private db: Database.Database

  constructor(userDataDir: string) {
    this.db = new Database(join(userDataDir, 'player-intel.sqlite'))
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('busy_timeout = 5000')
    this.db.pragma('foreign_keys = ON')
    this.db.exec(SCHEMA)
  }

  close(): void {
    this.db.close()
  }

  get raw(): Database.Database {
    return this.db
  }
}
