/**
 * HTTP client with per-host rate limiting (serialized, spaced queue), per-request
 * timeouts, exponential backoff, in-flight de-duplication and TTL caching. (spec §27)
 *
 * Runs in the Electron MAIN process only. API keys are attached here and never
 * cross the IPC bridge to the renderer. Keys/tokens are redacted from any error
 * string so they can never leak into logs or the UI.
 */

interface RateLimitOptions {
  /** Minimum milliseconds between the START of consecutive requests to a host. */
  minIntervalMs: number
  /** Max retries on 429 / 5xx / network error / timeout. */
  maxRetries: number
  /** Abort a single request after this many milliseconds. */
  timeoutMs: number
}

interface RequestOptions {
  host: string
  cacheKey?: string
  cacheTtlMs?: number
  /** Force a fresh fetch, ignoring cache. */
  bypassCache?: boolean
}

interface CacheEntry {
  at: number
  status: number
  body: unknown
}

/**
 * Durable cache backing store. Implemented over SQLite in the app so cached
 * responses survive a restart and can be served as "last known good" when a live
 * fetch fails (offline fallback). (audit F-12)
 */
export interface PersistentCache {
  get(key: string): { status: number; body: unknown; at: number } | null
  set(key: string, entry: { status: number; body: unknown; at: number }): void
}

const DEFAULT_LIMITS: Record<string, RateLimitOptions> = {
  'api.steampowered.com': { minIntervalMs: 350, maxRetries: 3, timeoutMs: 12_000 },
  'api.battlemetrics.com': { minIntervalMs: 1_100, maxRetries: 3, timeoutMs: 12_000 },
  default: { minIntervalMs: 500, maxRetries: 2, timeoutMs: 12_000 }
}

