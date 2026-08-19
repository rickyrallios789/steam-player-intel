/**
 * Background roster scheduler. (v0.5.1)
 *
 * Wakes on a light timer and re-screens any SAVED ROSTER whose per-roster
 * interval has elapsed. Each due roster's members are re-analyzed headless
 * through the same sourced, never-fabricated pipeline as a manual scan; a digest
 * of high-signal changes (new bans, privacy flips) is posted to the user's
 * configured Discord webhook. Rosters with interval_hours = 0 are manual-only and
 * are skipped. It self-gates on a Steam API key and is naturally rate-limited by
 * the shared HttpClient's per-host serial queue.
 */
import type { CredentialStore } from '../credentials'
import type { Repositories } from '../db/repositories'
import type { HttpClient } from '../core/httpClient'
import type { RosterRow } from '../../shared/ipc'
import { analyzePlayer } from './analyzePlayer'
import { selectAlerts } from '../../shared/monitorAlerts'
import { parseRosterInput } from '../../shared/roster'
import { buildRosterDigest, type RosterMemberResult } from '../../shared/rosterDigest'

export const ROSTER_TICK_MS = 15 * 60 * 1000 // check for due rosters every 15 minutes
const FIRST_TICK_DELAY_MS = 90_000 // let the app settle before the first check
const MAX_MEMBERS_PER_ROSTER = 100 // mirror the Bulk-screen cap

export interface RosterSchedulerDeps {
  repos: Repositories
  credentials: CredentialStore
  http: HttpClient
}

export class RosterScheduler {
  private timer: ReturnType<typeof setInterval> | null = null
  private firstTick: ReturnType<typeof setTimeout> | null = null
  private running = false

  constructor(private deps: RosterSchedulerDeps) {}

  get isActive(): boolean {
    return this.timer != null
  }

  start(tickMs = ROSTER_TICK_MS, firstDelayMs = FIRST_TICK_DELAY_MS): void {
    this.stop()
    this.timer = setInterval(() => void this.tick(), tickMs)
    this.firstTick = setTimeout(() => void this.tick(), firstDelayMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    if (this.firstTick) clearTimeout(this.firstTick)
    this.timer = null
    this.firstTick = null
  }

  /** True when a roster has an interval set and enough time has passed since last run. */
  isDue(row: RosterRow, now = Date.now()): boolean {
    if (!row.interval_hours || row.interval_hours <= 0) return false
    if (!row.last_run) return true
    const last = Date.parse(row.last_run)
    if (Number.isNaN(last)) return true
    return now - last >= row.interval_hours * 3600_000
  }

  /** Scan any due rosters once. Safe to call repeatedly; re-entrancy is guarded. */
  async tick(): Promise<{ rostersRun: number; posted: number }> {
    if (this.running) return { rostersRun: 0, posted: 0 }
    if (!(await this.deps.credentials.get('STEAM_API_KEY'))) return { rostersRun: 0, posted: 0 }
    this.running = true
    let rostersRun = 0
    let posted = 0
    try {
      const now = Date.now()
      for (const roster of this.deps.repos.listRosters()) {
        if (!this.isDue(roster, now)) continue
        const didPost = await this.screenRoster(roster)
        rostersRun++
        if (didPost) posted++
      }
    } finally {
      this.running = false
    }
    return { rostersRun, posted }
  }

  /** Re-screen one roster, stamp its run time, and post a digest if anything is notable. */
  private async screenRoster(roster: RosterRow): Promise<boolean> {
    const members = parseRosterInput(roster.members).slice(0, MAX_MEMBERS_PER_ROSTER)
    const results: RosterMemberResult[] = []
    for (const raw of members) {
      try {
        const res = await analyzePlayer(
          { http: this.deps.http, credentials: this.deps.credentials, repos: this.deps.repos },
          { raw, persist: true }
        )
        if (!res.ok || !res.report) {
          results.push({ steam64: raw, name: raw, alerts: [], error: true })
          continue
        }
        const name = res.report.identity.displayName.value ?? res.report.identity.steam64
        const alerts = selectAlerts(res.report.changes.entries).map((a) => a.label)
        results.push({ steam64: res.report.identity.steam64, name, alerts })
      } catch {
        results.push({ steam64: raw, name: raw, alerts: [], error: true })
      }
    }

    // Record the run time regardless of outcome so cadence stays steady.
    this.deps.repos.markRosterRun(roster.id)

    const digest = buildRosterDigest(roster.name, results)
    if (!digest.hasNotable) return false
    return this.postWebhook(digest.content)
  }

  /** Best-effort POST to the configured Discord (or compatible) webhook. */
  private async postWebhook(content: string): Promise<boolean> {
    const url = this.deps.repos.getSetting('monitor.webhook')
    if (!url) return false
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      })
      return true
    } catch {
      return false // never let a webhook failure break scheduling
    }
  }
}
