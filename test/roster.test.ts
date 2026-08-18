import { describe, it, expect } from 'vitest'
import { parseRosterInput } from '../src/shared/roster'

describe('parseRosterInput (bulk screen)', () => {
  it('splits on newlines, commas, semicolons and spaces', () => {
    expect(
      parseRosterInput('76561198000000001\n76561198000000002, 76561198000000003;76561198000000004 76561198000000005')
    ).toEqual([
      '76561198000000001',
      '76561198000000002',
      '76561198000000003',
      '76561198000000004',
      '76561198000000005'
    ])
  })
  it('trims and drops empty tokens', () => {
    expect(parseRosterInput('  a \n\n  b  ')).toEqual(['a', 'b'])
  })
  it('dedupes case-insensitively, keeping the first form', () => {
    expect(parseRosterInput('Gaben\ngaben\nGABEN')).toEqual(['Gaben'])
  })
  it('keeps profile URLs intact', () => {
    expect(
      parseRosterInput('https://steamcommunity.com/id/gaben\nhttps://steamcommunity.com/profiles/76561197960287930')
    ).toEqual(['https://steamcommunity.com/id/gaben', 'https://steamcommunity.com/profiles/76561197960287930'])
  })
})
