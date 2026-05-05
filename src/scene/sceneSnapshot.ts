import type { SpineControlRow } from '../SpineInstanceControls'
import { snapWorldXY } from '../pixi/snapWorldPosition'
import { effectivePinnedBoneOffset } from '../spine/pinnedBoneLayout'
import type { PlaceholderLayoutKey } from '../spine/placeholderLayoutResolution'

/** Uniform display scale (`spine.scale`) for a **root** row for the active layout tab. */
export function effectiveRootSpineScale(
  row: SpineControlRow,
  layout: PlaceholderLayoutKey,
): number {
  if (row.pinnedUnder) return row.spine.scale.x
  const c = row.canonicalScale ?? row.spine.scale.x
  if (layout === 'main') return c
  if (layout === 'pt') return row.layoutPtScale ?? c
  if (layout === 'ls') return row.layoutLsScale ?? c
  return row.layoutTbScale ?? c
}

/** Serializable scene state for undo/redo (skeleton order, poses, lock/visibility). */
export type SceneSnapshot = {
  order: string[]
  positions: Record<string, { x: number; y: number }>
  meta: Record<
    string,
    { locked: boolean; layerVisible: boolean; placeholderPolicyFrozen: boolean; placeholderPolicyIgnored: boolean }
  >
  /** Root rows: main-layout world anchor (optional; omitted for older snapshots). */
  canonicalWorld?: Record<string, { x: number; y: number }>
  /** Root rows: portrait override; key present with undefined = cleared override. */
  layoutPt?: Record<string, { x: number; y: number } | undefined>
  layoutLs?: Record<string, { x: number; y: number } | undefined>
  layoutTb?: Record<string, { x: number; y: number } | undefined>
  /** Root rows: Main-layout uniform display scale (see `effectiveRootSpineScale`). */
  canonicalScale?: Record<string, number>
  layoutPtScale?: Record<string, number | undefined>
  layoutLsScale?: Record<string, number | undefined>
  layoutTbScale?: Record<string, number | undefined>
  /** Pinned rows: Main bone-local offset. */
  pinnedBoneMain?: Record<string, { x: number; y: number }>
  pinnedBonePt?: Record<string, { x: number; y: number } | undefined>
  pinnedBoneLs?: Record<string, { x: number; y: number } | undefined>
  pinnedBoneTb?: Record<string, { x: number; y: number } | undefined>
  /** Per-layout visibility overrides (spine rows); key present means value replaces row field. */
  layerVisPt?: Record<string, boolean | undefined>
  layerVisLs?: Record<string, boolean | undefined>
  layerVisTb?: Record<string, boolean | undefined>
}

export const SCENE_HISTORY_MAX = 50

