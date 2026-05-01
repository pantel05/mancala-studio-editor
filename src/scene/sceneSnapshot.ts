import type { SpineControlRow } from '../SpineInstanceControls'
import { snapWorldXY } from '../pixi/snapWorldPosition'

/** Serializable scene state for undo/redo (skeleton order, poses, lock/visibility). */
export type SceneSnapshot = {
  order: string[]
  positions: Record<string, { x: number; y: number }>
  meta: Record<
    string,
    { locked: boolean; layerVisible: boolean; placeholderPolicyFrozen: boolean; placeholderPolicyIgnored: boolean }
  >
}

export const SCENE_HISTORY_MAX = 50

export function captureSceneSnapshot(rows: SpineControlRow[]): SceneSnapshot {
  const order = rows.map((r) => r.id)
  const positions: Record<string, { x: number; y: number }> = {}
  const meta: Record<
    string,
    { locked: boolean; layerVisible: boolean; placeholderPolicyFrozen: boolean; placeholderPolicyIgnored: boolean }
  > = {}
  for (const r of rows) {
    positions[r.id] = { x: r.spine.x, y: r.spine.y }
    meta[r.id] = {
      locked: r.locked,
      layerVisible: r.layerVisible,
      placeholderPolicyFrozen: r.placeholderPolicyFrozen,
      placeholderPolicyIgnored: r.placeholderPolicyIgnored,
    }
  }
  return { order, positions, meta }
}

export function snapshotsEqual(a: SceneSnapshot, b: SceneSnapshot): boolean {
  if (a.order.length !== b.order.length) return false
  for (let i = 0; i < a.order.length; i++) {
    if (a.order[i] !== b.order[i]) return false
  }
  for (const id of a.order) {
    const pa = a.positions[id]
    const pb = b.positions[id]
    if (!pa || !pb || pa.x !== pb.x || pa.y !== pb.y) return false
    const ma = a.meta[id]
    const mb = b.meta[id]
    if (
      !ma ||
      !mb ||
      ma.locked !== mb.locked ||
      ma.layerVisible !== mb.layerVisible ||
      (ma.placeholderPolicyFrozen ?? false) !== (mb.placeholderPolicyFrozen ?? false) ||
      (ma.placeholderPolicyIgnored ?? false) !== (mb.placeholderPolicyIgnored ?? false)
    )
      return false
  }
  return true
}

/** Applies snapshot to Pixi spines and returns new `spineRows` (same Spine instances). */
export function applySceneSnapshot(rows: SpineControlRow[], snap: SceneSnapshot): SpineControlRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const next: SpineControlRow[] = []
  for (const id of snap.order) {
    const r = byId.get(id)
    if (!r) return rows
    const p = snap.positions[id]
    const m = snap.meta[id]
    if (p) {
      const s = snapWorldXY(p.x, p.y)
      r.spine.position.set(s.x, s.y)
    }
    next.push({
      ...r,
      locked: m?.locked ?? r.locked,
      layerVisible: m?.layerVisible ?? r.layerVisible,
      placeholderPolicyFrozen: m?.placeholderPolicyFrozen ?? r.placeholderPolicyFrozen,
      placeholderPolicyIgnored: m?.placeholderPolicyIgnored ?? r.placeholderPolicyIgnored,
    })
  }
  if (next.length !== rows.length) return rows
  return next
}
