import { describe, it, expect } from 'vitest'
import { buildRosterDigest, type RosterMemberResult } from '../src/shared/rosterDigest'

describe('buildRosterDigest (scheduled roster re-screen)', () => {
  it('stays quiet when nothing notable changed', () => {
    const results: RosterMemberResult[] = [
      { steam64: '76561198000000001', name: 'Alice', alerts: [] },
      { steam64: '76561198000000002', name: 'Bob', alerts: [], error: true }
    ]
    const d = buildRosterDigest('Regulars', results)
    expect(d.hasNotable).toBe(false)
    expect(d.content).toBe('')
    expect(d.checked).toBe(2)
    expect(d.flagged).toBe(0)
    expect(d.errors).toBe(1)
  })

  it('summarises flagged members with their alerts and profile links', () => {
    const results: RosterMemberResult[] = [
      { steam64: '76561198000000001', name: 'Alice', alerts: [] },
      { steam64: '76561198000000002', name: 'Cheater?', alerts: ['New VAC ban', 'Profile went private'] }
    ]
    const d = buildRosterDigest('Main server', results)
    expect(d.hasNotable).toBe(true)
    expect(d.flagged).toBe(1)
    expect(d.content).toContain('Main server')
    expect(d.content).toContain('Cheater?')
    expect(d.content).toContain('New VAC ban')
    expect(d.content).toContain('Profile went private')
    expect(d.content).toContain('https://steamcommunity.com/profiles/76561198000000002')
    // Non-accusatory framing: presented as changes to review, not proof.
    expect(d.content).toContain('changes to review')
  })

  it('caps content length for very large rosters', () => {
    const results: RosterMemberResult[] = Array.from({ length: 200 }, (_, i) => ({
      steam64: `7656119800000${String(i).padStart(4, '0')}`,
      name: `Player ${i} with a fairly long display name to pad the digest`,
      alerts: ['New game ban']
    }))
    const d = buildRosterDigest('Huge', results)
    expect(d.hasNotable).toBe(true)
    expect(d.content.length).toBeLessThanOrEqual(1920)
    expect(d.content).toContain('truncated')
  })
})