export function captureSceneSnapshot(
  rows: SpineControlRow[],
  /** Used so snapshot `canonicalWorld` stays the Main anchor while editing pt/ls/tb overrides. */
  layoutTarget: PlaceholderLayoutKey = 'main',
): SceneSnapshot {
  const order = rows.map((r) => r.id)
  const positions: Record<string, { x: number; y: number }> = {}
  const meta: Record<
    string,
    { locked: boolean; layerVisible: boolean; placeholderPolicyFrozen: boolean; placeholderPolicyIgnored: boolean }
  > = {}
  const canonicalWorld: Record<string, { x: number; y: number }> = {}
  const layoutPt: Record<string, { x: number; y: number } | undefined> = {}
  const layoutLs: Record<string, { x: number; y: number } | undefined> = {}
  const layoutTb: Record<string, { x: number; y: number } | undefined> = {}
  const canonicalScale: Record<string, number> = {}
  const layoutPtScale: Record<string, number | undefined> = {}
  const layoutLsScale: Record<string, number | undefined> = {}
  const layoutTbScale: Record<string, number | undefined> = {}
  const pinnedBoneMain: Record<string, { x: number; y: number }> = {}
  const pinnedBonePt: Record<string, { x: number; y: number } | undefined> = {}
  const pinnedBoneLs: Record<string, { x: number; y: number } | undefined> = {}
  const pinnedBoneTb: Record<string, { x: number; y: number } | undefined> = {}
  const layerVisPt: Record<string, boolean | undefined> = {}
  const layerVisLs: Record<string, boolean | undefined> = {}
  const layerVisTb: Record<string, boolean | undefined> = {}
  for (const r of rows) {
    positions[r.id] = { x: r.spine.x, y: r.spine.y }
    meta[r.id] = {
      locked: r.locked,
      layerVisible: r.layerVisible,
      placeholderPolicyFrozen: r.placeholderPolicyFrozen,
      placeholderPolicyIgnored: r.placeholderPolicyIgnored,
    }
    if (!r.pinnedUnder) {
      if (layoutTarget === 'main') {
        canonicalWorld[r.id] = { x: r.spine.x, y: r.spine.y }
        canonicalScale[r.id] = r.spine.scale.x
      } else {
        canonicalWorld[r.id] = r.canonicalWorld ?? { x: r.spine.x, y: r.spine.y }
        canonicalScale[r.id] = r.canonicalScale ?? r.spine.scale.x
      }
      if (r.layoutPt) layoutPt[r.id] = { ...r.layoutPt }
      if (r.layoutLs) layoutLs[r.id] = { ...r.layoutLs }
      if (r.layoutTb) layoutTb[r.id] = { ...r.layoutTb }
      if (typeof r.layoutPtScale === 'number') layoutPtScale[r.id] = r.layoutPtScale
      if (typeof r.layoutLsScale === 'number') layoutLsScale[r.id] = r.layoutLsScale
      if (typeof r.layoutTbScale === 'number') layoutTbScale[r.id] = r.layoutTbScale
    }
    if (r.pinnedUnder) {
      pinnedBoneMain[r.id] = {
        ...(r.pinnedBoneOffsetMain ?? { x: r.spine.x, y: r.spine.y }),
      }
      if (r.pinnedBoneLayoutPt) pinnedBonePt[r.id] = { ...r.pinnedBoneLayoutPt }
      if (r.pinnedBoneLayoutLs) pinnedBoneLs[r.id] = { ...r.pinnedBoneLayoutLs }
      if (r.pinnedBoneLayoutTb) pinnedBoneTb[r.id] = { ...r.pinnedBoneLayoutTb }
    }
    if (r.layoutPtLayerVisible !== undefined) layerVisPt[r.id] = r.layoutPtLayerVisible
    if (r.layoutLsLayerVisible !== undefined) layerVisLs[r.id] = r.layoutLsLayerVisible
    if (r.layoutTbLayerVisible !== undefined) layerVisTb[r.id] = r.layoutTbLayerVisible
  }
  return {
    order,
    positions,
    meta,
    canonicalWorld,
    canonicalScale,
    ...(Object.keys(layoutPt).length > 0 ? { layoutPt } : {}),
    ...(Object.keys(layoutLs).length > 0 ? { layoutLs } : {}),
    ...(Object.keys(layoutTb).length > 0 ? { layoutTb } : {}),
    ...(Object.keys(layoutPtScale).length > 0 ? { layoutPtScale } : {}),
    ...(Object.keys(layoutLsScale).length > 0 ? { layoutLsScale } : {}),
    ...(Object.keys(layoutTbScale).length > 0 ? { layoutTbScale } : {}),
    ...(Object.keys(pinnedBoneMain).length > 0 ? { pinnedBoneMain } : {}),
    ...(Object.keys(pinnedBonePt).length > 0 ? { pinnedBonePt } : {}),
    ...(Object.keys(pinnedBoneLs).length > 0 ? { pinnedBoneLs } : {}),
    ...(Object.keys(pinnedBoneTb).length > 0 ? { pinnedBoneTb } : {}),
    ...(Object.keys(layerVisPt).length > 0 ? { layerVisPt } : {}),
    ...(Object.keys(layerVisLs).length > 0 ? { layerVisLs } : {}),
    ...(Object.keys(layerVisTb).length > 0 ? { layerVisTb } : {}),
  }
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
    const hasCwA = !!(a.canonicalWorld && Object.prototype.hasOwnProperty.call(a.canonicalWorld, id))
    const hasCwB = !!(b.canonicalWorld && Object.prototype.hasOwnProperty.call(b.canonicalWorld, id))
    if (hasCwA !== hasCwB) return false
    if (hasCwA) {
      const ca = a.canonicalWorld![id]
      const cb = b.canonicalWorld![id]
      if (ca.x !== cb.x || ca.y !== cb.y) return false
    }

    const hasCsA = !!(a.canonicalScale && Object.prototype.hasOwnProperty.call(a.canonicalScale, id))
    const hasCsB = !!(b.canonicalScale && Object.prototype.hasOwnProperty.call(b.canonicalScale, id))
    if (hasCsA !== hasCsB) return false
    if (hasCsA && a.canonicalScale![id] !== b.canonicalScale![id]) return false

    const aHasLps = !!(a.layoutPtScale && Object.prototype.hasOwnProperty.call(a.layoutPtScale, id))
    const bHasLps = !!(b.layoutPtScale && Object.prototype.hasOwnProperty.call(b.layoutPtScale, id))
    if (aHasLps !== bHasLps) return false
    if (aHasLps && a.layoutPtScale![id] !== b.layoutPtScale![id]) return false

    const aHasLss = !!(a.layoutLsScale && Object.prototype.hasOwnProperty.call(a.layoutLsScale, id))
    const bHasLss = !!(b.layoutLsScale && Object.prototype.hasOwnProperty.call(b.layoutLsScale, id))
    if (aHasLss !== bHasLss) return false
    if (aHasLss && a.layoutLsScale![id] !== b.layoutLsScale![id]) return false

    const aHasTbs = !!(a.layoutTbScale && Object.prototype.hasOwnProperty.call(a.layoutTbScale, id))
    const bHasTbs = !!(b.layoutTbScale && Object.prototype.hasOwnProperty.call(b.layoutTbScale, id))
    if (aHasTbs !== bHasTbs) return false
    if (aHasTbs && a.layoutTbScale![id] !== b.layoutTbScale![id]) return false

    const aHasLp = !!(a.layoutPt && Object.prototype.hasOwnProperty.call(a.layoutPt, id))
    const bHasLp = !!(b.layoutPt && Object.prototype.hasOwnProperty.call(b.layoutPt, id))
    if (aHasLp !== bHasLp) return false
    if (aHasLp) {
      const la = a.layoutPt![id]
      const lb = b.layoutPt![id]
      if (!!la !== !!lb) return false
      if (la && lb && (la.x !== lb.x || la.y !== lb.y)) return false
    }

    const aHasLl = !!(a.layoutLs && Object.prototype.hasOwnProperty.call(a.layoutLs, id))
    const bHasLl = !!(b.layoutLs && Object.prototype.hasOwnProperty.call(b.layoutLs, id))
    if (aHasLl !== bHasLl) return false
    if (aHasLl) {
      const la = a.layoutLs![id]
      const lb = b.layoutLs![id]
      if (!!la !== !!lb) return false
      if (la && lb && (la.x !== lb.x || la.y !== lb.y)) return false
    }

    const aHasLt = !!(a.layoutTb && Object.prototype.hasOwnProperty.call(a.layoutTb, id))
    const bHasLt = !!(b.layoutTb && Object.prototype.hasOwnProperty.call(b.layoutTb, id))
    if (aHasLt !== bHasLt) return false
    if (aHasLt) {
      const la = a.layoutTb![id]
      const lb = b.layoutTb![id]
      if (!!la !== !!lb) return false
      if (la && lb && (la.x !== lb.x || la.y !== lb.y)) return false
    }

    const aHasPinMain = !!(a.pinnedBoneMain && Object.prototype.hasOwnProperty.call(a.pinnedBoneMain, id))
    const bHasPinMain = !!(b.pinnedBoneMain && Object.prototype.hasOwnProperty.call(b.pinnedBoneMain, id))
    if (aHasPinMain !== bHasPinMain) return false
    if (aHasPinMain) {
      const pa = a.pinnedBoneMain![id]
      const pb = b.pinnedBoneMain![id]
      if (pa.x !== pb.x || pa.y !== pb.y) return false
    }

    const cmpPinOpt = (key: 'pinnedBonePt' | 'pinnedBoneLs' | 'pinnedBoneTb') => {
      const aM = a[key]
      const bM = b[key]
      const aHas = !!(aM && Object.prototype.hasOwnProperty.call(aM, id))
      const bHas = !!(bM && Object.prototype.hasOwnProperty.call(bM, id))
      if (aHas !== bHas) return false
      if (aHas) {
        const la = aM![id]
        const lb = bM![id]
        if (!!la !== !!lb) return false
        if (la && lb && (la.x !== lb.x || la.y !== lb.y)) return false
      }
      return true
    }
    if (!cmpPinOpt('pinnedBonePt')) return false
    if (!cmpPinOpt('pinnedBoneLs')) return false
    if (!cmpPinOpt('pinnedBoneTb')) return false

    const cmpLayerVis = (key: 'layerVisPt' | 'layerVisLs' | 'layerVisTb') => {
      const aM = a[key]
      const bM = b[key]
      const aHas = !!(aM && Object.prototype.hasOwnProperty.call(aM, id))
      const bHas = !!(bM && Object.prototype.hasOwnProperty.call(bM, id))
      if (aHas !== bHas) return false
      if (aHas && aM![id] !== bM![id]) return false
      return true
    }
    if (!cmpLayerVis('layerVisPt')) return false
    if (!cmpLayerVis('layerVisLs')) return false
    if (!cmpLayerVis('layerVisTb')) return false
  }
  return true
}

