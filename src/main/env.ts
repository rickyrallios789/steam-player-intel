/**
 * Minimal .env loader for the MAIN process (no dependency).
 *
 * Reads the first .env found among the candidate paths and populates
 * process.env for any key not already set. This lets the app auto-load a Steam
 * Web API key WITHOUT hard-coding it in source: the key lives only in a local,
 * gitignored .env file and is read exclusively in the main process — it never
 * reaches the renderer/frontend bundle. (spec §28)
 *
 * Values already present in the real environment take precedence over the file.
 */
import { existsSync, readFileSync } from 'node:fs'

export function loadEnvFile(candidatePaths: string[]): string | null {
  for (const p of candidatePaths) {
    try {
      if (!existsSync(p)) continue
      const content = readFileSync(p, 'utf8')
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) continue
        const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
        if (!m) continue
        const key = m[1]
        let value = m[2].trim()
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1)
        }
        if (process.env[key] === undefined) process.env[key] = value
      }
      return p
    } catch {
      // ignore unreadable files and keep trying
    }
  }
  return null
}
