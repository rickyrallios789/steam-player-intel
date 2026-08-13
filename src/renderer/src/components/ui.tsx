import React, { createContext, useCallback, useContext, useState } from 'react'
import { Copy, Check, ExternalLink } from 'lucide-react'
import type { DataSource, Field, FieldStatus } from '@shared/types'

// ---- Source badge (spec §18) ----
const SOURCE_LABEL: Record<DataSource, string> = {
  steam: 'STEAM',
  battlemetrics: 'BATTLEMETRICS',
  application: 'APP HISTORY',
  derived: 'DERIVED',
  other: 'OTHER'
}
export function SourceBadge({ source }: { source: DataSource }) {
  return <span className={`badge ${source}`}>{SOURCE_LABEL[source]}</span>
}

export function statusText(status: FieldStatus): string {
  switch (status) {
    case 'private':
      return 'PRIVATE'
    case 'unavailable':
      return 'UNAVAILABLE'
    case 'unknown':
      return 'UNKNOWN'
    case 'estimated':
      return 'ESTIMATED'
    case 'inferred':
      return 'INFERRED'
    default:
      return ''
  }
}

// ---- Field value rendering ----
export function FieldValue<T>({
  field,
  mono,
  format
}: {
  field: Field<T>
  mono?: boolean
  format?: (v: T) => React.ReactNode
}) {
  if (field.value == null) {
    return (
      <span className="v private" title={field.note}>
        PRIVATE / UNAVAILABLE
        <SourceBadge source={field.source} />
      </span>
    )
  }
  const rendered = format ? format(field.value) : String(field.value)
  return (
    <span className="v">
      <span className={mono ? 'mono' : undefined} title={field.note}>
        {rendered}
      </span>
      {(field.status === 'estimated' || field.status === 'inferred') && (
        <span className="badge" title="How this value was derived">
          {statusText(field.status)}
        </span>
      )}
      <SourceBadge source={field.source} />
    </span>
  )
}

export function FieldRow<T>({
  label,
  field,
  mono,
  format
}: {
  label: string
  field: Field<T>
  mono?: boolean
  format?: (v: T) => React.ReactNode
}) {
  return (
    <div className="field-row">
      <span className="k">{label}</span>
      <FieldValue field={field} mono={mono} format={format} />
    </div>
  )
}

// ---- Copy button ----
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  const toast = useToast()
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      toast(`Copied: ${text.length > 30 ? text.slice(0, 30) + '…' : text}`)
      setTimeout(() => setDone(false), 1200)
    } catch {
      toast('Copy failed')
    }
  }
  return (
    <button className="copy-btn" onClick={onCopy} title={label}>
      {done ? <Check size={12} /> : <Copy size={12} />}
    </button>
  )
}

export function OpenLink({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <button
      className="btn small ghost"
      onClick={() => window.api.openExternal(url)}
      title={url}
    >
      {children} <ExternalLink size={12} />
    </button>
  )
}

export function Skeleton({ w = '100%', h = 16, style }: { w?: string | number; h?: number; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ width: w, height: h, ...style }} />
}

// ---- Toast context ----
const ToastCtx = createContext<(msg: string) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const show = useCallback((m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(null), 2200)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast">{msg}</div>}
    </ToastCtx.Provider>
  )
}
