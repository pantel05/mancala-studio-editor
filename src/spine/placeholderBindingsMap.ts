/**
 * Normalized placeholder bindings: each bone name maps to zero or more symbol row ids.
 * Project files may store a single string per bone for backward compatibility.
 */
export type PlaceholderBindingsMap = Record<string, string[]>

/** Merge legacy `string` values into a map of id arrays (deduped, order preserved). */
export function normalizePlaceholderBindings(
  raw: Record<string, string | string[] | undefined> | undefined,
): PlaceholderBindingsMap {
  if (!raw) return {}
  const out: PlaceholderBindingsMap = {}
  for (const [bone, val] of Object.entries(raw)) {
    if (val == null) continue
    const ids = (Array.isArray(val) ? val : [val]).filter(Boolean)
    const seen = new Set<string>()
    const uniq: string[] = []
    for (const id of ids) {
      if (seen.has(id)) continue
      seen.add(id)
      uniq.push(id)
    }
    if (uniq.length > 0) out[bone] = uniq
  }
  return out
}

/** Compact for JSON: one id stays a string; several stay an array. */
export function bindingsMapToRecord(map: PlaceholderBindingsMap): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  for (const [bone, ids] of Object.entries(map)) {
    if (ids.length === 1) out[bone] = ids[0]!
    else out[bone] = [...ids]
  }
  return out
}
