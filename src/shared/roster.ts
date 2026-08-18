/**
 * Parse a pasted roster into a de-duplicated list of raw Steam identifiers.
 *
 * Accepts anything the user pastes — Steam64 / Steam3 / Steam2 / profile URLs /
 * vanity names — separated by newlines, commas, semicolons or spaces. Each token
 * is passed as-is to the normal analyze pipeline, which resolves it. (bulk screen)
 */
export function parseRosterInput(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const token of text.split(/[\s,;]+/)) {
    const t = token.trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}