export interface HttpResult<T> {
  ok: boolean
  status: number
  data: T | null
  fromCache: boolean
  cachedAt?: string
  /** True when this is a last-known-good response served because the live fetch failed. */
  stale?: boolean
  error?: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Strip key=… / token=… from any string before it can reach a log or the UI. */
function redact(s: string): string {
  return s.replace(/([?&](?:key|token|apikey|access_token)=)[^&\s"']+/gi, '$1REDACTED')
}

export class HttpClient {
  /** Per-host tail of the scheduling chain (serializes slot acquisition). */
  private tail = new Map<string, Promise<void>>()
  /** Per-host earliest time the next request may start. */
  private nextAt = new Map<string, number>()
  private inFlight = new Map<string, Promise<HttpResult<unknown>>>()
  private cache = new Map<string, CacheEntry>()
  private persistent?: PersistentCache

  /** Attach a durable cache store (called once from the main process at startup). */
  usePersistentCache(store: PersistentCache): void {
    this.persistent = store
  }

  private limitsFor(host: string): RateLimitOptions {
    return DEFAULT_LIMITS[host] ?? DEFAULT_LIMITS.default
  }

  /**
   * Acquire a spaced send-slot for `host`. Requests are serialized through a
   * per-host promise chain, so concurrent callers (e.g. the parallel Steam burst)
   * are actually spaced by `minIntervalMs` instead of all firing at once. (audit F-1)
   */
  private acquireSlot(host: string): Promise<void> {
    const minMs = this.limitsFor(host).minIntervalMs
    const prev = this.tail.get(host) ?? Promise.resolve()
    const run = prev.then(async () => {
      const wait = (this.nextAt.get(host) ?? 0) - Date.now()
      if (wait > 0) await sleep(wait)
      this.nextAt.set(host, Date.now() + minMs)
    })
    // Keep the chain alive even if a link rejects (it never throws in practice).
    this.tail.set(host, run.then(
      () => undefined,
      () => undefined
    ))
    return run
  }

  /** Last-known-good response for offline fallback when a live fetch fails. (audit F-12) */
  private offlineFallback<T>(cacheKey: string): HttpResult<T> | null {
    const stored = this.persistent?.get(cacheKey)
    const mem = this.cache.get(cacheKey)
    const rec = stored ?? (mem ? { status: mem.status, body: mem.body, at: mem.at } : null)
    if (!rec) return null
    return {
      ok: rec.status >= 200 && rec.status < 300,
      status: rec.status,
      data: rec.body as T,
      fromCache: true,
      stale: true,
      cachedAt: new Date(rec.at).toISOString()
    }
  }

  /** Clear cached entries (all, or those whose key includes `match`). */
  clearCache(match?: string): void {
    if (!match) {
      this.cache.clear()
      return
    }
    for (const key of this.cache.keys()) if (key.includes(match)) this.cache.delete(key)
  }

  async getJson<T>(url: string, opts: RequestOptions): Promise<HttpResult<T>> {
    const cacheKey = opts.cacheKey ?? url
    const ttl = opts.cacheTtlMs ?? 0

    if (!opts.bypassCache && ttl > 0) {
      const hit = this.cache.get(cacheKey)
      if (hit && Date.now() - hit.at < ttl) {
        return {
          ok: hit.status >= 200 && hit.status < 300,
          status: hit.status,
          data: hit.body as T,
          fromCache: true,
          cachedAt: new Date(hit.at).toISOString()
        }
      }
      // Warm from the durable store so a fresh launch doesn't refetch everything. (audit F-12)
      const stored = this.persistent?.get(cacheKey)
      if (stored && Date.now() - stored.at < ttl) {
        this.cache.set(cacheKey, { at: stored.at, status: stored.status, body: stored.body })
        return {
          ok: stored.status >= 200 && stored.status < 300,
          status: stored.status,
          data: stored.body as T,
          fromCache: true,
          cachedAt: new Date(stored.at).toISOString()
        }
      }
    }

    const existing = this.inFlight.get(cacheKey)
    if (existing) return existing as Promise<HttpResult<T>>

    const task = this.execute<T>(url, opts, cacheKey, ttl)
    this.inFlight.set(cacheKey, task as Promise<HttpResult<unknown>>)
    try {
      return await task
    } finally {
      this.inFlight.delete(cacheKey)
    }
  }

  private async execute<T>(
    url: string,
    opts: RequestOptions,
    cacheKey: string,
    ttl: number
  ): Promise<HttpResult<T>> {
    const { maxRetries, timeoutMs } = this.limitsFor(opts.host)
    let attempt = 0
    let lastError = ''

    while (attempt <= maxRetries) {
      await this.acquireSlot(opts.host)

      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), timeoutMs)
      try {
        const res = await fetch(url, { signal: ac.signal, headers: { Accept: 'application/json' } })
        clearTimeout(timer)

        if (res.status === 429 || res.status >= 500) {
          const retryAfter = Number(res.headers.get('retry-after'))
          const backoff =
            Number.isFinite(retryAfter) && retryAfter > 0
              ? retryAfter * 1000
              : Math.min(15_000, 2 ** attempt * 1000)
          lastError = `HTTP ${res.status}`
          attempt++
          if (attempt <= maxRetries) {
            await sleep(backoff)
            continue
          }
          return (
            this.offlineFallback<T>(cacheKey) ?? {
              ok: false,
              status: res.status,
              data: null,
              fromCache: false,
              error: lastError
            }
          )
        }

        let body: unknown = null
        const text = await res.text()
        if (text) {
          try {
            body = JSON.parse(text)
          } catch {
            body = null
          }
        }

        if (ttl > 0 && res.ok) {
          const at = Date.now()
          this.cache.set(cacheKey, { at, status: res.status, body })
          this.persistent?.set(cacheKey, { status: res.status, body, at })
        }

        return {
          ok: res.ok,
          status: res.status,
          data: body as T,
          fromCache: false,
          error: res.ok ? undefined : `HTTP ${res.status}`
        }
      } catch (err) {
        clearTimeout(timer)
        const aborted = err instanceof Error && err.name === 'AbortError'
        lastError = aborted
          ? `Timed out after ${timeoutMs} ms`
          : err instanceof Error
            ? redact(err.message)
            : 'Network error'
        attempt++
        if (attempt <= maxRetries) {
          await sleep(Math.min(15_000, 2 ** attempt * 1000))
          continue
        }
      }
    }

    return (
      this.offlineFallback<T>(cacheKey) ?? {
        ok: false,
        status: 0,
        data: null,
        fromCache: false,
        error: redact(lastError) || 'Request failed'
      }
    )
  }
}

export const httpClient = new HttpClient()
