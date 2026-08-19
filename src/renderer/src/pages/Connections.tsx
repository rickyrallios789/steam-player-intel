import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Link2, Info } from 'lucide-react'
import type { ConnectionsResult } from '../global'

/**
 * Possible connections — correlates the accounts you've already scanned by shared
 * local signals (avatar images, similar names). Everything here is a LEAD to review,
 * never proof: people reuse avatars and names for countless innocent reasons.
 */
export default function Connections({ onAnalyze }: { onAnalyze: (steam64: string) => void }) {
  const [data, setData] = useState<ConnectionsResult | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await window.api.connections.find())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const leads = data?.leads ?? []

  return (
    <div>
      <div className="row center between wrap" style={{ marginTop: 0, gap: 10 }}>
        <h2 style={{ margin: 0 }}>Possible connections</h2>
        <button className="btn" onClick={load} disabled={loading} title="Rescan" aria-label="Rescan">
          {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      <div className="callout info" style={{ marginTop: 12 }}>
        <div className="row center" style={{ gap: 8 }}>
          <Info size={16} />
          <strong>These are leads to review — not proof of anything.</strong>
        </div>
        <div className="small" style={{ marginTop: 6 }}>
          This compares accounts you've already scanned and flags ones that share an avatar image or a very similar
          name. People reuse avatars and names for many innocent reasons, so treat every entry as a starting point for
          your own investigation. Nothing here is sent anywhere — it's computed entirely from your local history.
        </div>
      </div>

      <div className="spacer" />

      {loading ? (
        <div className="muted small">
          <Loader2 size={12} className="spin" /> Scanning your history…
        </div>
      ) : leads.length === 0 ? (
        <div className="panel">
          <div className="empty">
            No shared signals found among your {data?.players ?? 0} scanned account
            {(data?.players ?? 0) === 1 ? '' : 's'}.
            <div className="small" style={{ marginTop: 8 }}>
              The more players you analyze over time, the more connections this can surface — matching avatars or
              near-identical names across accounts will appear here as leads.
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="muted small" style={{ marginBottom: 10 }}>
            {leads.length} possible connection{leads.length === 1 ? '' : 's'} across {data?.players ?? 0} scanned
            accounts.
          </div>
          {leads.map((lead, i) => (
            <div className="panel" key={lead.a + lead.b + i} style={{ marginBottom: 10 }}>
              <div className="row center wrap" style={{ gap: 8 }}>
                <a onClick={() => onAnalyze(lead.a)} style={{ cursor: 'pointer', fontWeight: 600 }} title="Open report">
                  {lead.aName ?? lead.a}
                </a>
                <Link2 size={14} className="muted" />
                <a onClick={() => onAnalyze(lead.b)} style={{ cursor: 'pointer', fontWeight: 600 }} title="Open report">
                  {lead.bName ?? lead.b}
                </a>
              </div>
              <div className="mono small muted" style={{ marginTop: 2 }}>
                {lead.a} ↔ {lead.b}
              </div>
              <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                {lead.signals.map((s, j) => (
                  <span key={j} className="tag-chip">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
