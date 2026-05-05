import type { SpineControlRow } from '../SpineInstanceControls'
import { clearPinnedBoneOffsetFields } from '../spine/applyPlaceholderBindingState'
import { bindingsMapToRecord, normalizePlaceholderBindings } from '../spine/placeholderBindingsMap'

/** Drops the row and clears any placeholder / nesting references to it. */
export function spineRowsAfterRemoval(rows: SpineControlRow[], removeId: string): SpineControlRow[] {
  const next = rows.filter((r) => r.id !== removeId)
  return next.map((r) => {
    const map = normalizePlaceholderBindings(r.placeholderBindings)
    for (const bone of Object.keys(map)) {
      const ids = map[bone]!.filter((id) => id !== removeId)
      if (ids.length === 0) delete map[bone]
      else map[bone] = ids
    }
    const placeholderBindings = bindingsMapToRecord(map)
    let pinnedUnder = r.pinnedUnder
    if (pinnedUnder?.hostRowId === removeId) pinnedUnder = null
    const base = { ...r, placeholderBindings, pinnedUnder }
    return pinnedUnder == null && r.pinnedUnder != null ? clearPinnedBoneOffsetFields(base) : base
  })
}