/** Applies snapshot to Pixi spines and returns new `spineRows` (same Spine instances). */
export function applySceneSnapshot(
  rows: SpineControlRow[],
  snap: SceneSnapshot,
  layoutTarget: PlaceholderLayoutKey = 'main',
): SpineControlRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const next: SpineControlRow[] = []
  for (const id of snap.order) {
    const r = byId.get(id)
    if (!r) return rows
    const p = snap.positions[id]
    const m = snap.meta[id]
    const hasPinnedMainSnap =
      !!(snap.pinnedBoneMain && Object.prototype.hasOwnProperty.call(snap.pinnedBoneMain, id))
    const pm = hasPinnedMainSnap ? snap.pinnedBoneMain![id] : undefined
    const ptp = snap.pinnedBonePt?.[id]
    const pinnedBoneLayoutPtNext =
      snap.pinnedBonePt && Object.prototype.hasOwnProperty.call(snap.pinnedBonePt, id)
        ? ptp
        : r.pinnedBoneLayoutPt
    const pls = snap.pinnedBoneLs?.[id]
    const pinnedBoneLayoutLsNext =
      snap.pinnedBoneLs && Object.prototype.hasOwnProperty.call(snap.pinnedBoneLs, id)
        ? pls
        : r.pinnedBoneLayoutLs
    const ptb = snap.pinnedBoneTb?.[id]
    const pinnedBoneLayoutTbNext =
      snap.pinnedBoneTb && Object.prototype.hasOwnProperty.call(snap.pinnedBoneTb, id)
        ? ptb
        : r.pinnedBoneLayoutTb
    const pinnedBoneOffsetMainNext = hasPinnedMainSnap && pm ? { ...pm } : r.pinnedBoneOffsetMain

    const lvp = snap.layerVisPt?.[id]
    const layoutPtLayerVisibleNext =
      snap.layerVisPt && Object.prototype.hasOwnProperty.call(snap.layerVisPt, id)
        ? lvp
        : r.layoutPtLayerVisible
    const lvl = snap.layerVisLs?.[id]
    const layoutLsLayerVisibleNext =
      snap.layerVisLs && Object.prototype.hasOwnProperty.call(snap.layerVisLs, id)
        ? lvl
        : r.layoutLsLayerVisible
    const lvt = snap.layerVisTb?.[id]
    const layoutTbLayerVisibleNext =
      snap.layerVisTb && Object.prototype.hasOwnProperty.call(snap.layerVisTb, id)
        ? lvt
        : r.layoutTbLayerVisible

    if (p) {
      const s = snapWorldXY(p.x, p.y)
      if (!r.pinnedUnder) {
        r.spine.position.set(s.x, s.y)
      } else if (!hasPinnedMainSnap) {
        r.spine.position.set(s.x, s.y)
      }
    }
    const cw = snap.canonicalWorld?.[id]
    const lp = snap.layoutPt?.[id]
    const layoutPtNext =
      snap.layoutPt && Object.prototype.hasOwnProperty.call(snap.layoutPt, id)
        ? lp
        : r.layoutPt
    const ll = snap.layoutLs?.[id]
    const layoutLsNext =
      snap.layoutLs && Object.prototype.hasOwnProperty.call(snap.layoutLs, id)
        ? ll
        : r.layoutLs
    const lt = snap.layoutTb?.[id]
    const layoutTbNext =
      snap.layoutTb && Object.prototype.hasOwnProperty.call(snap.layoutTb, id)
        ? lt
        : r.layoutTb

    const hasCsSnap =
      !!(snap.canonicalScale && Object.prototype.hasOwnProperty.call(snap.canonicalScale, id))
    const cs = hasCsSnap ? snap.canonicalScale![id] : undefined
    const lps = snap.layoutPtScale?.[id]
    const layoutPtScaleNext =
      snap.layoutPtScale && Object.prototype.hasOwnProperty.call(snap.layoutPtScale, id)
        ? lps
        : r.layoutPtScale
    const lss = snap.layoutLsScale?.[id]
    const layoutLsScaleNext =
      snap.layoutLsScale && Object.prototype.hasOwnProperty.call(snap.layoutLsScale, id)
        ? lss
        : r.layoutLsScale
    const tbs = snap.layoutTbScale?.[id]
    const layoutTbScaleNext =
      snap.layoutTbScale && Object.prototype.hasOwnProperty.call(snap.layoutTbScale, id)
        ? tbs
        : r.layoutTbScale

    const merged: SpineControlRow = {
      ...r,
      locked: m?.locked ?? r.locked,
      layerVisible: m?.layerVisible ?? r.layerVisible,
      placeholderPolicyFrozen: m?.placeholderPolicyFrozen ?? r.placeholderPolicyFrozen,
      placeholderPolicyIgnored: m?.placeholderPolicyIgnored ?? r.placeholderPolicyIgnored,
      canonicalWorld: cw ? { ...cw } : r.canonicalWorld,
      layoutPt: layoutPtNext,
      layoutLs: layoutLsNext,
      layoutTb: layoutTbNext,
      canonicalScale: hasCsSnap ? cs : r.canonicalScale,
      layoutPtScale: layoutPtScaleNext,
      layoutLsScale: layoutLsScaleNext,
      layoutTbScale: layoutTbScaleNext,
      pinnedBoneOffsetMain: pinnedBoneOffsetMainNext,
      pinnedBoneLayoutPt: pinnedBoneLayoutPtNext,
      pinnedBoneLayoutLs: pinnedBoneLayoutLsNext,
      pinnedBoneLayoutTb: pinnedBoneLayoutTbNext,
      layoutPtLayerVisible: layoutPtLayerVisibleNext,
      layoutLsLayerVisible: layoutLsLayerVisibleNext,
      layoutTbLayerVisible: layoutTbLayerVisibleNext,
    }
    if (merged.pinnedUnder && hasPinnedMainSnap) {
      const o = effectivePinnedBoneOffset(merged, layoutTarget)
      r.spine.position.set(o.x, o.y)
    }
    const sc = effectiveRootSpineScale(merged, layoutTarget)
    r.spine.scale.set(sc, sc)
    next.push(merged)
  }
  if (next.length !== rows.length) return rows
  return next
}
