import { describe, it, expect } from 'vitest'
import { buildAccountAge, ageBreakdown, ageText } from '../src/shared/accountAge'

const CREATED = 1_262_304_000 // 2010-01-01 UTC
const NOW = 1_609_459_200 // 2021-01-01 UTC (11 calendar years later)

describe('ageBreakdown', () => {
  it('computes years/months/days deterministically', () => {
    const parts = ageBreakdown(CREATED, NOW)
    expect(parts.totalDays).toBe(4018)
    expect(parts.years).toBe(11)
    expect(parts.months).toBe(0)
    expect(parts.days).toBe(0)
  })

  it('uses real calendar month lengths, not a fixed 30-day month (audit F-11)', () => {
    const from = Math.floor(Date.UTC(2010, 2, 15) / 1000) // 2010-03-15
    const now = Math.floor(Date.UTC(2020, 0, 10) / 1000) // 2020-01-10
    const parts = ageBreakdown(from, now)
    expect([parts.years, parts.months, parts.days]).toEqual([9, 9, 26])
    expect(ageText(parts)).toBe('9 years, 9 months')
  })

  it('reports a sub-year span with real months and days', () => {
    const from = Math.floor(Date.UTC(2023, 0, 10) / 1000) // 2023-01-10
    const now = Math.floor(Date.UTC(2023, 4, 12) / 1000) // 2023-05-12
    const parts = ageBreakdown(from, now)
    expect([parts.years, parts.months, parts.days]).toEqual([0, 4, 2])
  })
})

describe('buildAccountAge', () => {
  it('marks an exact creation date as verified', () => {
    const info = buildAccountAge(CREATED, false, NOW)
    expect(info.createdAt.status).toBe('verified')
    expect(info.createdAt.value).toBe(CREATED)
    expect(info.approxCreationYear.value).toBe(2010)
    expect(info.ageYears.value).toBeCloseTo(11.0, 1)
    expect(info.daysSinceCreation.value).toBe(4018)
  })
  it('reports private when hidden by privacy and never fabricates a date', () => {
    const info = buildAccountAge(null, true, NOW)
    expect(info.createdAt.status).toBe('private')
    expect(info.createdAt.value).toBeNull()
    expect(info.ageText.value).toBeNull()
  })
  it('reports unknown when the source simply did not provide it', () => {
    const info = buildAccountAge(null, false, NOW)
    expect(info.createdAt.status).toBe('unknown')
    expect(info.createdAt.value).toBeNull()
  })
})
