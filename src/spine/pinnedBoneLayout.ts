import type { SpineControlRow } from '../SpineInstanceControls'
import type { PlaceholderLayoutKey } from './placeholderLayoutResolution'

/** Bone-local offset for the active layout tab (nested / pinned rows only). */
export function effectivePinnedBoneOffset(
  row: Pick<
    SpineControlRow,
    | 'pinnedUnder'
    | 'spine'
    | 'pinnedBoneOffsetMain'
    | 'pinnedBoneLayoutPt'
    | 'pinnedBoneLayoutLs'
    | 'pinnedBoneLayoutTb'
  >,
  layout: PlaceholderLayoutKey,
): { x: number; y: number } {
  if (!row.pinnedUnder) return { x: row.spine.x, y: row.spine.y }
  const main = row.pinnedBoneOffsetMain ?? { x: row.spine.x, y: row.spine.y }
  if (layout === 'main') return { x: main.x, y: main.y }
  if (layout === 'pt') {
    const o = row.pinnedBoneLayoutPt
    return o ? { x: o.x, y: o.y } : { x: main.x, y: main.y }
  }
  if (layout === 'ls') {
    const o = row.pinnedBoneLayoutLs
    return o ? { x: o.x, y: o.y } : { x: main.x, y: main.y }
  }
  const o = row.pinnedBoneLayoutTb
  return o ? { x: o.x, y: o.y } : { x: main.x, y: main.y }
}

export function offsetsEqual(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return a.x === b.x && a.y === b.y
}
