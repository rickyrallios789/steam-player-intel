/**
 * SQLite-backed durable HTTP cache (audit F-12).
 *
 * Lets cached Steam/BattleMetrics responses survive an app restart (so the first
 * lookup after launch doesn't refetch everything within TTL) and provides a
 * "last known good" payload the HttpClient can serve when a live fetch fails.
 * Only successful responses are ever stored, so a fallback is always real data.
 */
import type Database from 'better-sqlite3'
import type { PersistentCache } from '../core/httpClient'

interface CacheRow {
  status: number
  body: string | null
  fetched_at: number
}

export class SqliteCacheStore implements PersistentCache {
  private getStmt: Database.Statement
  private setStmt: Database.Statement

  constructor(private db: Database.Database) {
    this.getStmt = db.prepare('SELECT status, body, fetched_at FROM http_cache WHERE cache_key = ?')
    this.setStmt = db.prepare(
      `INSERT INTO http_cache (cache_key, status, body, fetched_at) VALUES (@key, @status, @body, @at)
       ON CONFLICT(cache_key) DO UPDATE SET status = excluded.status, body = excluded.body, fetched_at = excluded.fetched_at`
    )
  }

  get(key: string): { status: number; body: unknown; at: number } | null {
    const row = this.getStmt.get(key) as CacheRow | undefined
    if (!row) return null
    let body: unknown = null
    try {
      body = row.body ? JSON.parse(row.body) : null
    } catch {
      body = null
    }
    return { status: row.status, body, at: row.fetched_at }
  }

  set(key: string, entry: { status: number; body: unknown; at: number }): void {
    this.setStmt.run({ key, status: entry.status, body: JSON.stringify(entry.body ?? null), at: entry.at })
  }

  /** Drop entries older than maxAgeMs (called at startup to bound growth). */
  prune(maxAgeMs: number): void {
    this.db.prepare('DELETE FROM http_cache WHERE fetched_at < ?').run(Date.now() - maxAgeMs)
  }
}
