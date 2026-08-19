/**
 * Pure windowing math for the dependency-free VirtualTable. (v0.8.1)
 *
 * Given the current scroll offset and a uniform row height, compute which slice
 * of rows to render plus the top/bottom spacer heights that preserve scrollbar
 * geometry. Kept pure so it can be unit-tested without a DOM.
 */
export interface VirtualWindow {
  start: number
  end: number
  padTop: number
  padBottom: number
}

export function computeWindow(
  scrollTop: number,
  rowHeight: number,
  viewportHeight: number,
  total: number,
  overscan = 8
): VirtualWindow {
  const safeRow = Math.max(1, rowHeight)
  const start = Math.max(0, Math.floor(Math.max(0, scrollTop) / safeRow) - overscan)
  const visibleCount = Math.ceil(viewportHeight / safeRow) + overscan * 2
  const end = Math.min(total, start + visibleCount)
  return {
    start,
    end,
    padTop: start * safeRow,
    padBottom: Math.max(0, (total - end) * safeRow)
  }
}
