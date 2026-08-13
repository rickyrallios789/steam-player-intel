import { useState } from 'react'
import { GitCompare, Loader2 } from 'lucide-react'
import type { PlayerReport } from '@shared/types'
import { formatHours, formatNumber } from '@shared/format'
import type { SettingsStatus } from '../global'

type Slot = PlayerReport | null

export default function Compare({ status }: { status: SettingsStatus | null }) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [ra, setRa] = useState<Slot>(null)
  const [rb, setRb] = useState<Slot>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const run = async () => {
    if (!a.trim() || !b.trim()) return
    setLoading(true)
    setErr(null)
    // persist:false so comparisons don't inflate scan history counts.
    const [x, y] = await Promise.all([
      window.api.analyze(a, { persist: false }),
      window.api.analyze(b, { persist: false })
    ])
    if (!x.ok) setErr(`Player A: ${x.error}`)
    if (!y.ok) setErr((p) => (p ? p + ` · Player B: ${y.error}` : `Player B: ${y.error}`))
    setRa(x.report ?? null)
    setRb(y.report ?? null)
    setLoading(false)
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Compare players</h2>
      {!status?.steamKeySet && <div className="callout info" style={{ marginBottom: 12 }}>Add a Steam API key in Settings first.</div>}
      <div className="row" style={{ gap: 10, maxWidth: 760 }}>
        <input className="text" placeholder="Player A — Steam ID / URL / vanity" value={a} onChange={(e) => setA(e.target.value)} />
        <input className="text" placeholder="Player B — Steam ID / URL / vanity" value={b} onChange={(e) => setB(e.target.value)} />
        <button className="btn primary" disabled={loading || !a.trim() || !b.trim()} onClick={run}>
          {loading ? <Loader2 size={15} className="spin" /> : <GitCompare size={15} />} Compare
        </button>
      </div>
      {err && <div className="callout" style={{ borderLeftColor: 'var(--bad)', marginTop: 12 }}>{err}</div>}

      {ra && rb && (
        <>
          <div className="spacer" />
          <ComparisonTable a={ra} b={rb} />
          <div className="spacer" />
          <Relationship a={ra} b={rb} />
        </>
      )}
    </div>
  )
}

function ComparisonTable({ a, b }: { a: PlayerReport; b: PlayerReport }) {
  const rows: Array<[string, string, string]> = [
    ['Name', a.identity.displayName.value ?? '—', b.identity.displayName.value ?? '—'],
    ['Account age', a.accountAge.ageText.value ?? '—', b.accountAge.ageText.value ?? '—'],
    ['Steam level', formatNumber(a.identity.steamLevel.value), formatNumber(b.identity.steamLevel.value)],
    ['Total games', formatNumber(a.games.totalGames.value), formatNumber(b.games.totalGames.value)],
    ['Total hours', hrs(a), hrs(b)],
    ['Rust hours', a.rust.totalHours.value != null ? `${a.rust.totalHours.value}h` : '—', b.rust.totalHours.value != null ? `${b.rust.totalHours.value}h` : '—'],
    ['VAC bans', String(a.bans.numberOfVacBans.value ?? '—'), String(b.bans.numberOfVacBans.value ?? '—')],
    ['Game bans', String(a.bans.numberOfGameBans.value ?? '—'), String(b.bans.numberOfGameBans.value ?? '—')]
  ]
  return (
    <div className="panel" style={{ padding: 0 }}>
      <table className="data">
        <thead>
          <tr>
            <th></th>
            <th>Player A</th>
            <th>Player B</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, x, y]) => (
            <tr key={k}>
              <td className="muted">{k}</td>
              <td>{x}</td>
              <td>{y}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function hrs(r: PlayerReport): string {
  return r.games.totalPlaytimeMinutes.value != null ? formatHours(r.games.totalPlaytimeMinutes.value) : 'Private'
}

function Relationship({ a, b }: { a: PlayerReport; b: PlayerReport }) {
  const ga = new Set((a.games.allGames.value ?? []).map((g) => g.appId))
  const gb = new Set((b.games.allGames.value ?? []).map((g) => g.appId))
  const shared = [...ga].filter((x) => gb.has(x))
  const smaller = Math.min(ga.size, gb.size) || 1
  const ratio = shared.length / smaller

  const sharedServers = a.servers.filter((s) => b.servers.some((t) => t.serverName === s.serverName))

  const signals: string[] = []
  const nameA = (a.identity.displayName.value ?? '').toLowerCase()
  const nameB = (b.identity.displayName.value ?? '').toLowerCase()
  if (nameA && nameB && (nameA === nameB || nameA.includes(nameB) || nameB.includes(nameA)))
    signals.push('Display names are identical or one contains the other.')
  if (ga.size > 0 && gb.size > 0 && ratio > 0.6) signals.push(`High shared-library overlap (${shared.length} of ${smaller} games).`)
  if (a.rust.totalHours.value && b.rust.totalHours.value) {
    const hi = Math.max(a.rust.totalHours.value, b.rust.totalHours.value)
    const lo = Math.min(a.rust.totalHours.value, b.rust.totalHours.value)
    if (hi > 0 && lo / hi > 0.8) signals.push('Similar Rust playtime magnitude.')
  }
  if (sharedServers.length > 0) signals.push(`${sharedServers.length} shared server appearance(s).`)

  const confidence = signals.length >= 3 ? 'Higher' : signals.length === 2 ? 'Moderate' : signals.length === 1 ? 'Low' : 'None'

  return (
    <div className="panel">
      <div className="section-title">Account relationship analysis</div>
      <div className="callout" style={{ marginBottom: 12 }}>
        This never claims two accounts belong to the same person. It lists observable similarities only. Correlation is
        not proof of a shared owner.
      </div>
      <div className="row wrap" style={{ gap: 26, marginBottom: 12 }}>
        <div>
          <div className="muted small">Shared games</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{ga.size && gb.size ? shared.length : '—'}</div>
        </div>
        <div>
          <div className="muted small">Shared servers</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{sharedServers.length}</div>
        </div>
        <div>
          <div className="muted small">Indicator confidence</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{confidence}</div>
        </div>
      </div>
      {signals.length === 0 ? (
        <div className="muted">No notable relationship indicators found in the available public data.</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {signals.map((s, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
