import { useCallback, useEffect, useMemo, useState } from 'react'
import { Play, Pencil, Trash2, Plus, Save, X, ClipboardList } from 'lucide-react'
import { parseRosterInput } from '@shared/roster'
import type { RosterRow } from '../global'
import { useToast } from '../components/ui'

const MAX_NAME = 100
const MAX_MEMBERS = 20000

interface Draft {
  id: number | null // null = creating a new roster
  name: string
  members: string
}

const EMPTY_DRAFT: Draft = { id: null, name: '', members: '' }

/**
 * Saved rosters — named lists of players the user screens together. Nothing here
 * fabricates data: rosters just store the raw identifiers the user pastes, and
 * "Screen now" hands them to the same sourced Bulk-screen pipeline.
 */
export default function Rosters({ onScreen }: { onScreen: (members: string) => void }) {
  const [rosters, setRosters] = useState<RosterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const toast = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRosters(await window.api.rosters.list())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const memberCount = (members: string): number => parseRosterInput(members).length

  const startCreate = (): void => setDraft({ ...EMPTY_DRAFT })
  const startEdit = (r: RosterRow): void => setDraft({ id: r.id, name: r.name, members: r.members })
  const cancel = (): void => setDraft(null)

  const save = async (): Promise<void> => {
    if (!draft) return
    const name = draft.name.trim().slice(0, MAX_NAME) || 'Untitled roster'
    const members = draft.members.slice(0, MAX_MEMBERS)
    if (draft.id == null) {
      await window.api.rosters.create(name, members)
      toast('Roster saved')
    } else {
      await window.api.rosters.update(draft.id, { name, members })
      toast('Roster updated')
    }
    setDraft(null)
    await load()
  }

  const remove = async (r: RosterRow): Promise<void> => {
    await window.api.rosters.remove(r.id)
    toast('Roster deleted')
    await load()
  }

  const draftCount = useMemo(() => (draft ? memberCount(draft.members) : 0), [draft])

  return (
    <div>
      <div className="row center between" style={{ marginTop: 0 }}>
        <h2 style={{ margin: 0 }}>Saved rosters</h2>
        {!draft && (
          <button className="btn primary" onClick={startCreate}>
            <Plus size={14} /> New roster
          </button>
        )}
      </div>
      <div className="muted small" style={{ margin: '6px 0 14px' }}>
        Save a group of players once, then re-screen them any time with a single click. Members are the raw identifiers
        you paste — Steam IDs, profile URLs, or vanity names.
      </div>

      {draft && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="row center" style={{ gap: 8, marginBottom: 10 }}>
            <ClipboardList size={16} />
            <strong>{draft.id == null ? 'New roster' : 'Edit roster'}</strong>
          </div>
          <label className="muted small" htmlFor="roster-name">
            Name
          </label>
          <input
            id="roster-name"
            className="text"
            style={{ marginTop: 4, marginBottom: 12 }}
            maxLength={MAX_NAME}
            placeholder="e.g. Main server regulars"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <label className="muted small" htmlFor="roster-members">
            Members ({draftCount} detected)
          </label>
          <textarea
            id="roster-members"
            className="text"
            rows={6}
            spellCheck={false}
            style={{ marginTop: 4 }}
            placeholder={'76561198000000000\nhttps://steamcommunity.com/id/example\nsome_vanity_name'}
            value={draft.members}
            onChange={(e) => setDraft({ ...draft, members: e.target.value })}
          />
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn primary" onClick={save} disabled={!draft.name.trim() && !draft.members.trim()}>
              <Save size={14} /> Save roster
            </button>
            <button className="btn" onClick={cancel}>
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="muted small">Loading…</div>
      ) : rosters.length === 0 && !draft ? (
        <div className="panel muted small">No saved rosters yet. Create one to screen the same group repeatedly.</div>
      ) : (
        <div className="panel" style={{ overflowX: 'auto', padding: 0 }}>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Roster</th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Members
                </th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rosters.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                  </td>
                  <td style={{ textAlign: 'right' }}>{memberCount(r.members)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      className="btn small primary"
                      onClick={() => onScreen(r.members)}
                      disabled={memberCount(r.members) === 0}
                      title="Screen this roster now"
                    >
                      <Play size={13} /> Screen now
                    </button>{' '}
                    <button className="btn small" onClick={() => startEdit(r)} title="Edit roster">
                      <Pencil size={13} />
                    </button>{' '}
                    <button className="btn small ghost" onClick={() => remove(r)} title="Delete roster">
                      <Trash2 size={13} />
                    </button>
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
