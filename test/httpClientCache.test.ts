import { describe, it, expect, vi, afterEach } from 'vitest'
import { HttpClient, type PersistentCache } from '../src/main/core/httpClient'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function memStore(
  seed?: Record<string, { status: number; body: unknown; at: number }>
): PersistentCache & { map: Map<string, { status: number; body: unknown; at: number }> } {
  const map = new Map(Object.entries(seed ?? {}))
  return {
    map,
    get: (k) => map.get(k) ?? null,
    set: (k, e) => {
      map.set(k, e)
    }
  }
}

describe('HttpClient persistent cache + offline fallback (audit F-12)', () => {
  it('warms from the persistent store within TTL without fetching', async () => {
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    const c = new HttpClient()
    c.usePersistentCache(memStore({ k1: { status: 200, body: { hello: 'world' }, at: Date.now() } }))
    const res = await c.getJson('https://example.com/x', { host: 'example.com', cacheKey: 'k1', cacheTtlMs: 60_000 })
    expect(res.fromCache).toBe(true)
    expect(res.stale).toBeFalsy()
    expect(res.data).toEqual({ hello: 'world' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('persists a successful response to the durable store', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ n: 1 }), { status: 200 })) as unknown as typeof fetch
    const c = new HttpClient()
    const store = memStore()
    c.usePersistentCache(store)
    const res = await c.getJson('https://example.com/y', { host: 'example.com', cacheKey: 'k2', cacheTtlMs: 60_000 })
    expect(res.ok).toBe(true)
    expect(res.fromCache).toBe(false)
    expect(store.map.get('k2')?.body).toEqual({ n: 1 })
  })

  it('serves last-known-good (stale) when the live fetch fails', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    const c = new HttpClient()
    c.usePersistentCache(memStore({ k3: { status: 200, body: { cached: true }, at: Date.now() - 10 * 60_000 } }))
    const res = await c.getJson('https://example.com/z', { host: 'example.com', cacheKey: 'k3', cacheTtlMs: 60_000 })
    expect(res.stale).toBe(true)
    expect(res.fromCache).toBe(true)
    expect(res.data).toEqual({ cached: true })
  }, 20_000)
})
