import type { SpineControlRow } from '../SpineInstanceControls'

/** Drops the row and clears any placeholder / nesting references to it. */
export function spineRowsAfterRemoval(rows: SpineControlRow[], removeId: string): SpineControlRow[] {
  const next = rows.filter((r) => r.id !== removeId)
  return next.map((r) => {
    const placeholderBindings = { ...r.placeholderBindings }
    for (const [bone, cid] of Object.entries(placeholderBindings)) {
      if (cid === removeId) delete placeholderBindings[bone]
    }
    let pinnedUnder = r.pinnedUnder
    if (pinnedUnder?.hostRowId === removeId) pinnedUnder = null
    return { ...r, placeholderBindings, pinnedUnder }
  })
}
