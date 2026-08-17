import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Loader2, AlertCircle } from 'lucide-react'
import { detectSteamInput } from '@shared/steamid'
import type { PlayerReport } from '@shared/types'
import { Skeleton } from '../components/ui'
import PlayerReportView from '../components/PlayerReportView'
import type { SettingsStatus } from '../global'

export default function Dashboard({
  status,
  pendingQuery,
  clearPending,
  goSettings
}: {
  status: SettingsStatus | null
  pendingQuery: string | null
  clearPending: () => void
  goSettings: () => void
}) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<PlayerReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reqRef = useRef(0)

  const detection = useMemo(() => (query.trim() ? detectSteamInput(query) : null), [query])

  const run = async (raw: string, bypassCache = false) => {
    if (!raw.trim()) return
    // Guard against out-of-order results: a newer search supersedes this one. (audit F-4)
    const myReq = ++reqRef.current
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.analyze(raw, { bypassCache })
      if (myReq !== reqRef.current) return
      if (res.ok && res.report) setReport(res.report)
      else {
        setError(res.error ?? 'Analysis failed.')
        setReport(null)
      }
    } catch (e) {
      if (myReq !== reqRef.current) return
      setError(e instanceof Error ? e.message : 'Unexpected error.')
    } finally {
      if (myReq === reqRef.current) setLoading(false)
    }
  }

  // Handle "analyze this player" coming from History/Favorites.
  useEffect(() => {
    if (pendingQuery) {
      setQuery(pendingQuery)
      run(pendingQuery)
      clearPending()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuery])

  return (
    <div>
      <div className="search-wrap">
        <div className="search-bar">
          <Search size={18} className="muted" />
          <input
            aria-label="Steam ID, profile URL, or vanity name"
            placeholder="Paste Steam ID, profile URL, or vanity name…  e.g. 76561198000000000"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run(query)}
            spellCheck={false}
            autoFocus
          />
          <button className="btn primary" disabled={loading || !query.trim()} onClick={() => run(query)}>
            {loading ? <Loader2 size={15} className="spin" /> : <Search size={15} />}
            Analyze
          </button>
        </div>
        <div className="detected">
          {detection && detection.kind !== 'unknown' && <>Detected: {detection.label}</>}
          {detection && detection.kind === 'unknown' && query.trim() && (
            <span style={{ color: 'var(--warn)' }}>Unrecognized format — will attempt vanity resolution</span>
          )}
        </div>
      </div>

      {!status?.steamKeySet && !report && !loading && (
        <div className="search-wrap" style={{ marginTop: 18 }}>
          <div className="callout info">
            <strong>Welcome to Steam Player Intel.</strong> Three quick steps to your first lookup:
            <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
              <li>Grab a free Steam Web API key at steamcommunity.com/dev/apikey.</li>
              <li>
                Paste it into{' '}
                <a onClick={goSettings} style={{ cursor: 'pointer' }}>
                  Settings
                </a>
                .
              </li>
              <li>Come back here and enter any Steam ID, profile URL, or vanity name above.</li>
            </ol>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ marginTop: 26 }}>
          <div className="panel">
            <div className="row center" style={{ gap: 18 }}>
              <Skeleton w={84} h={84} />
              <div style={{ flex: 1 }}>
                <Skeleton w={220} h={22} />
                <div className="spacer" />
                <Skeleton w={340} h={14} />
              </div>
            </div>
          </div>
          <div className="spacer" />
          <div className="stat-cards">
            {Array.from({ length: 6 }).map((_, i) => (
              <div className="stat-card" key={i}>
                <Skeleton w={70} h={12} />
                <div className="spacer" />
                <Skeleton w={90} h={26} />
              </div>
            ))}
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="search-wrap" style={{ marginTop: 22 }}>
          <div className="callout" style={{ borderLeftColor: 'var(--bad)' }}>
            <div className="row center" style={{ gap: 8 }}>
              <AlertCircle size={16} style={{ color: 'var(--bad)' }} />
              <strong>Could not complete analysis</strong>
            </div>
            <div style={{ marginTop: 6 }}>{error}</div>
          </div>
        </div>
      )}

      {report && !loading && (
        <div style={{ marginTop: 24 }}>
          <PlayerReportView report={report} onRefresh={() => run(report.identity.steam64, true)} />
        </div>
      )}
    </div>
  )
}
