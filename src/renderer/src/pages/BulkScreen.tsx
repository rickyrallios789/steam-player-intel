import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Square, Copy, Loader2, AlertCircle, ExternalLink } from 'lucide-react'
import { parseRosterInput } from '@shared/roster'
import { csvField } from '@shared/csv'
import { formatNumber } from '@shared/format'
import type { PlayerReport } from '@shared/types'
import { useToast } from '../components/ui'

const MAX_ROSTER = 100

type RowStatus = 'pending' | 'scanning' | 'done' | 'error'

interface Row {
  raw: string
  status: RowStatus
  steam64?: string
  name?: string | null
  ageDays?: number | null
  vac?: number | null
  gameBans?: number | null
  community?: boolean | null
  visibility?: string | null
  rustHours?: number | null
  changes?: number
  error?: string
}

function summarize(r: PlayerReport): Partial<Row> {
  return {
    steam64: r.identity.steam64,
    name: r.identity.displayName.value,
    ageDays: r.accountAge.daysSinceCreation.value,
    vac: r.bans.numberOfVacBans.value,
    gameBans: r.bans.numberOfGameBans.value,
    community: r.bans.communityBanned.value,
    visibility: r.identity.communityVisibility.value,
    rustHours: r.rust.totalHours.value,
    changes: r.changes.entries.length
  }
}

type SortKey = 'name' | 'ageDays' | 'vac' | 'gameBans' | 'rustHours' | 'changes'

