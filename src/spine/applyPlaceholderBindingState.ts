export type PlaceholderBindingAwareRow = {
  id: string
  placeholderBindings: Record<string, string>
  pinnedUnder: null | { hostRowId: string; boneName: string }
}

/**
 * Updates placeholder bindings / `pinnedUnder` when the user attaches or clears a symbol on a host bone.
 */
export function applyPlaceholderBinding<T extends PlaceholderBindingAwareRow>(
  prev: T[],
  hostRowId: string,
  boneName: string,
  childRowId: string | null,
): T[] {
  const hostExists = prev.some((r) => r.id === hostRowId)
  if (!hostExists) return prev as T[]

  let rows = prev.map((r) => ({
    ...r,
    placeholderBindings: { ...r.placeholderBindings },
    pinnedUnder: r.pinnedUnder ? { ...r.pinnedUnder } : null,
  }))

  const host = rows.find((r) => r.id === hostRowId)!
  const prevChildId = host.placeholderBindings[boneName] ?? null

  if (prevChildId && prevChildId !== childRowId) {
    rows = rows.map((r) => (r.id === prevChildId ? { ...r, pinnedUnder: null } : r))
  }

  if (childRowId) {
    const child = rows.find((r) => r.id === childRowId)
    if (child?.pinnedUnder) {
      if (child.pinnedUnder.hostRowId !== hostRowId) {
        const { hostRowId: oldHost, boneName: oldBone } = child.pinnedUnder
        rows = rows.map((r) => {
          if (r.id !== oldHost) return r
          const nb = { ...r.placeholderBindings }
          delete nb[oldBone]
          return { ...r, placeholderBindings: nb }
        })
        rows = rows.map((r) => (r.id === childRowId ? { ...r, pinnedUnder: null } : r))
      } else if (child.pinnedUnder.boneName !== boneName) {
        const oldBone = child.pinnedUnder.boneName
        rows = rows.map((r) => {
          if (r.id !== hostRowId) return r
          const nb = { ...r.placeholderBindings }
          delete nb[oldBone]
          return { ...r, placeholderBindings: nb }
        })
      }
    }
  }

  rows = rows.map((r) => {
    if (r.id !== hostRowId) return r
    const nb = { ...r.placeholderBindings }
    if (childRowId) nb[boneName] = childRowId
    else delete nb[boneName]
    return { ...r, placeholderBindings: nb }
  })

  if (childRowId) {
    rows = rows.map((r) =>
      r.id === childRowId ? { ...r, pinnedUnder: { hostRowId, boneName } } : r,
    )
  }

  return rows as T[]
}
