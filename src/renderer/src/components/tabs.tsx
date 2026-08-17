import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Trash2, Plus, ShieldCheck, ShieldAlert, Ban, HelpCircle } from 'lucide-react'
import type { GameStat, PlayerReport, TimelineEvent } from '@shared/types'
import { formatHours, formatNumber, unixToDisplay, minutesToHours } from '@shared/format'
import { FieldRow, SourceBadge, CopyButton, useToast } from './ui'
import type { NoteItem } from '../global'

function Panel({ title, children, style }: { title?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="panel" style={style}>
      {title && <div className="section-title">{title}</div>}
      {children}
    </div>
  )
}

// ---------------- Overview ----------------
export function OverviewTab({ report }: { report: PlayerReport }) {
  const id = report.identity
  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <Panel title="Identity">
        <FieldRow label="Display name" field={id.displayName} />
        <FieldRow label="Country" field={id.countryCode} />
        <FieldRow label="Visibility" field={id.communityVisibility} />
        <FieldRow label="Steam level" field={id.steamLevel} format={(v) => formatNumber(v)} />
        <FieldRow label="Last logoff" field={id.lastLogoff} format={(v) => unixToDisplay(v)} />
      </Panel>
      <Panel title="Account age">
        <FieldRow label="Created" field={report.accountAge.createdAt} format={(v) => unixToDisplay(v)} />
        <FieldRow label="Age" field={report.accountAge.ageText} />
        <FieldRow label="Days since creation" field={report.accountAge.daysSinceCreation} format={(v) => formatNumber(v)} />
        <FieldRow label="Creation year" field={report.accountAge.approxCreationYear} />
      </Panel>

      <Panel title="Playtime vs account age" style={{ gridColumn: '1 / span 2' }}>
        {report.playtimeVsAge.computable ? (
          <>
            <div className="row wrap" style={{ gap: 26 }}>
              <Big label="Account age" value={`${report.playtimeVsAge.accountAgeDays} days`} />
              <Big label="Total playtime" value={`${formatNumber(report.playtimeVsAge.totalHours)}h`} />
              <Big label="Average" value={`${report.playtimeVsAge.hoursPerDay} h/day`} />
            </div>
            <div className={report.playtimeVsAge.unusual ? 'callout' : 'callout info'} style={{ marginTop: 12 }}>
              {report.playtimeVsAge.note}
            </div>
          </>
        ) : (
          <div className="muted">{report.playtimeVsAge.note}</div>
        )}
      </Panel>

      {report.issues.length > 0 && (
        <Panel title="Data limitations" style={{ gridColumn: '1 / span 2' }}>
          {report.issues.map((i, n) => (
            <div className="field-row" key={n}>
              <span className="k">{i.provider}</span>
              <span className="v" style={{ textAlign: 'right' }}>
                {i.message}
              </span>
            </div>
          ))}
        </Panel>
      )}
    </div>
  )
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="muted small" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  )
}

