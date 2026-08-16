import { describe, it, expect, vi, afterEach } from 'vitest'
import { HttpClient } from '../src/main/core/httpClient'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

describe('HttpClient rate limiting (audit F-1)', () => {
  it('serializes and spaces concurrent requests to the same host', async () => {
    const starts: number[] = []
    globalThis.fetch = vi.fn(async () => {
      starts.push(Date.now())
      return new Response(JSON.stringify({ ok: 1 }), { status: 200 })
    }) as unknown as typeof fetch

    const c = new HttpClient()
    const host = 'api.steampowered.com' // 350ms min interval
    await Promise.all(
      [0, 1, 2, 3].map((i) => c.getJson(`https://${host}/x?i=${i}`, { host, cacheTtlMs: 0 }))
    )

    expect(starts.length).toBe(4)
    const gaps = starts.slice(1).map((t, i) => t - starts[i])
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(300) // ~350ms spacing enforced
  })

  it('de-duplicates identical concurrent requests', async () => {
    let calls = 0
    globalThis.fetch = vi.fn(async () => {
      calls++
      return new Response(JSON.stringify({ n: calls }), { status: 200 })
    }) as unknown as typeof fetch

    const c = new HttpClient()
    const url = 'https://example.com/same'
    const [a, b] = await Promise.all([
      c.getJson(url, { host: 'example.com' }),
      c.getJson(url, { host: 'example.com' })
    ])
    expect(calls).toBe(1)
    expect(a.data).toEqual(b.data)
  })
})
