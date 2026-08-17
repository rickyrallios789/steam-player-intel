import { describe, it, expect } from 'vitest'
import { csvField, gamesToCsv } from '../src/shared/csv'
import type { GameStat } from '../src/shared/types'

describe('csvField (audit F-19)', () => {
  it('neutralizes formula-trigger leading characters', () => {
    expect(csvField('=SUM(A1)')).toBe(`"'=SUM(A1)"`)
    expect(csvField('+1')).toBe(`"'+1"`)
    expect(csvField('-1')).toBe(`"'-1"`)
    expect(csvField('@cmd')).toBe(`"'@cmd"`)
  })
  it('quotes and escapes normal text', () => {
    expect(csvField('normal')).toBe(`"normal"`)
    expect(csvField('a "quoted" name')).toBe(`"a ""quoted"" name"`)
    expect(csvField('with,comma')).toBe(`"with,comma"`)
  })
})

describe('gamesToCsv', () => {
  const g = (appId: number, name: string | null, forever: number, two = 0): GameStat => ({
    appId,
    name,
    playtimeForeverMinutes: forever,
    playtime2weeksMinutes: two,
    iconUrl: null
  })
  it('sorts by playtime and neutralizes a malicious game name', () => {
    const csv = gamesToCsv([g(1, 'Alpha', 600), g(2, '=HYPERLINK("http://evil")', 12000)])
    const lines = csv.split('\n')
    expect(lines[0]).toBe('appId,name,playtime_hours,playtime_2weeks_hours')
    expect(lines[1]).toBe(`2,"'=HYPERLINK(""http://evil"")",200.0,0.0`)
    expect(lines[2]).toBe('1,"Alpha",10.0,0.0')
  })
})
