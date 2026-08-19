import { useState, type ReactNode } from 'react'
import { computeWindow } from '@shared/virtualWindow'

/**
 * Dependency-free windowed table. (v0.8.1)
 *
 * Renders only the rows currently visible inside a fixed-height scroll container,
 * padding the rest with two spacer <tr>s so the scrollbar and row positions stay
 * correct. This keeps very large lists (thousands of games / players) smooth
 * without pulling in a virtualization library. Assumes a uniform rowHeight.
 */
export interface VirtualTableProps<T> {
  items: T[]
  /** Uniform row height in px (must match the rendered <tr> height). */
  rowHeight?: number
  /** Max height of the scroll viewport in px. */
  maxHeight?: number
  /** The <tr> (inside <thead>) of column headers. */
  header: ReactNode
  renderRow: (item: T, index: number) => ReactNode
  /** Number of columns, so the spacer rows span the full width. */
  columnCount: number
  className?: string
}

export function VirtualTable<T>({
  items,
  rowHeight = 40,
  maxHeight = 520,
  header,
  renderRow,
  columnCount,
  className
}: VirtualTableProps<T>) {
  const [scrollTop, setScrollTop] = useState(0)
  const total = items.length

  const { start, end, padTop, padBottom } = computeWindow(scrollTop, rowHeight, maxHeight, total)

  return (
    <div
      className={className}
      style={{ maxHeight, overflow: 'auto' }}
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
    >
      <table className="data">
        <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg-2, #141c2b)' }}>{header}</thead>
        <tbody>
          {padTop > 0 && (
            <tr aria-hidden style={{ height: padTop }}>
              <td colSpan={columnCount} style={{ padding: 0, border: 0 }} />
            </tr>
          )}
          {items.slice(start, end).map((item, i) => renderRow(item, start + i))}
          {padBottom > 0 && (
            <tr aria-hidden style={{ height: padBottom }}>
              <td colSpan={columnCount} style={{ padding: 0, border: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
