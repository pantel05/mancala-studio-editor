import { placeholderBonesShareLayoutGroup } from './placeholderLayoutResolution'

/** Strip per-layout bone offsets when a row is no longer nested. */
export function clearPinnedBoneOffsetFields<T extends Record<string, unknown>>(r: T): T {
  return {
    ...r,
    pinnedBoneOffsetMain: undefined,
    pinnedBoneLayoutPt: undefined,
    pinnedBoneLayoutLs: undefined,
    pinnedBoneLayoutTb: undefined,
  } as T
}

export type PlaceholderBindingAwareRow = {
  id: string
  placeholderBindings: Record<string, string>
  pinnedUnder: null | { hostRowId: string; boneName: string }
}

function otherHostBindingsForChild(
  bindings: Record<string, string>,
  boneName: string,
  childId: string,
): string[] {
  return Object.entries(bindings)
    .filter(([b, id]) => id === childId && b !== boneName)
    .map(([b]) => b)
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

  if (childRowId && prevChildId && prevChildId !== childRowId) {
    const stillOnHost = otherHostBindingsForChild(host.placeholderBindings, boneName, prevChildId)
    if (stillOnHost.length === 0) {
      rows = rows.map((r) => (r.id === prevChildId ? clearPinnedBoneOffsetFields({ ...r, pinnedUnder: null }) : r))
    }
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
        rows = rows.map((r) =>
          r.id === childRowId ? clearPinnedBoneOffsetFields({ ...r, pinnedUnder: null }) : r,
        )
      } else if (child.pinnedUnder.boneName !== boneName) {
        const oldBone = child.pinnedUnder.boneName
        if (!placeholderBonesShareLayoutGroup(oldBone, boneName)) {
          rows = rows.map((r) => {
            if (r.id !== hostRowId) return r
            const nb = { ...r.placeholderBindings }
            delete nb[oldBone]
            return { ...r, placeholderBindings: nb }
          })
        }
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

  if (!childRowId && prevChildId) {
    const hostAfter = rows.find((r) => r.id === hostRowId)!
    const remaining = Object.entries(hostAfter.placeholderBindings)
      .filter(([, id]) => id === prevChildId)
      .map(([b]) => b)
    rows = rows.map((r) => {
      if (r.id !== prevChildId) return r
      if (remaining.length === 0) return clearPinnedBoneOffsetFields({ ...r, pinnedUnder: null })
      if (r.pinnedUnder?.hostRowId === hostRowId) {
        return { ...r, pinnedUnder: { hostRowId, boneName: [...remaining].sort()[0]! } }
      }
      return r
    })
  }

  if (childRowId) {
    rows = rows.map((r) =>
      r.id === childRowId ? { ...r, pinnedUnder: { hostRowId, boneName } } : r,
    )
  }

  return rows as T[]
}