// ---------------- Games ----------------
type SortKey = 'hours' | 'name' | 'recent'
export function GamesTab({ report, recentOnly }: { report: PlayerReport; recentOnly?: boolean }) {
  const [sort, setSort] = useState<SortKey>(recentOnly ? 'recent' : 'hours')
  const priv = report.games.totalGames.value == null

  const games = recentOnly ? report.games.recentGames.value ?? [] : report.games.allGames.value ?? []
  const sorted = useMemo(() => {
    const arr = [...games]
    if (sort === 'hours') arr.sort((a, b) => b.playtimeForeverMinutes - a.playtimeForeverMinutes)
    else if (sort === 'recent') arr.sort((a, b) => b.playtime2weeksMinutes - a.playtime2weeksMinutes)
    else arr.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    return arr
  }, [games, sort])

  const top = (report.games.topGames.value ?? []).slice(0, 10).map((g) => ({
    name: (g.name ?? String(g.appId)).slice(0, 18),
    hours: minutesToHours(g.playtimeForeverMinutes, 0)
  }))

  if (priv && !recentOnly) {
    return (
      <Panel>
        <div className="empty">This player’s game library is private, so game and playtime details cannot be shown.</div>
      </Panel>
    )
  }
  if (recentOnly && games.length === 0) {
    return (
      <Panel>
        <div className="empty">No games played in the last 2 weeks (or activity is private).</div>
      </Panel>
    )
  }

  return (
    <div className="grid">
      {!recentOnly && (
        <>
          <div className="stat-cards">
            <Mini label="Total" value={formatNumber(report.games.totalGames.value)} />
            <Mini label="Played" value={formatNumber(report.games.playedGames.value)} />
            <Mini label="Never played" value={formatNumber(report.games.neverPlayed.value)} />
            <Mini label="Avg / game" value={formatHours(report.games.averagePlaytimeMinutes.value ?? 0)} />
            <Mini label="Median / game" value={formatHours(report.games.medianPlaytimeMinutes.value ?? 0)} />
          </div>
          {top.length > 0 && (
            <Panel title="Top games by hours">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={top} layout="vertical" margin={{ left: 40 }}>
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#8592a6' }} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: '#8592a6' }} />
                  <Tooltip
                    contentStyle={{ background: '#141c2b', border: '1px solid #22304a', borderRadius: 8, color: '#e8eef7' }}
                  />
                  <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                    {top.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? '#7c5cff' : '#4f9dff'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          )}
        </>
      )}

      <Panel title={recentOnly ? 'Recent activity (last 2 weeks)' : `All games (${games.length})`}>
        <table className="data">
          <thead>
            <tr>
              <th scope="col" onClick={() => setSort('name')} title="Sort by name">
                Game
              </th>
              <th scope="col" onClick={() => setSort('hours')} style={{ textAlign: 'right' }} title="Sort by total hours">
                Total hours
              </th>
              <th scope="col" onClick={() => setSort('recent')} style={{ textAlign: 'right' }} title="Sort by recent">
                Last 2 weeks
              </th>
              <th scope="col" style={{ textAlign: 'right' }}>
                Last played
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 300).map((g) => (
              <GameRow key={g.appId} g={g} />
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}

function GameRow({ g }: { g: GameStat }) {
  return (
    <tr>
      <td>
        <div className="row center" style={{ gap: 8 }}>
          {g.iconUrl && <img src={g.iconUrl} width={20} height={20} style={{ borderRadius: 4 }} alt="" />}
          {g.name ?? `App ${g.appId}`}
        </div>
      </td>
      <td style={{ textAlign: 'right' }}>{formatHours(g.playtimeForeverMinutes)}</td>
      <td style={{ textAlign: 'right' }}>{g.playtime2weeksMinutes ? formatHours(g.playtime2weeksMinutes) : '—'}</td>
      <td style={{ textAlign: 'right' }} className="muted small">
        {g.lastPlayed ? unixToDisplay(g.lastPlayed).split(',')[0] : '—'}
      </td>
    </tr>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <div className="label">{label}</div>
      <div className="value" style={{ fontSize: 20 }}>
        {value}
      </div>
    </div>
  )
}

// ---------------- Rust ----------------
export function RustTab({ report }: { report: PlayerReport }) {
  const r = report.rust
  const owned = r.owned.value
  return (
    <div className="grid">
      <Panel style={{ background: 'linear-gradient(135deg, rgba(206,66,43,0.14), transparent)' }}>
        <div className="row between center wrap">
          <div>
            <div className="section-title" style={{ color: 'var(--rust)' }}>
              Rust Player Summary
            </div>
            <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--rust)' }}>
              {r.totalHours.value != null ? `${formatNumber(r.totalHours.value)}h` : owned === false ? 'Not owned' : '—'}
            </div>
            <div className="muted">Total recorded Rust playtime</div>
          </div>
          <div className="row wrap" style={{ gap: 26 }}>
            <Big label="Recent (2w)" value={r.recentHours.value != null ? `${r.recentHours.value}h` : '—'} />
            <Big label="% of total" value={r.percentOfTotalPlaytime.value != null ? `${r.percentOfTotalPlaytime.value}%` : '—'} />
            <Big label="Servers observed" value={r.serversObserved.value != null ? String(r.serversObserved.value) : '—'} />
          </div>
        </div>
      </Panel>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Panel title="Rust details">
          <FieldRow label="Ownership" field={r.owned} format={(v) => (v ? 'Owned' : 'Not owned')} />
          <FieldRow label="Total hours" field={r.totalHours} format={(v) => `${formatNumber(v)}h`} />
          <FieldRow label="Recent hours" field={r.recentHours} format={(v) => `${v}h`} />
          <FieldRow label="% of total playtime" field={r.percentOfTotalPlaytime} format={(v) => `${v}%`} />
        </Panel>
        <Panel title="Rust observations (this application)">
          <FieldRow label="First observed" field={r.firstObserved} format={(v) => unixToDisplay(Date.parse(v) / 1000)} />
          <FieldRow label="Last observed" field={r.lastObserved} format={(v) => unixToDisplay(Date.parse(v) / 1000)} />
          <FieldRow label="Last known server" field={r.lastKnownServer} />
          <div className="muted small" style={{ marginTop: 8 }}>
            Rust server-level history requires an authorized BattleMetrics token (experimental) or observations this app
            has recorded over time. It is never fabricated.
          </div>
        </Panel>
      </div>
    </div>
  )
}

// ---------------- Servers ----------------
export function ServersTab({ report }: { report: PlayerReport }) {
  const [game, setGame] = useState('all')
  const servers = report.servers
  const games = Array.from(new Set(servers.map((s) => s.game)))
  const filtered = servers.filter((s) => game === 'all' || s.game === game)

  if (servers.length === 0) {
    return (
      <Panel>
        <div className="empty">
          No server history is available yet.
          <div className="small" style={{ marginTop: 8 }}>
            Server appearances come from an authorized BattleMetrics token (experimental — see Settings) or from
            observations this application records over time. When none are available, nothing is shown rather than
            fabricated.
          </div>
        </div>
      </Panel>
    )
  }
  return (
    <Panel title={`Server history (${filtered.length})`}>
      <div className="row" style={{ marginBottom: 10 }}>
        <select
          className="text"
          style={{ width: 200 }}
          value={game}
          onChange={(e) => setGame(e.target.value)}
          aria-label="Filter servers by game"
        >
          <option value="all">All games</option>
          {games.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>
      <table className="data">
        <thead>
          <tr>
            <th scope="col">Server</th>
            <th scope="col">Game</th>
            <th scope="col">Region</th>
            <th scope="col">First seen</th>
            <th scope="col">Last seen</th>
            <th scope="col" style={{ textAlign: 'right' }}>Obs.</th>
            <th scope="col">Source</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((s, i) => (
            <tr key={i}>
              <td>{s.serverName}</td>
              <td>{s.game}</td>
              <td>{s.region ?? '—'}</td>
              <td className="small">{s.firstSeen ? s.firstSeen.split('T')[0] : '—'}</td>
              <td className="small">{s.lastSeen ? s.lastSeen.split('T')[0] : '—'}</td>
              <td style={{ textAlign: 'right' }}>{s.observations}</td>
              <td>
                <SourceBadge source={s.source} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

// ---------------- Security ----------------
export function SecurityTab({ report }: { report: PlayerReport }) {
  const b = report.bans
  const vac = b.numberOfVacBans.value
  const gb = b.numberOfGameBans.value
  const community = b.communityBanned.value
  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <Panel title="Ban status">
        <SecRow label="VAC" state={vac == null ? 'unknown' : vac > 0 ? 'bad' : 'good'} text={vac == null ? 'Unknown' : vac > 0 ? `${vac} VAC ban(s)` : 'Clean'} />
        <SecRow label="Game bans" state={gb == null ? 'unknown' : gb > 0 ? 'bad' : 'good'} text={gb == null ? 'Unknown' : gb > 0 ? `${gb} game ban(s)` : 'Clean'} />
        <SecRow
          label="Community"
          state={community == null ? 'unknown' : community ? 'bad' : 'good'}
          text={community == null ? 'Unknown' : community ? 'Banned' : 'Clean'}
        />
        <SecRow
          label="Economy / trade"
          state={b.economyBan.value == null ? 'unknown' : b.economyBan.value === 'none' ? 'good' : 'warn'}
          text={b.economyBan.value ?? 'Unknown'}
        />
      </Panel>
      <Panel title="Details">
        <FieldRow label="VAC banned" field={b.vacBanned} format={(v) => (v ? 'Yes' : 'No')} />
        <FieldRow label="Number of VAC bans" field={b.numberOfVacBans} />
        <FieldRow label="Number of game bans" field={b.numberOfGameBans} />
        <FieldRow label="Days since last ban" field={b.daysSinceLastBan} format={(v) => (v > 0 ? String(v) : 'n/a')} />
        <div className="muted small" style={{ marginTop: 10 }}>
          These are factual public records. Bans alone do not indicate current behavior on your server and are not
          treated as proof of anything by this tool.
        </div>
      </Panel>
    </div>
  )
}

function SecRow({ label, state, text }: { label: string; state: 'good' | 'warn' | 'bad' | 'unknown'; text: string }) {
  const icon =
    state === 'good' ? <ShieldCheck size={16} /> : state === 'bad' ? <Ban size={16} /> : state === 'warn' ? <ShieldAlert size={16} /> : <HelpCircle size={16} />
  const cls = state === 'good' ? 'clean' : state === 'bad' ? 'bad' : state === 'warn' ? 'warn' : 'unknown'
  return (
    <div className="field-row">
      <span className="k row center" style={{ gap: 8 }}>
        {icon} {label}
      </span>
      <span className={`status-pill ${cls}`}>{text}</span>
    </div>
  )
}

// ---------------- Names ----------------
export function NamesTab({ report }: { report: PlayerReport }) {
  const current = report.names.filter((n) => n.kind === 'current')
  const observed = report.names.filter((n) => n.kind === 'observed')
  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <Panel title="Steam-provided current name">
        {current.length === 0 && <div className="muted">Unavailable.</div>}
        {current.map((n, i) => (
          <div className="field-row" key={i}>
            <span className="k">{n.name}</span>
            <SourceBadge source="steam" />
          </div>
        ))}
      </Panel>
      <Panel title="Historically observed names (by this app)">
        {observed.length === 0 && (
          <div className="muted small">
            No alias history yet. Steam does not publish a full name history; this app builds one from the names it
            observes across scans.
          </div>
        )}
        {observed.map((n, i) => (
          <div className="field-row" key={i}>
            <span className="k">
              {n.firstSeen.split('T')[0]} — {n.name}
            </span>
            <SourceBadge source="application" />
          </div>
        ))}
      </Panel>
    </div>
  )
}

// ---------------- Timeline ----------------
const TL_FILTERS: Array<TimelineEvent['category'] | 'all'> = ['all', 'steam', 'rust', 'game', 'server', 'name', 'security', 'application']
export function TimelineTab({ report }: { report: PlayerReport }) {
  const [f, setF] = useState<(typeof TL_FILTERS)[number]>('all')
  const items = report.timeline.filter((e) => f === 'all' || e.category === f)
  return (
    <Panel title="Chronological timeline">
      <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
        {TL_FILTERS.map((x) => (
          <button key={x} className={`tag-chip`} style={f === x ? { borderColor: 'var(--accent)', color: 'var(--text)' } : undefined} onClick={() => setF(x)}>
            {x}
          </button>
        ))}
      </div>
      {items.length === 0 && <div className="empty">No events for this filter.</div>}
      <div className="timeline-line">
        {items.map((e, i) => (
          <div className="timeline-item" key={i}>
            <div className="timeline-dot" />
            <div>
              <div className="row center" style={{ gap: 8 }}>
                <strong>{e.title}</strong>
                <SourceBadge source={e.source} />
              </div>
              <div className="muted small">
                {e.date.split('T')[0]} {e.detail ? `· ${e.detail}` : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

// ---------------- Profile score ----------------
export function ProfileTab({ report }: { report: PlayerReport }) {
  const s = report.profileScore
  const bandColor =
    s.band === 'LOW CONCERN' ? 'var(--good)' : s.band === 'ELEVATED' ? 'var(--bad)' : s.band === 'MODERATE' ? 'var(--warn)' : 'var(--text-faint)'
  return (
    <div className="grid">
      <Panel>
        <div className="section-title">Account Profile — informational only</div>
        <div className="row between center wrap">
          <div style={{ fontSize: 30, fontWeight: 800, color: bandColor }}>{s.band}</div>
          <div className="muted">Score: {s.score} (higher = more items to review manually)</div>
        </div>
        <div style={{ marginTop: 6 }}>{s.summary}</div>
      </Panel>
      <Panel title="How this was calculated">
        {s.factors.map((f, i) => (
          <div className="field-row" key={i}>
            <span className="k">{f.label}</span>
            <span className="v">
              {f.detail}
              <span className="badge" style={{ color: f.direction === 'attention' ? 'var(--warn)' : 'var(--text-faint)' }}>
                +{f.points}
              </span>
            </span>
          </div>
        ))}
      </Panel>
      <div className="callout">{s.disclaimer}</div>
    </div>
  )
}

// ---------------- Notes / tags ----------------
const SUGGESTED_TAGS = ['FRIEND', 'CLAN', 'SERVER PLAYER', 'ADMIN', 'KNOWN PLAYER']
export function NotesTab({ report }: { report: PlayerReport }) {
  const steam64 = report.identity.steam64
  const [notes, setNotes] = useState<NoteItem[]>([])
  const [draft, setDraft] = useState('')
  const [tag, setTag] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const toast = useToast()

  useEffect(() => {
    window.api.notes.list(steam64).then(setNotes)
  }, [steam64])

  const add = async () => {
    if (!draft.trim()) return
    const n = await window.api.notes.add(steam64, draft.trim())
    setNotes((x) => [n, ...x])
    setDraft('')
    toast('Note saved')
  }
  const del = async (id: number) => {
    await window.api.notes.remove(id)
    setNotes((x) => x.filter((n) => n.id !== id))
  }
  const addTag = async (t: string) => {
    if (!t.trim()) return
    setTags(await window.api.tags.add(steam64, t.trim().toUpperCase()))
    setTag('')
  }
  const removeTag = async (t: string) => setTags(await window.api.tags.remove(steam64, t))

  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <Panel title="User notes">
        <div className="callout info" style={{ marginBottom: 10 }}>
          USER NOTE — manually entered, kept separate from verified API data.
        </div>
        <textarea className="text" rows={3} placeholder="Add a note about this player…" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <div style={{ marginTop: 8 }}>
          <button className="btn primary small" onClick={add}>
            <Plus size={13} /> Add note
          </button>
        </div>
        <div style={{ marginTop: 14 }}>
          {notes.length === 0 && <div className="muted small">No notes yet.</div>}
          {notes.map((n) => (
            <div className="field-row" key={n.id}>
              <span className="k" style={{ color: 'var(--text)' }}>
                {n.body}
                <div className="muted small">{n.created_at.split('T')[0]}</div>
              </span>
              <button className="copy-btn" onClick={() => del(n.id)} aria-label="Delete note" title="Delete note">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Tags">
        <div className="row" style={{ gap: 8 }}>
          <input className="text" placeholder="Add tag…" value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag(tag)} />
          <button className="btn small" onClick={() => addTag(tag)}>
            Add
          </button>
        </div>
        <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
          {SUGGESTED_TAGS.map((t) => (
            <button key={t} className="tag-chip" onClick={() => addTag(t)}>
              + {t}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <div className="row wrap" style={{ gap: 6 }}>
          {tags.map((t) => (
            <span key={t} className="tag-chip" style={{ borderColor: 'var(--accent)' }} onClick={() => removeTag(t)}>
              {t} ✕
            </span>
          ))}
        </div>
        <div className="muted small" style={{ marginTop: 12 }}>
          Tags are your labels. This tool never auto-assigns accusatory tags.
        </div>
      </Panel>
    </div>
  )
}

// ---------------- Raw ----------------
export function RawTab({ report }: { report: PlayerReport }) {
  return (
    <Panel title="Raw source payloads (transparency)">
      <div className="muted small" style={{ marginBottom: 10 }}>
        Exactly what each source returned, before normalization. Shown so you can verify every value.
      </div>
      {Object.entries(report.raw).map(([k, v]) => (
        <details key={k} style={{ marginBottom: 8 }}>
          <summary style={{ cursor: 'pointer' }}>
            {k} <CopyButton text={JSON.stringify(v, null, 2)} />
          </summary>
          <pre
            className="mono"
            style={{ background: 'var(--bg-2)', padding: 12, borderRadius: 8, overflow: 'auto', maxHeight: 320, fontSize: 11.5 }}
          >
            {JSON.stringify(v, null, 2)}
          </pre>
        </details>
      ))}
    </Panel>
  )
}
