import { useEffect, useState } from 'react'
import { RefreshCw, Download, ExternalLink, ChevronDown } from 'lucide-react'
import type { PlayerReport } from '@shared/types'
import { formatHours, formatNumber, relativeTime, personaStateLabel } from '@shared/format'
import { CopyButton, useToast } from './ui'
import {
  OverviewTab,
  GamesTab,
  RustTab,
  ServersTab,
  SecurityTab,
  NamesTab,
  TimelineTab,
  ProfileTab,
  NotesTab,
  RawTab
} from './tabs'

const TABS = [
  'Overview',
  'Games',
  'Rust',
  'Servers',
  'Activity',
  'Names',
  'Security',
  'Timeline',
  'Profile',
  'Notes',
  'Raw Data'
] as const
type TabName = (typeof TABS)[number]

const PERSONA_COLOR: Record<string, string> = {
  online: 'var(--good)',
  'looking-to-play': 'var(--good)',
  'looking-to-trade': 'var(--good)',
  away: 'var(--warn)',
  snooze: 'var(--warn)',
  busy: 'var(--warn)',
  offline: 'var(--text-faint)'
}

export default function PlayerReportView({
  report,
  onRefresh
}: {
  report: PlayerReport
  onRefresh: () => void
}) {
  const [tab, setTab] = useState<TabName>('Overview')
  const [exportOpen, setExportOpen] = useState(false)
  const toast = useToast()
  const id = report.identity

  useEffect(() => setTab('Overview'), [report.identity.steam64])

  const doExport = async (fmt: 'json' | 'txt' | 'csv' | 'pdf') => {
    setExportOpen(false)
    const res = await window.api.exportReport(report, fmt, `player-${id.steam64}`)
    if (res.ok) toast(`Exported ${fmt.toUpperCase()}`)
    else if (!res.canceled) toast('Export failed')
  }

  const persona = id.personaState.value
  const vac = report.bans.numberOfVacBans.value
  const gameBans = report.bans.numberOfGameBans.value

  return (
    <div>
      {/* Header */}
      <div className="panel">
        <div className="row between center wrap" style={{ gap: 16 }}>
          <div className="player-header">
            {id.avatarUrl.value ? (
              <img className="avatar" src={id.avatarUrl.value} alt="avatar" />
            ) : (
              <div className="avatar" />
            )}
            <div>
              <div className="name">{id.displayName.value ?? 'Unknown player'}</div>
              <div className="meta">
                <span>
                  <span
                    className="online-dot"
                    style={{ background: persona ? PERSONA_COLOR[persona] : 'var(--text-faint)' }}
                  />
                  {persona
                    ? personaStateLabel(
                        ['offline', 'online', 'busy', 'away', 'snooze', 'looking-to-trade', 'looking-to-play'].indexOf(
                          persona
                        )
                      )
                    : 'Unknown'}
                </span>
                <span className="mono">{id.steam64}</span>
                <CopyButton text={id.steam64} />
                <span>Age: {report.accountAge.ageText.value ?? '—'}</span>
                <span>Level: {formatNumber(id.steamLevel.value)}</span>
                <span>Profile: {id.communityVisibility.value ?? 'unknown'}</span>
              </div>
            </div>
          </div>

          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn small" onClick={() => window.api.openExternal(id.profileUrl)}>
              Steam Profile <ExternalLink size={12} />
            </button>
            <button
              className="btn small"
              onClick={() => window.api.openExternal(`https://steamdb.info/calculator/${id.steam64}/`)}
            >
              SteamDB <ExternalLink size={12} />
            </button>
            <button
              className="btn small"
              onClick={() => window.api.openExternal(`https://www.battlemetrics.com/players?filter[search]=${id.steam64}`)}
            >
              BattleMetrics <ExternalLink size={12} />
            </button>
            <div style={{ position: 'relative' }}>
              <button
                className="btn small"
                onClick={() => setExportOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={exportOpen}
              >
                <Download size={13} /> Export <ChevronDown size={12} />
              </button>
              {exportOpen && (
                <div
                  className="panel"
                  style={{ position: 'absolute', right: 0, top: 34, zIndex: 20, padding: 6, minWidth: 130 }}
                >
                  {(['pdf', 'json', 'csv', 'txt'] as const).map((f) => (
                    <button
                      key={f}
                      className="nav-item"
                      style={{ padding: '7px 10px' }}
                      onClick={() => doExport(f)}
                    >
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className="btn small"
              onClick={onRefresh}
              title="Force refresh (bypass cache)"
              aria-label="Force refresh (bypass cache)"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
        <div className="muted small" style={{ marginTop: 10 }}>
          {report.dataFreshness
            .map((f) => `${f.label}: ${f.fromCache ? 'cached' : 'live'} ${relativeTime(f.fetchedAt)}`)
            .join('  ·  ')}
        </div>
      </div>

      {/* Change detection banner */}
      {report.changes.hasPrevious && report.changes.entries.length > 0 && (
        <>
          <div className="spacer" />
          <div className="changes-banner">
            <strong>{report.changes.entries.length} change(s) detected since last scan</strong>
            <span className="muted small"> ({relativeTime(report.changes.previousScanAt)})</span>
            <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
              {report.changes.entries.map((c, i) => (
                <span key={i} className="tag-chip">
                  {c.label}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Stat cards */}
      <div className="spacer" />
      <div className="stat-cards">
        <Stat label="Games" value={report.games.totalGames.value != null ? formatNumber(report.games.totalGames.value) : 'Private'} />
        <Stat
          label="Total Hours"
          value={report.games.totalPlaytimeMinutes.value != null ? formatHours(report.games.totalPlaytimeMinutes.value) : 'Private'}
        />
        <Stat label="Rust Hours" value={report.rust.totalHours.value != null ? `${formatNumber(report.rust.totalHours.value)}h` : '—'} rust />
        <Stat label="Steam Level" value={formatNumber(id.steamLevel.value)} />
        <Stat label="VAC Bans" value={vac != null ? String(vac) : '—'} danger={!!vac} />
        <Stat label="Game Bans" value={gameBans != null ? String(gameBans) : '—'} danger={!!gameBans} />
      </div>

      {/* Tabs */}
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && <OverviewTab report={report} />}
      {tab === 'Games' && <GamesTab report={report} />}
      {tab === 'Rust' && <RustTab report={report} />}
      {tab === 'Servers' && <ServersTab report={report} />}
      {tab === 'Activity' && <GamesTab report={report} recentOnly />}
      {tab === 'Names' && <NamesTab report={report} />}
      {tab === 'Security' && <SecurityTab report={report} />}
      {tab === 'Timeline' && <TimelineTab report={report} />}
      {tab === 'Profile' && <ProfileTab report={report} />}
      {tab === 'Notes' && <NotesTab report={report} />}
      {tab === 'Raw Data' && <RawTab report={report} />}
    </div>
  )
}

function Stat({ label, value, rust, danger }: { label: string; value: string; rust?: boolean; danger?: boolean }) {
  return (
    <div className="stat-card">
      <div className="label">{label}</div>
      <div className={`value ${rust ? 'rust' : ''}`} style={danger ? { color: 'var(--bad)' } : undefined}>
        {value}
      </div>
    </div>
  )
}
