import { describe, it, expect } from 'vitest'
import { buildDiscordAlert } from '../src/shared/webhook'

describe('buildDiscordAlert (webhook alerts)', () => {
  it('includes player, message and profile link', () => {
    const p = buildDiscordAlert('CoolGuy', 'New VAC ban detected', '76561198000000000')
    expect(p.content).toContain('CoolGuy')
    expect(p.content).toContain('New VAC ban detected')
    expect(p.content).toContain('https://steamcommunity.com/profiles/76561198000000000')
  })
})
