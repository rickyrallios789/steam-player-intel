import { describe, it, expect } from 'vitest'
import { extractMatchPlayerId, extractSearchPlayerId } from '../src/shared/battleMetricsMatch'

describe('extractMatchPlayerId (v0.10.2)', () => {
  it('reads the player id from relationships.player.data.id — NOT the identifier id', () => {
    const body = {
      data: [
        {
          type: 'identifier',
          id: 'IDENTIFIER_ID', // this must NOT be used as the player id
          relationships: { player: { data: { type: 'player', id: 'PLAYER_ID' } } }
        }
      ]
    }
    expect(extractMatchPlayerId(body)).toBe('PLAYER_ID')
  })

  it('returns null for empty / missing responses', () => {
    expect(extractMatchPlayerId(null)).toBe(null)
    expect(extractMatchPlayerId(undefined)).toBe(null)
    expect(extractMatchPlayerId({ data: [] })).toBe(null)
    expect(extractMatchPlayerId({ data: [{ id: 'x' }] })).toBe(null) // no relationships -> no match
  })
})

describe('extractSearchPlayerId (v0.10.2)', () => {
  const steam64 = '76561199043757000'

  it('accepts a player only when an included steamID identifier exactly matches', () => {
    const body = {
      data: [{ type: 'player', id: '999' }],
      included: [
        {
          type: 'identifier',
          attributes: { type: 'steamID', identifier: steam64 },
          relationships: { player: { data: { id: '999' } } }
        }
      ]
    }
    expect(extractSearchPlayerId(body, steam64)).toBe('999')
  })

  it('rejects a coincidental name-only match (no steamID identifier)', () => {
    const body = {
      data: [{ type: 'player', id: '999' }],
      included: [{ type: 'identifier', attributes: { type: 'name', identifier: 'ItzKlof' } }]
    }
    expect(extractSearchPlayerId(body, steam64)).toBe(null)
  })

  it('rejects a different steamID identifier', () => {
    const body = {
      included: [
        {
          type: 'identifier',
          attributes: { type: 'steamID', identifier: '76561190000000000' },
          relationships: { player: { data: { id: '123' } } }
        }
      ]
    }
    expect(extractSearchPlayerId(body, steam64)).toBe(null)
  })

  it('returns null for empty responses', () => {
    expect(extractSearchPlayerId(null, steam64)).toBe(null)
    expect(extractSearchPlayerId({ included: [] }, steam64)).toBe(null)
  })
})
