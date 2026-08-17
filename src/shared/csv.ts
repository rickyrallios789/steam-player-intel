/**
 * CSV helpers with spreadsheet formula-injection protection. (audit F-19)
 *
 * A cell whose text begins with =, +, -, @ (or a tab / carriage return) can be
 * executed as a formula when the CSV is opened in Excel/Sheets. We prefix such
 * values with a single quote to neutralize them, and always quote + escape text
 * so delimiters and newlines can't break the row.
 */
import type { GameStat } from './types'

export function csvField(value: string | number): string {
  let s = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

/** Build the games CSV. Numeric columns stay numeric; the free-text name is neutralized. */
export function gamesToCsv(games: GameStat[]): string {
  const header = 'appId,name,playtime_hours,playtime_2weeks_hours'
  const rows = games
    .slice()
    .sort((a, b) => b.playtimeForeverMinutes - a.playtimeForeverMinutes)
    .map((g) =>
      [
        g.appId,
        csvField(g.name ?? ''),
        (g.playtimeForeverMinutes / 60).toFixed(1),
        (g.playtime2weeksMinutes / 60).toFixed(1)
      ].join(',')
    )
  return [header, ...rows].join('\n')
}
