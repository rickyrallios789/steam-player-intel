/**
 * HTTP client with per-host rate limiting, exponential backoff, in-flight
 * de-duplication and TTL caching. (spec §27)
 *
 * Runs in the Electron MAIN process only. API keys are attached here and never
 * cross the IPC bridge to the renderer.
 */

interface RateLimitOptions {
  /** Minimum milliseconds between requests to the same host. */
  minIntervalMs: number
  /** Max retries on 429 / 5xx. */
  maxRetries: number
}

interface RequestOptions {
  host: string
  cacheKey?: string
  cacheTtlMs?: number
  /** Force a fresh fetch, ignoring cache. */
  bypassCache?: boolean
  signal?: AbortSignal
}

interface CacheEntry {
  at: number
  status: number
  body: unknown
}

const DEFAULT_LIMITS: Record<string, RateLimitOptions> = {
  'api.steampowered.com': { minIntervalMs: 1100, maxRetries: 3 },
  'api.battlemetrics.com': { minIntervalMs: 1100, maxRetries: 3 },
  default: { minIntervalMs: 800, maxRetries: 2 }
}

export interface HttpResult<T> {
  ok: boolean
  status: number
  data: T | null
  fromCache: boolean
  cachedAt?: string
  error?: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class HttpClient {
  private lastRequestAt = new Map<string, number>()
  private inFlight = new Map<string, Promise<HttpResult<unknown>>>()
  private cache = new Map<string, CacheEntry>()

  private limitsFor(host: string): RateLimitOptions {
    return DEFAULT_LIMITS[host] ?? DEFAULT_LIMITS.default
  }

  private async throttle(host: string): Promise<void> {
    const { minIntervalMs } = this.limitsFor(host)
    const last = this.lastRequestAt.get(host) ?? 0
    const wait = last + minIntervalMs - Date.now()
    if (wait > 0) await sleep(wait)
    this.lastRequestAt.set(host, Date.now())
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

    // Serve from cache.
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
    }

    // De-duplicate identical concurrent requests.
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
    const { maxRetries } = this.limitsFor(opts.host)
    let attempt = 0
    let lastError = ''

    while (attempt <= maxRetries) {
      await this.throttle(opts.host)
      try {
        const res = await fetch(url, {
          signal: opts.signal,
          headers: { Accept: 'application/json' }
        })

        // Retryable statuses.
        if (res.status === 429 || res.status >= 500) {
          const retryAfter = Number(res.headers.get('retry-after'))
          const backoff = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : Math.min(15000, 2 ** attempt * 1000)
          lastError = `HTTP ${res.status}`
          attempt++
          if (attempt <= maxRetries) {
            await sleep(backoff)
            continue
          }
          return { ok: false, status: res.status, data: null, fromCache: false, error: lastError }
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
          this.cache.set(cacheKey, { at: Date.now(), status: res.status, body })
        }

        return {
          ok: res.ok,
          status: res.status,
          data: body as T,
          fromCache: false,
          error: res.ok ? undefined : `HTTP ${res.status}`
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Network error'
        attempt++
        if (attempt <= maxRetries) {
          await sleep(Math.min(15000, 2 ** attempt * 1000))
          continue
        }
      }
    }

    return { ok: false, status: 0, data: null, fromCache: false, error: lastError || 'Request failed' }
  }
}

export const httpClient = new HttpClient()
