/**
 * Report export (spec §23): JSON / TXT / CSV / PDF.
 * PDF is produced with Electron's built-in printToPDF from an offscreen window —
 * no third-party PDF dependency, and it renders a professional, self-contained page.
 */
import { BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'
import type { Field, GameStat, PlayerReport } from '../../shared/types'
import { formatHours } from '../../shared/format'

export type ExportFormat = 'json' | 'txt' | 'csv' | 'pdf'

const DISCLAIMER =
  'This report contains publicly available and/or authorized data. Missing information may result ' +
  'from privacy settings, API limitations, caching, or unavailable historical records.'

function fv<T>(f: Field<T>): string {
  if (f.value == null) return `PRIVATE / UNAVAILABLE (${f.status})`
  return String(f.value)
}

function buildTxt(r: PlayerReport): string {
  const lines: string[] = []
  lines.push('STEAM PLAYER INTEL — REPORT')
  lines.push('='.repeat(48))
  lines.push(`Generated: ${r.generatedAt}`)
  lines.push(`Input: ${r.input.raw}  (${r.input.detectedLabel})`)
  lines.push('')
  lines.push('IDENTITY')
  lines.push(`  Name:        ${fv(r.identity.displayName)}`)
  lines.push(`  Steam64:     ${r.identity.steam64}`)
  lines.push(`  Steam3:      ${r.identity.steam3}`)
  lines.push(`  Steam2:      ${r.identity.steam2}`)
  lines.push(`  Profile:     ${r.identity.profileUrl}`)
  lines.push(`  Visibility:  ${fv(r.identity.communityVisibility)}`)
  lines.push(`  Steam level: ${fv(r.identity.steamLevel)}`)
  lines.push('')
  lines.push('ACCOUNT AGE')
  lines.push(`  Created:     ${fv(r.accountAge.createdAt)} [${r.accountAge.createdAt.status}]`)
  lines.push(`  Age:         ${fv(r.accountAge.ageText)}`)
  lines.push('')
  lines.push('GAMES')
  lines.push(`  Total:       ${fv(r.games.totalGames)}`)
  lines.push(`  Played:      ${fv(r.games.playedGames)}`)
  lines.push(`  Total hours: ${r.games.totalPlaytimeMinutes.value != null ? formatHours(r.games.totalPlaytimeMinutes.value) : 'PRIVATE / UNAVAILABLE'}`)
  lines.push('')
  lines.push('RUST')
  lines.push(`  Owned:       ${fv(r.rust.owned)}`)
  lines.push(`  Total hours: ${fv(r.rust.totalHours)}`)
  lines.push(`  Recent (2w): ${fv(r.rust.recentHours)}`)
  lines.push('')
  lines.push('SECURITY')
  lines.push(`  VAC bans:    ${fv(r.bans.numberOfVacBans)}`)
  lines.push(`  Game bans:   ${fv(r.bans.numberOfGameBans)}`)
  lines.push(`  Community:   ${fv(r.bans.communityBanned)}`)
  lines.push('')
  lines.push('ACCOUNT PROFILE (informational only)')
  lines.push(`  Band:        ${r.profileScore.band} (${r.profileScore.score})`)
  lines.push(`  ${r.profileScore.summary}`)
  lines.push('')
  lines.push('APPLICATION HISTORY')
  lines.push(`  First seen:  ${r.application.firstObserved ?? 'not yet observed'}`)
  lines.push(`  Last seen:   ${r.application.lastObserved ?? 'not yet observed'}`)
  lines.push(`  Scans:       ${r.application.scanCount}`)
  lines.push('')
  if (r.issues.length) {
    lines.push('NOTES / LIMITATIONS')
    for (const i of r.issues) lines.push(`  - [${i.provider}] ${i.message}`)
    lines.push('')
  }
  lines.push(DISCLAIMER)
  return lines.join('\n')
}

function buildCsv(games: GameStat[]): string {
  const header = 'appId,name,playtime_hours,playtime_2weeks_hours'
  const rows = games
    .slice()
    .sort((a, b) => b.playtimeForeverMinutes - a.playtimeForeverMinutes)
    .map((g) =>
      [
        g.appId,
        JSON.stringify(g.name ?? ''),
        (g.playtimeForeverMinutes / 60).toFixed(1),
        (g.playtime2weeksMinutes / 60).toFixed(1)
      ].join(',')
    )
  return [header, ...rows].join('\n')
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
}

function buildHtml(r: PlayerReport): string {
  const row = (k: string, v: string) => `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>`
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:32px;font-size:13px}
    h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;margin:22px 0 6px;border-bottom:2px solid #222;padding-bottom:3px}
    .sub{color:#666;margin-bottom:16px} table{border-collapse:collapse;width:100%} td{padding:3px 8px;border-bottom:1px solid #eee;vertical-align:top}
    td.k{color:#555;width:180px} .band{display:inline-block;padding:2px 8px;border-radius:4px;background:#eef;font-weight:600}
    .disc{margin-top:24px;color:#666;font-size:11px;border-top:1px solid #ccc;padding-top:8px}
  </style></head><body>
  <h1>Steam Player Intel — Report</h1>
  <div class="sub">${esc(fv(r.identity.displayName))} · ${r.identity.steam64} · generated ${esc(r.generatedAt)}</div>
  <h2>Identity</h2><table>
    ${row('Steam64', r.identity.steam64)}${row('Steam3', r.identity.steam3)}${row('Steam2', r.identity.steam2)}
    ${row('Profile URL', r.identity.profileUrl)}${row('Visibility', fv(r.identity.communityVisibility))}${row('Steam level', fv(r.identity.steamLevel))}
  </table>
  <h2>Account age</h2><table>
    ${row('Created', `${fv(r.accountAge.createdAt)} [${r.accountAge.createdAt.status}]`)}${row('Age', fv(r.accountAge.ageText))}
  </table>
  <h2>Games</h2><table>
    ${row('Total games', fv(r.games.totalGames))}${row('Played', fv(r.games.playedGames))}
    ${row('Total hours', r.games.totalPlaytimeMinutes.value != null ? formatHours(r.games.totalPlaytimeMinutes.value) : 'PRIVATE / UNAVAILABLE')}
  </table>
  <h2>Rust</h2><table>
    ${row('Owned', fv(r.rust.owned))}${row('Total hours', fv(r.rust.totalHours))}${row('Recent (2w)', fv(r.rust.recentHours))}
  </table>
  <h2>Security</h2><table>
    ${row('VAC bans', fv(r.bans.numberOfVacBans))}${row('Game bans', fv(r.bans.numberOfGameBans))}${row('Community banned', fv(r.bans.communityBanned))}
  </table>
  <h2>Account profile (informational only)</h2>
  <p><span class="band">${esc(r.profileScore.band)} (${r.profileScore.score})</span> — ${esc(r.profileScore.summary)}</p>
  <h2>Application history</h2><table>
    ${row('First seen by app', r.application.firstObserved ?? 'not yet observed')}
    ${row('Last seen by app', r.application.lastObserved ?? 'not yet observed')}
    ${row('Scans', String(r.application.scanCount))}
  </table>
  <div class="disc">${esc(DISCLAIMER)}</div>
  </body></html>`
}

async function toPdf(html: string): Promise<Buffer> {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    return await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
  } finally {
    win.destroy()
  }
}

export async function exportReport(report: PlayerReport, format: ExportFormat, filePath: string): Promise<void> {
  switch (format) {
    case 'json':
      await writeFile(filePath, JSON.stringify(report, null, 2), 'utf8')
      break
    case 'txt':
      await writeFile(filePath, buildTxt(report), 'utf8')
      break
    case 'csv':
      await writeFile(filePath, buildCsv(report.games.allGames.value ?? []), 'utf8')
      break
    case 'pdf': {
      const pdf = await toPdf(buildHtml(report))
      await writeFile(filePath, pdf)
      break
    }
  }
}
