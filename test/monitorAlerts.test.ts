import { describe, it, expect } from 'vitest'
import { selectAlerts } from '../src/shared/monitorAlerts'
import type { ChangeEntry } from '../src/shared/types'

const e = (kind: ChangeEntry['kind'], field: string, label: string, after: ChangeEntry['after']): ChangeEntry => ({
  field,
  label,
  before: null,
  after,
  kind
})

describe('selectAlerts (watchlist monitoring)', () => {
  it('alerts on a new VAC ban', () => {
    expect(selectAlerts([e('ban', 'vacBans', 'New VAC ban detected', 1)]).map((a) => a.label)).toEqual([
      'New VAC ban detected'
    ])
  })
  it('alerts when a profile flips to private', () => {
    expect(selectAlerts([e('privacy', 'visibility', 'public → private', 'private')])).toHaveLength(1)
  })
  it('alerts on a new community ban', () => {
    expect(selectAlerts([e('ban', 'communityBanned', 'Community banned', true)]).map((a) => a.label)).toEqual([
      'Community banned'
    ])
  })
  it('does NOT alert on a community ban being lifted', () => {
    expect(selectAlerts([e('ban', 'communityBanned', 'Community ban lifted', false)])).toEqual([])
  })
  it('does NOT alert on going public, name, level, or playtime changes', () => {
    expect(
      selectAlerts([
        e('privacy', 'visibility', 'private → public', 'public'),
        e('name', 'displayName', 'Name changed', 'NewName'),
        e('level', 'steamLevel', 'Steam level changed', 42),
        e('playtime', 'totalPlaytime', '+10h total playtime', 600)
      ])
    ).toEqual([])
  })
})
