import { useCallback, useEffect, useState } from 'react'
import { Activity, Star, Users, RefreshCw, Search, Loader2, ShieldAlert } from 'lucide-react'
import { formatNumber, relativeTime } from '@shared/format'
import type { ActivityEvent } from '@shared/activityFeed'
import type { HomeOverview, SettingsStatus } from '../global'
import { useToast } from '../components/ui'

function isHighSignalChange(c: ActivityEvent['changes'][number]): boolean {
  return c.kind === 'ban' || (c.kind === 'privacy' && c.after === 'private')
}

/**
 * Command-center home: a single glance at everything this app is tracking, plus a
 * feed of the real changes it has recorded across players. Every number and event
 * comes from local scan history — nothing here is fabricated.
 */
export default function Home({
  status,
  onAnalyze,
  goSettings
}: {
  status: SettingsStatus | null
  onAnalyze: (steam64: string) => void
  goSettings: () => void
}) {
  const [data, setData] = useState<HomeOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const toast = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await window.api.home.overview())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const checkFavorites = async (): Promise<void> => {
    setChecking(true)
    try {
      const res = await window.api.monitor.runNow()
      toast(
        res.checked === 0
          ? 'No favorites to check (star players to watch them).'
          : `Checked ${res.checked} favorite${res.checked === 1 ? '' : 's'} · ${res.alerts} alert${res.alerts === 1 ? '' : 's'}`
      )
      await load()
    } finally {
      setChecking(false)
    }
  }

  return (
    <div>
      <div className="row center between wrap" style={{ marginTop: 0, gap: 10 }}>
        <h2 style={{ margin: 0 }}>Home</h2>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={checkFavorites} disabled={checking}>
            {checking ? <Loader2 size={14} className="spin" /> : <ShieldAlert size={14} />} Check favorites now
          </button>
          <button className="btn" onClick={load} disabled={loading} title="Refresh" aria-label="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {!status?.steamKeySet && (
        <div className="callout" style={{ borderLeftColor: 'var(--warn)', marginTop: 12 }}>
          <strong>Add your Steam Web API key</strong> to start analyzing players.{' '}
          <button className="btn small" onClick={goSettings} style={{ marginLeft: 6 }}>
            Open Settings
          </button>
        </div>
      )}

      <div className="stat-cards" style={{ marginTop: 14 }}>
        <StatCard icon={<Users size={16} />} label="Players tracked" value={formatNumber(data?.trackedPlayers ?? 0)} />
        <StatCard icon={<Star size={16} />} label="Favorites" value={formatNumber(data?.favorites ?? 0)} />
        <StatCard icon={<Activity size={16} />} label="Scans recorded" value={formatNumber(data?.totalScans ?? 0)} />
      </div>

      <div className="spacer" />
      <div className="panel">
        <div className="section-title">Recent activity</div>
        <div className="muted small" style={{ marginBottom: 10 }}>
          Changes this app has recorded across every player you've scanned — new bans and privacy changes are
          highlighted. These are facts from public data, not accusations.
        </div>

        {loading ? (
          <div className="muted small">
            <Loader2 size={12} className="spin" /> Loading…
          </div>
        ) : !data || data.events.length === 0 ? (
          <div className="empty">
            No changes recorded yet.
            <div className="small" style={{ marginTop: 8 }}>
              As you analyze players over time (or background monitoring runs), any changes between scans — new bans,
              a profile going private, name or playtime changes — show up here.
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="btn small primary" onClick={() => onAnalyze('')}>
                <Search size={13} /> Search a player
              </button>
            </div>
          </div>
        ) : (
          <div className="timeline-line">
            {data.events.map((e, i) => (
              <div className="timeline-item" key={e.steam64 + e.at + i}>
                <div className="timeline-dot" />
                <div>
                  <div className="row center wrap" style={{ gap: 8 }}>
                    <a
                      onClick={() => onAnalyze(e.steam64)}
                      style={{ cursor: 'pointer', fontWeight: 600 }}
                      title="Open this player's report"
                    >
                      {e.displayName ?? e.steam64}
                    </a>
                    <span className="muted small">{relativeTime(e.at)}</span>
                  </div>
                  <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                    {e.changes.map((c, j) => (
                      <span
                        key={j}
                        className="tag-chip"
                        style={isHighSignalChange(c) ? { borderColor: 'var(--bad)', color: 'var(--bad)' } : undefined}
                      >
                        {c.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="stat-card">
      <div className="label row center" style={{ gap: 6 }}>
        {icon} {label}
      </div>
      <div className="value">{value}</div>
    </div>
  )
}
