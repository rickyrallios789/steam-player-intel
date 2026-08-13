/**
 * LocalHistoryProvider — surfaces THIS application's own observation history
 * (spec §19, §30). Distinct from network providers: its "source" is always
 * labelled 'application', so the UI can clearly separate what the app itself has
 * seen from what an external source (Steam/BattleMetrics) reported.
 */
import type { Repositories } from '../db/repositories'
import type { NameObservation, ServerObservation } from '../../shared/types'

export interface ApplicationHistory {
  firstObserved: string | null
  lastObserved: string | null
  scanCount: number
}

export class LocalHistoryProvider {
  readonly id = 'application'
  readonly name = 'Application History'
  readonly source = 'application' as const

  constructor(private repos: Repositories) {}

  getApplicationHistory(steam64: string): ApplicationHistory {
    const player = this.repos.getPlayer(steam64)
    if (!player) return { firstObserved: null, lastObserved: null, scanCount: 0 }
    return {
      firstObserved: player.first_observed,
      lastObserved: player.last_observed,
      scanCount: player.scan_count
    }
  }

  /** Names observed by THIS app over time (kind = 'observed'). */
  getObservedNames(steam64: string): NameObservation[] {
    return this.repos.getNameObservations(steam64).map((n) => ({
      name: n.name,
      firstSeen: n.first_seen,
      lastSeen: n.last_seen,
      source: 'application',
      kind: 'observed'
    }))
  }

  getObservedServers(steam64: string): ServerObservation[] {
    const rows = this.repos.getServerObservations(steam64) as Array<{
      server_id: string | null
      server_name: string
      game: string | null
      region: string | null
      first_seen: string
      last_seen: string
      observations: number
    }>
    return rows.map((r) => ({
      serverName: r.server_name,
      serverId: r.server_id,
      ip: null,
      game: r.game ?? 'unknown',
      region: r.region,
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
      observations: r.observations,
      source: 'application',
      status: 'unknown'
    }))
  }
}
