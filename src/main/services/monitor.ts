/**
 * Background watchlist monitor.
 *
 * On a timer (default every 6 hours) it re-scans every FAVORITED player headless,
 * reuses the normal analyze + change-detection pipeline, and fires a native
 * desktop notification for high-signal changes (new ban, or profile went private).
 * Clicking a notification focuses the app and opens that player.
 *
 * It never fabricates data and is naturally rate-limited by the shared HttpClient
 * (per-host serialized queue), scanning favorites one at a time.
 */
import { Notification, type BrowserWindow } from 'electron'
import type { CredentialStore } from '../credentials'
import type { Repositories } from '../db/repositories'
import type { HttpClient } from '../core/httpClient'
import { analyzePlayer } from './analyzePlayer'
import { selectAlerts } from '../../shared/monitorAlerts'
import { buildDiscordAlert } from '../../shared/webhook'

export const MONITOR_INTERVAL_MS = 6 * 60 * 60 * 1000 // every 6 hours
const FIRST_RUN_DELAY_MS = 60_000 // wait a minute after launch before the first sweep

export interface MonitorDeps {
  repos: Repositories
  credentials: CredentialStore
  http: HttpClient
  getMainWindow: () => BrowserWindow | null
}

export class MonitorService {
  private timer: ReturnType<typeof setInterval> | null = null
  private firstRun: ReturnType<typeof setTimeout> | null = null
  private running = false

  constructor(private deps: MonitorDeps) {}

  get isActive(): boolean {
    return this.timer != null
  }

  start(intervalMs = MONITOR_INTERVAL_MS, firstDelayMs = FIRST_RUN_DELAY_MS): void {
    this.stop()
    this.timer = setInterval(() => void this.runOnce(), intervalMs)
    this.firstRun = setTimeout(() => void this.runOnce(), firstDelayMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    if (this.firstRun) clearTimeout(this.firstRun)
    this.timer = null
    this.firstRun = null
  }

  /** Scan every favorited player once and notify on significant changes. */
  async runOnce(): Promise<{ checked: number; alerts: number }> {
    if (this.running) return { checked: 0, alerts: 0 }
    if (!(await this.deps.credentials.get('STEAM_API_KEY'))) return { checked: 0, alerts: 0 }
    this.running = true
    let checked = 0
    let alerts = 0
    try {
      for (const steam64 of this.deps.repos.listFavorites()) {
        const res = await analyzePlayer(
          { http: this.deps.http, credentials: this.deps.credentials, repos: this.deps.repos },
          { raw: steam64, persist: true }
        )
        checked++
        if (!res.ok || !res.report) continue
        const name = res.report.identity.displayName.value ?? steam64
        for (const alert of selectAlerts(res.report.changes.entries)) {
          alerts++
          this.notify(name, alert.label, steam64)
          await this.postWebhook(name, alert.label, steam64)
        }
      }
    } finally {
      this.running = false
    }
    return { checked, alerts }
  }

  /** Optionally forward an alert to a user-configured Discord (or compatible) webhook. */
  private async postWebhook(name: string, message: string, steam64: string): Promise<void> {
    const url = this.deps.repos.getSetting('monitor.webhook')
    if (!url) return
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildDiscordAlert(name, message, steam64))
      })
    } catch {
      /* best-effort — never let a webhook failure break monitoring */
    }
  }

  private notify(name: string, message: string, steam64: string): void {
    if (!Notification.isSupported()) return
    const n = new Notification({ title: `Steam Player Intel — ${name}`, body: message })
    n.on('click', () => {
      const win = this.deps.getMainWindow()
      if (!win) return
      if (win.isMinimized()) win.restore()
      win.focus()
      win.webContents.send('monitor:open', { steam64 })
    })
    n.show()
  }
}
