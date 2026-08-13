import { useEffect, useState } from 'react'
import { Star, Trash2, Search } from 'lucide-react'
import { relativeTime } from '@shared/format'
import { useToast } from '../components/ui'
import type { HistoryItem } from '../global'

export default function HistoryPage({
  onAnalyze,
  favoritesOnly
}: {
  onAnalyze: (steam64: string) => void
  favoritesOnly: boolean
}) {
  const [items, setItems] = useState<HistoryItem[]>([])
  const [q, setQ] = useState('')
  const toast = useToast()

  const load = () => window.api.history.list().then(setItems)
  useEffect(() => {
    load()
  }, [])

  const shown = items
    .filter((i) => (favoritesOnly ? i.favorite : true))
    .filter(
      (i) =>
        !q.trim() ||
        i.steam64.includes(q) ||
        (i.display_name ?? '').toLowerCase().includes(q.toLowerCase()) ||
        i.tags.some((t) => t.toLowerCase().includes(q.toLowerCase()))
    )

  const toggleFav = async (i: HistoryItem) => {
    await window.api.history.setFavorite(i.steam64, !i.favorite)
    load()
  }
  const remove = async (i: HistoryItem) => {
    await window.api.history.remove(i.steam64)
    toast('Removed from history')
    load()
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>{favoritesOnly ? 'Favorites' : 'Recent Players'}</h2>
      <input className="text" placeholder="Filter by name, Steam64, or tag…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 380, marginBottom: 14 }} />
      {shown.length === 0 ? (
        <div className="panel">
          <div className="empty">{favoritesOnly ? 'No favorites yet.' : 'No players scanned yet. Search a Steam ID to begin.'}</div>
        </div>
      ) : (
        <div className="panel" style={{ padding: 0 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Player</th>
                <th>Steam64</th>
                <th>Last scanned</th>
                <th style={{ textAlign: 'right' }}>Scans</th>
                <th>Tags</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.steam64}>
                  <td>{i.display_name ?? '—'}</td>
                  <td className="mono small">{i.steam64}</td>
                  <td className="small muted">{relativeTime(i.last_observed)}</td>
                  <td style={{ textAlign: 'right' }}>{i.scan_count}</td>
                  <td>
                    <div className="row wrap" style={{ gap: 4 }}>
                      {i.tags.map((t) => (
                        <span key={t} className="tag-chip">
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      <button className="copy-btn" onClick={() => toggleFav(i)} title="Favorite">
                        <Star size={13} fill={i.favorite ? 'currentColor' : 'none'} style={{ color: i.favorite ? 'var(--warn)' : undefined }} />
                      </button>
                      <button className="copy-btn" onClick={() => onAnalyze(i.steam64)} title="Analyze">
                        <Search size={13} />
                      </button>
                      <button className="copy-btn" onClick={() => remove(i)} title="Delete">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
