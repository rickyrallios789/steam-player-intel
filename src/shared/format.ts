/** Pure formatting helpers shared by main and renderer. */

export function minutesToHours(minutes: number, digits = 1): number {
  return Number((minutes / 60).toFixed(digits))
}

export function formatHours(minutes: number | null | undefined): string {
  if (minutes == null) return '—'
  const hours = minutes / 60
  if (hours >= 1000) return `${Math.round(hours).toLocaleString()}h`
  if (hours >= 10) return `${hours.toFixed(0)}h`
  return `${hours.toFixed(1)}h`
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString()
}

/** Convert a unix-seconds timestamp to an ISO date (UTC) string, or null. */
export function unixToIsoDate(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds || unixSeconds <= 0) return null
  return new Date(unixSeconds * 1000).toISOString()
}

export function unixToDisplay(unixSeconds: number | null | undefined): string {
  if (!unixSeconds || unixSeconds <= 0) return '—'
  return new Date(unixSeconds * 1000).toLocaleString()
}

/** "2 minutes ago", "3 days ago" for cache/updated indicators. */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'unknown'
  const diffMs = now - then
  const sec = Math.round(diffMs / 1000)
  if (sec < 5) return 'just now'
  if (sec < 60) return `${sec} seconds ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`
  const mon = Math.round(day / 30)
  if (mon < 12) return `${mon} month${mon === 1 ? '' : 's'} ago`
  const yr = (day / 365).toFixed(1)
  return `${yr} years ago`
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export function personaStateLabel(state: number | null | undefined): string {
  switch (state) {
    case 0: return 'Offline'
    case 1: return 'Online'
    case 2: return 'Busy'
    case 3: return 'Away'
    case 4: return 'Snooze'
    case 5: return 'Looking to trade'
    case 6: return 'Looking to play'
    default: return 'Unknown'
  }
}

export function visibilityLabel(state: number | null | undefined): string {
  // Steam communityvisibilitystate: 1 = private, 2 = friends only (historically), 3 = public.
  switch (state) {
    case 1: return 'Private'
    case 2: return 'Friends only'
    case 3: return 'Public'
    default: return 'Unknown'
  }
}