export default function BulkScreen({
  onAnalyze,
  initialText,
  onConsumeInitial
}: {
  onAnalyze: (steam64: string) => void
  initialText?: string | null
  onConsumeInitial?: () => void
}) {
  const [text, setText] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null)
  const cancelRef = useRef(false)
  const toast = useToast()

  const ids = useMemo(() => parseRosterInput(text), [text])
  const overCap = ids.length > MAX_ROSTER

  const run = async (sourceText?: string): Promise<void> => {
    const list = parseRosterInput(sourceText ?? text).slice(0, MAX_ROSTER)
    if (!list.length) return
    cancelRef.current = false
    setRunning(true)
    setProgress({ done: 0, total: list.length })
    setRows(list.map((raw) => ({ raw, status: 'pending' })))

    for (let i = 0; i < list.length; i++) {
      if (cancelRef.current) break
      setRows((r) => r.map((row, idx) => (idx === i ? { ...row, status: 'scanning' } : row)))
      try {
        const res = await window.api.analyze(list[i], { persist: true })
        setRows((r) =>
          r.map((row, idx) => {
            if (idx !== i) return row
            if (!res.ok || !res.report) return { ...row, status: 'error', error: res.error ?? 'Analysis failed' }
            return { ...row, status: 'done', ...summarize(res.report) }
          })
        )
      } catch (e) {
        setRows((r) =>
          r.map((row, idx) =>
            idx === i ? { ...row, status: 'error', error: e instanceof Error ? e.message : 'Failed' } : row
          )
        )
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }))
    }
    setRunning(false)
  }

  const stop = (): void => {
    cancelRef.current = true
  }

  // When arriving from "Screen now" on a saved roster, preload the members and run once.
  useEffect(() => {
    if (initialText == null) return
    setText(initialText)
    void run(initialText)
    onConsumeInitial?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText])

  const copyCsv = (): void => {
    const header = ['steam64', 'name', 'age_days', 'vac_bans', 'game_bans', 'community_banned', 'visibility', 'rust_hours', 'changes']
    const lines = [header.join(',')]
    for (const r of rows) {
      if (r.status !== 'done') continue
      lines.push(
        [
          r.steam64 ?? '',
          csvField(r.name ?? ''),
          r.ageDays ?? '',
          r.vac ?? '',
          r.gameBans ?? '',
          r.community == null ? '' : r.community ? 'yes' : 'no',
          csvField(r.visibility ?? ''),
          r.rustHours ?? '',
          r.changes ?? ''
        ].join(',')
      )
    }
    navigator.clipboard.writeText(lines.join('\n')).then(
      () => toast('Results copied as CSV'),
      () => toast('Copy failed')
    )
  }

  const displayed = useMemo(() => {
    if (!sort) return rows
    const dir = sort.dir
    return [...rows].sort((a, b) => {
      const av = a[sort.key]
      const bv = b[sort.key]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
  }, [rows, sort])

  const toggleSort = (key: SortKey): void =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }))

  const doneCount = rows.filter((r) => r.status === 'done').length
  const flagged = rows.filter((r) => r.status === 'done' && ((r.vac ?? 0) > 0 || (r.gameBans ?? 0) > 0)).length

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Bulk screen</h2>
      <div className="panel">
        <div className="muted small" style={{ marginBottom: 8 }}>
          Paste a roster of players — Steam IDs (any format), profile URLs, or vanity names, separated by new lines,
          spaces or commas. Each is looked up with the same sourced, non-fabricated data as a single scan. Up to{' '}
          {MAX_ROSTER} at a time.
        </div>
        <textarea
          className="text"
          rows={5}
          spellCheck={false}
          aria-label="Roster of Steam IDs to screen"
          placeholder={'76561198000000000\nhttps://steamcommunity.com/id/example\nsome_vanity_name'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="row center between wrap" style={{ marginTop: 10, gap: 10 }}>
          <span className="muted small">
            {ids.length} unique {ids.length === 1 ? 'entry' : 'entries'} detected
            {overCap && <span style={{ color: 'var(--warn)' }}> · only the first {MAX_ROSTER} will be scanned</span>}
          </span>
          <div className="row" style={{ gap: 8 }}>
            {rows.some((r) => r.status === 'done') && (
              <button className="btn" onClick={copyCsv} disabled={running}>
                <Copy size={14} /> Copy CSV
              </button>
            )}
            {running ? (
              <button className="btn" onClick={stop}>
                <Square size={14} /> Stop
              </button>
            ) : (
              <button className="btn primary" onClick={() => run()} disabled={!ids.length}>
                <Play size={14} /> Scan {Math.min(ids.length, MAX_ROSTER) || ''} {ids.length === 1 ? 'player' : 'players'}
              </button>
            )}
          </div>
        </div>
        {running && (
          <div className="muted small" style={{ marginTop: 8 }}>
            <Loader2 size={12} className="spin" /> Scanning {progress.done}/{progress.total}… (rate-limited to stay
            within Steam's API limits)
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <>
          <div className="spacer" />
          <div className="row wrap" style={{ gap: 16, marginBottom: 10 }}>
            <span className="muted small">
              Scanned {doneCount}/{rows.length}
            </span>
            {flagged > 0 && (
              <span className="small" style={{ color: 'var(--bad)' }}>
                {flagged} with VAC/game bans
              </span>
            )}
          </div>
          <div className="panel" style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col" onClick={() => toggleSort('name')} title="Sort by name">
                    Player
                  </th>
                  <th scope="col">Steam64</th>
                  <th scope="col" onClick={() => toggleSort('ageDays')} style={{ textAlign: 'right' }} title="Sort by age">
                    Age (days)
                  </th>
                  <th scope="col" onClick={() => toggleSort('vac')} style={{ textAlign: 'right' }} title="Sort by VAC">
                    VAC
                  </th>
                  <th
                    scope="col"
                    onClick={() => toggleSort('gameBans')}
                    style={{ textAlign: 'right' }}
                    title="Sort by game bans"
                  >
                    Game bans
                  </th>
                  <th scope="col">Community</th>
                  <th scope="col">Visibility</th>
                  <th
                    scope="col"
                    onClick={() => toggleSort('rustHours')}
                    style={{ textAlign: 'right' }}
                    title="Sort by Rust hours"
                  >
                    Rust h
                  </th>
                  <th scope="col" onClick={() => toggleSort('changes')} style={{ textAlign: 'right' }} title="Sort by changes">
                    Changes
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((r) => (
                  <tr key={r.raw}>
                    <td>
                      {r.steam64 ? (
                        <a onClick={() => onAnalyze(r.steam64!)} style={{ cursor: 'pointer' }} title="Open full report">
                          {r.name ?? '—'}
                        </a>
                      ) : (
                        <span className="muted" title={r.raw}>
                          {r.raw.length > 24 ? r.raw.slice(0, 24) + '…' : r.raw}
                        </span>
                      )}
                    </td>
                    <td className="mono small">{r.steam64 ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>{r.ageDays != null ? formatNumber(r.ageDays) : '—'}</td>
                    <td style={{ textAlign: 'right', color: (r.vac ?? 0) > 0 ? 'var(--bad)' : undefined }}>
                      {r.vac ?? '—'}
                    </td>
                    <td style={{ textAlign: 'right', color: (r.gameBans ?? 0) > 0 ? 'var(--bad)' : undefined }}>
                      {r.gameBans ?? '—'}
                    </td>
                    <td style={{ color: r.community ? 'var(--bad)' : undefined }}>
                      {r.community == null ? '—' : r.community ? 'Banned' : 'Clean'}
                    </td>
                    <td className="small">{r.visibility ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>{r.rustHours != null ? formatNumber(r.rustHours) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{r.status === 'done' ? (r.changes ?? 0) : '—'}</td>
                    <td>
                      <StatusCell row={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function StatusCell({ row }: { row: Row }) {
  if (row.status === 'scanning')
    return (
      <span className="muted small row center" style={{ gap: 4 }}>
        <Loader2 size={12} className="spin" /> scanning
      </span>
    )
  if (row.status === 'pending') return <span className="muted small">queued</span>
  if (row.status === 'error')
    return (
      <span className="small row center" style={{ gap: 4, color: 'var(--bad)' }} title={row.error}>
        <AlertCircle size={12} /> failed
      </span>
    )
  return (
    <span className="small row center" style={{ gap: 4 }}>
      <ExternalLink size={11} /> done
    </span>
  )
}
