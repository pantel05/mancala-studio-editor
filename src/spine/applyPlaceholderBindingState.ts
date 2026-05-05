import { placeholderBonesShareLayoutGroup } from './placeholderLayoutResolution'
import {
  bindingsMapToRecord,
  normalizePlaceholderBindings,
  type PlaceholderBindingsMap,
} from './placeholderBindingsMap'

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
  placeholderBindings: Record<string, string | string[]>
  pinnedUnder: null | { hostRowId: string; boneName: string }
}

export type PlaceholderBindingOp = 'replace' | 'add' | 'remove'

function hostMapFromRow(r: PlaceholderBindingAwareRow): PlaceholderBindingsMap {
  return normalizePlaceholderBindings(r.placeholderBindings)
}

function setHostMap<T extends PlaceholderBindingAwareRow>(
  rows: T[],
  hostRowId: string,
  map: PlaceholderBindingsMap,
): T[] {
  const rec = bindingsMapToRecord(map)
  return rows.map((r) => (r.id === hostRowId ? { ...r, placeholderBindings: rec } : r))
}

function childStillPinnedOnHost(map: PlaceholderBindingsMap, childId: string): boolean {
  return Object.values(map).some((ids) => ids.includes(childId))
}

function removeChildFromBone(map: PlaceholderBindingsMap, bone: string, childId: string): void {
  const list = map[bone]
  if (!list) return
  const next = list.filter((id) => id !== childId)
  if (next.length === 0) delete map[bone]
  else map[bone] = next
}

function unpinIfNotOnHost<T extends PlaceholderBindingAwareRow>(
  rows: T[],
  hostRowId: string,
  childId: string,
): T[] {
  const host = rows.find((r) => r.id === hostRowId)
  if (!host) return rows
  const map = hostMapFromRow(host)
  if (childStillPinnedOnHost(map, childId)) return rows
  return rows.map((r) =>
    r.id === childId ? clearPinnedBoneOffsetFields({ ...r, pinnedUnder: null }) : r,
  )
}

function syncPinnedUnder<T extends PlaceholderBindingAwareRow>(
  rows: T[],
  hostRowId: string,
  boneName: string,
  childId: string,
): T[] {
  return rows.map((r) =>
    r.id === childId ? { ...r, pinnedUnder: { hostRowId, boneName } } : r,
  )
}

function stripChildFromHostBindings<T extends PlaceholderBindingAwareRow>(
  rows: T[],
  oldHostId: string,
  childId: string,
): T[] {
  const host = rows.find((r) => r.id === oldHostId)
  if (!host) return rows
  const map = hostMapFromRow(host)
  for (const bone of Object.keys({ ...map })) {
    removeChildFromBone(map, bone, childId)
  }
  let next = setHostMap(rows, oldHostId, map)
  next = unpinIfNotOnHost(next, oldHostId, childId)
  return next
}

function stripChildFromIncompatibleBonesSameHost<T extends PlaceholderBindingAwareRow>(
  rows: T[],
  hostRowId: string,
  boneName: string,
  childId: string,
): T[] {
  const host = rows.find((r) => r.id === hostRowId)
  if (!host) return rows
  const map = hostMapFromRow(host)
  let changed = false
  for (const b of Object.keys({ ...map })) {
    if (b === boneName) continue
    if (!map[b]?.includes(childId)) continue
    if (placeholderBonesShareLayoutGroup(b, boneName)) continue
    removeChildFromBone(map, b, childId)
    changed = true
  }
  if (!changed) return rows
  let next = setHostMap(rows, hostRowId, map)
  next = unpinIfNotOnHost(next, hostRowId, childId)
  return next
}

/**
 * Updates placeholder bindings / `pinnedUnder` when attaching, adding, removing, or clearing symbols.
 *
 * - **replace** + id: this bone holds exactly that symbol (others on this bone are unbound if unused elsewhere).
 * - **replace** + null: clear all symbols on this bone.
 * - **add** + id: append symbol on this bone (each has its own bone-local offsets in the inspector).
 * - **remove** + id: remove that symbol from this bone only.
 */
export function applyPlaceholderBinding<T extends PlaceholderBindingAwareRow>(
  prev: T[],
  hostRowId: string,
  boneName: string,
  childRowId: string | null,
  op: PlaceholderBindingOp = 'replace',
): T[] {
  const hostExists = prev.some((r) => r.id === hostRowId)
  if (!hostExists) return prev as T[]

  if ((op === 'add' || op === 'remove') && !childRowId) return prev as T[]

  let rows = prev.map((r) => ({
    ...r,
    placeholderBindings: { ...r.placeholderBindings },
    pinnedUnder: r.pinnedUnder ? { ...r.pinnedUnder } : null,
  })) as T[]

  let host = rows.find((r) => r.id === hostRowId)!
  let map = hostMapFromRow(host)

  if (op === 'replace' && childRowId == null) {
    const prevIds = [...(map[boneName] ?? [])]
    delete map[boneName]
    rows = setHostMap(rows, hostRowId, map)
    for (const rid of prevIds) {
      rows = unpinIfNotOnHost(rows, hostRowId, rid)
    }
    return rows
  }

  if (op === 'remove' && childRowId) {
    removeChildFromBone(map, boneName, childRowId)
    rows = setHostMap(rows, hostRowId, map)
    rows = unpinIfNotOnHost(rows, hostRowId, childRowId)
    return rows
  }

  const childId = childRowId!
  const childRow = rows.find((r) => r.id === childId)
  if (!childRow) return rows

  if (childRow.pinnedUnder) {
    if (childRow.pinnedUnder.hostRowId !== hostRowId) {
      rows = stripChildFromHostBindings(rows, childRow.pinnedUnder.hostRowId, childId)
    } else if (childRow.pinnedUnder.boneName !== boneName) {
      rows = stripChildFromIncompatibleBonesSameHost(rows, hostRowId, boneName, childId)
    }
  }

  host = rows.find((r) => r.id === hostRowId)!
  map = hostMapFromRow(host)

  if (op === 'replace') {
    const prevOnBone = [...(map[boneName] ?? [])]
    map[boneName] = [childId]
    rows = setHostMap(rows, hostRowId, map)
    host = rows.find((r) => r.id === hostRowId)!
    const finalMap = hostMapFromRow(host)
    for (const rid of prevOnBone) {
      if (rid === childId) continue
      if (!childStillPinnedOnHost(finalMap, rid)) {
        rows = rows.map((r) =>
          r.id === rid ? clearPinnedBoneOffsetFields({ ...r, pinnedUnder: null }) : r,
        )
      }
    }
    rows = syncPinnedUnder(rows, hostRowId, boneName, childId)
    return rows
  }

  // add
  const list = [...(map[boneName] ?? [])]
  if (!list.includes(childId)) list.push(childId)
  map[boneName] = list
  rows = setHostMap(rows, hostRowId, map)
  rows = syncPinnedUnder(rows, hostRowId, boneName, childId)
  return rows
}
