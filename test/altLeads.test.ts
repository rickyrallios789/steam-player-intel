import { describe, it, expect } from 'vitest'
import { findAltLeads, normalizeName, levenshtein, type CorrelationPlayer } from '../src/shared/altLeads'

const P = (
  steam64: string,
  displayName: string | null,
  names: string[],
  avatarHashes: string[],
  friends: string[] = []
): CorrelationPlayer => ({
  steam64,
  displayName,
  names,
  avatarHashes,
  friends
})

describe('normalizeName / levenshtein', () => {
  it('strips case and punctuation', () => {
    expect(normalizeName('xX_Sniper_Xx')).toBe('xxsniperxx')
    expect(normalizeName('John.Doe 99')).toBe('johndoe99')
  })
  it('computes edit distance', () => {
    expect(levenshtein('ricedog', 'ricedog')).toBe(0)
    expect(levenshtein('ricedog', 'ricedig')).toBe(1)
    expect(levenshtein('', 'abc')).toBe(3)
  })
})

describe('findAltLeads (v0.10.0)', () => {
  it('flags a shared, non-generic avatar as a lead', () => {
    const leads = findAltLeads([
      P('1', 'Alice', ['Alice'], ['hashA']),
      P('2', 'Bob', ['Bob'], ['hashA'])
    ])
    expect(leads.length).toBe(1)
    expect(leads[0].signals).toContain('Shared avatar image')
    expect(new Set([leads[0].a, leads[0].b])).toEqual(new Set(['1', '2']))
  })

  it('ignores a ubiquitous avatar hash (likely a default) shared by many accounts', () => {
    const distinctNames = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot']
    const many: CorrelationPlayer[] = distinctNames.map((n, i) => P(String(i), n, [n], ['defaultHash']))
    const leads = findAltLeads(many)
    expect(leads.length).toBe(0)
  })

  it('flags exact and near-identical names', () => {
    const leads = findAltLeads([
      P('1', 'xXsniperXx', ['xXsniperXx'], ['a1']),
      P('2', 'xX_Sniper_Xx', ['xX_Sniper_Xx'], ['b1']), // normalizes equal
      P('3', 'RiceDog', ['RiceDog'], ['c1']),
      P('4', 'RiceDog2', ['RiceDog2'], ['d1']) // substring
    ])
    const pairKey = (l: { a: string; b: string }) => [l.a, l.b].sort().join('-')
    const keys = leads.map(pairKey)
    expect(keys).toContain('1-2')
    expect(keys).toContain('3-4')
    for (const l of leads) expect(l.signals.some((s) => s.startsWith('Similar name'))).toBe(true)
  })

  it('scores shared-avatar-and-name higher than a single signal, and sorts by score', () => {
    const leads = findAltLeads([
      P('1', 'Ghost', ['Ghost'], ['sharedX']),
      P('2', 'Ghost', ['Ghost'], ['sharedX']), // same name + shared avatar
      P('3', 'Random', ['Random'], ['sharedY']),
      P('4', 'Rand0m', ['Rand0m'], ['other']) // name-only near match
    ])
    expect(leads[0].score).toBeGreaterThanOrEqual(leads[leads.length - 1].score)
    const top = leads[0]
    expect(new Set([top.a, top.b])).toEqual(new Set(['1', '2']))
    expect(top.signals.length).toBe(2)
  })

  it('returns nothing when there are no shared signals', () => {
    const leads = findAltLeads([
      P('1', 'Alpha', ['Alpha'], ['h1']),
      P('2', 'Bravo', ['Bravo'], ['h2'])
    ])
    expect(leads).toEqual([])
  })

  it('ignores very short / generic names', () => {
    const leads = findAltLeads([
      P('1', 'GG', ['GG'], ['h1']),
      P('2', 'GG', ['GG'], ['h2'])
    ])
    expect(leads).toEqual([])
  })

  it('flags accounts that share enough distinctive friends', () => {
    const leads = findAltLeads([
      P('1', 'Alpha', ['Alpha'], ['h1'], ['f1', 'f2', 'f3', 'f4']),
      P('2', 'Bravo', ['Bravo'], ['h2'], ['f1', 'f2', 'f3', 'f9'])
    ])
    expect(leads.length).toBe(1)
    expect(leads[0].signals.some((s) => s.includes('shared friends'))).toBe(true)
  })

  it('does not flag a pair sharing fewer than the minimum friends', () => {
    const leads = findAltLeads([
      P('1', 'Alpha', ['Alpha'], ['h1'], ['f1', 'f2']),
      P('2', 'Bravo', ['Bravo'], ['h2'], ['f1', 'f2'])
    ])
    expect(leads).toEqual([])
  })

  it('ignores ubiquitous friends shared by many accounts', () => {
    // Everyone shares f1..f4, so those friends are non-distinctive and should not link any pair.
    const shared = ['f1', 'f2', 'f3', 'f4']
    const distinctNames = ['Zephyr', 'Quokka', 'Basalt', 'Merlot', 'Cinder', 'Tundra', 'Vellum', 'Gadget', 'Harlequin']
    const many = distinctNames.map((n, i) => P(String(i), n, [n], [`av${i}`], shared))
    expect(findAltLeads(many)).toEqual([])
  })
})
