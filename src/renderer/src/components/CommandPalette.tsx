import { useEffect, useMemo, useRef, useState } from 'react'

export interface Command {
  id: string
  label: string
  hint?: string
  run: () => void
}

/**
 * Lightweight command palette (Ctrl/Cmd+K): filter and run navigation/actions,
 * or paste a Steam ID / profile URL to analyze it directly.
 */
export function CommandPalette({
  open,
  onClose,
  commands,
  onAnalyze
}: {
  open: boolean
  onClose: () => void
  commands: Command[]
  onAnalyze: (raw: string) => void
}) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setIdx(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const filtered = useMemo<Command[]>(() => {
    const s = q.trim().toLowerCase()
    const base = s ? commands.filter((c) => c.label.toLowerCase().includes(s)) : commands
    const looksLikeId = /\d{17}|steamcommunity\.com|^STEAM_|^\[?U:1:/i.test(q.trim())
    if (looksLikeId) {
      return [
        { id: 'analyze', label: `Analyze "${q.trim()}"`, hint: 'Enter', run: () => onAnalyze(q.trim()) },
        ...base
      ]
    }
    return base
  }, [q, commands, onAnalyze])

  useEffect(() => setIdx(0), [q])

  if (!open) return null

  const choose = (c?: Command): void => {
    if (!c) return
    c.run()
    onClose()
  }

  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <input
          ref={inputRef}
          className="cmdk-input"
          aria-label="Command or Steam ID"
          placeholder="Type a command, or paste a Steam ID / profile URL…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIdx((i) => Math.min(i + 1, filtered.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIdx((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              choose(filtered[idx])
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
        />
        <div className="cmdk-list">
          {filtered.length === 0 && (
            <div className="muted small" style={{ padding: 12 }}>
              No matching commands.
            </div>
          )}
          {filtered.map((c, i) => (
            <button
              key={c.id}
              className={`cmdk-item ${i === idx ? 'active' : ''}`}
              onMouseEnter={() => setIdx(i)}
              onClick={() => choose(c)}
            >
              <span>{c.label}</span>
              {c.hint && <span className="muted small">{c.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
