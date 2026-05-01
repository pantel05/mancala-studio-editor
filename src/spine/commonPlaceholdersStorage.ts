const STORAGE_KEY = 'mancala-gaming-common-placeholder-bone-names'

function normalizeList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const x of raw) {
    if (typeof x !== 'string') continue
    const t = x.trim()
    if (t.length === 0) continue
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

/** Allowed placeholder bone names (exact match to Spine). Persisted in localStorage. */
export function readCommonPlaceholderNames(): string[] {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    if (!s) return []
    return normalizeList(JSON.parse(s) as unknown)
  } catch {
    return []
  }
}

export function writeCommonPlaceholderNames(names: string[]): void {
  const next = normalizeList(names)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota / private mode */
  }
}
