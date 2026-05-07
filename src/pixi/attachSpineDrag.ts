import type { Application, Container, FederatedPointerEvent } from 'pixi.js'
import { Point } from 'pixi.js'
import type { Spine } from '@esotericsoftware/spine-pixi-v8'
import {
  clientPointerToWorldXY,
  initAxisDragSession,
  maskWorldDelta,
  updateAxisLockOnMove,
  type AxisDragSession,
} from './axisLockedPointerDrag'
import { snapWorldScalar } from './snapWorldPosition'

/** Move spine origin by Δ in world space (nested or root); snaps to {@link snapWorldScalar} grid. */
function applySpineWorldDelta(spine: Spine, world: Container, dWorldX: number, dWorldY: number): void {
  if (dWorldX === 0 && dWorldY === 0) return
  const p = new Point()
  spine.getGlobalPosition(p)
  world.toLocal(p, undefined, p)
  const nx = snapWorldScalar(p.x + dWorldX)
  const ny = snapWorldScalar(p.y + dWorldY)
  const parent = spine.parent
  if (!parent) return
  if (parent === world) {
    spine.position.set(nx, ny)
  } else {
    const globalScratch = new Point()
    world.toGlobal(new Point(nx, ny), globalScratch)
    parent.toLocal(globalScratch, undefined, spine.position)
  }
  spine.update(0)
}

const cleanups = new WeakMap<Spine, () => void>()

export type AttachSpineDragOptions = {
  /** Fires on left pointer down on this spine, before drag listeners attach (e.g. sync editor selection). */
  onLeftPointerDown?: () => void
  /** If false, pointer down still runs {@link onLeftPointerDown} but does not start a drag. */
  isDragEnabled?: () => boolean
  /** After a drag session begins (left button, drag enabled). Arguments are viewport client coordinates. */
  onDragStart?: (clientX: number, clientY: number) => void
  /** After pointer up / cancel ended an active drag. */
  onDragEnd?: () => void
}

/**
 * Drag a Spine on the preview stage (pointer down on the Spine object, move anywhere, release).
 * Uses window listeners so one move stream works for all instances.
 * `world` is the zoom/pan container (parent of each Spine); deltas are applied in world space.
 */
export function attachSpineDrag(
  spine: Spine,
  app: Application,
  world: Container,
  opts?: AttachSpineDragOptions,
): void {
  detachSpineDrag(spine)

  spine.eventMode = 'dynamic'
  spine.cursor = 'grab'

  let dragging = false
  const lastWorldPtr = new Point()
  let axisSession: AxisDragSession = initAxisDragSession(0, 0, false)

  const onWinMove = (e: PointerEvent) => {
    if (!dragging) return
    const curWorld = new Point()
    clientPointerToWorldXY(app, world, e.clientX, e.clientY, curWorld)
    const dwx = curWorld.x - lastWorldPtr.x
    const dwy = curWorld.y - lastWorldPtr.y
    updateAxisLockOnMove(axisSession, e.clientX, e.clientY, e.shiftKey)
    const m = maskWorldDelta(dwx, dwy, e.shiftKey, axisSession)
    applySpineWorldDelta(spine, world, m.x, m.y)
    lastWorldPtr.copyFrom(curWorld)
  }

  const onWinUp = () => {
    if (!dragging) return
    dragging = false
    spine.update(0)
    const canDrag = opts?.isDragEnabled ? opts.isDragEnabled() : true
    spine.cursor = canDrag ? 'grab' : 'default'
    window.removeEventListener('pointermove', onWinMove)
    window.removeEventListener('pointerup', onWinUp)
    window.removeEventListener('pointercancel', onWinUp)
    opts?.onDragEnd?.()
  }

  const onDown = (e: FederatedPointerEvent) => {
    if (e.button !== 0) return
    opts?.onLeftPointerDown?.()
    if (opts?.isDragEnabled && !opts.isDragEnabled()) return
    dragging = true
    opts?.onDragStart?.(e.clientX, e.clientY)
    spine.cursor = 'grabbing'
    const ne = (e.nativeEvent ?? e) as PointerEvent
    axisSession = initAxisDragSession(ne.clientX, ne.clientY, ne.shiftKey)
    clientPointerToWorldXY(app, world, ne.clientX, ne.clientY, lastWorldPtr)
    window.addEventListener('pointermove', onWinMove)
    window.addEventListener('pointerup', onWinUp)
    window.addEventListener('pointercancel', onWinUp)
  }

  spine.on('pointerdown', onDown)

  const cleanup = () => {
    spine.off('pointerdown', onDown)
    window.removeEventListener('pointermove', onWinMove)
    window.removeEventListener('pointerup', onWinUp)
    window.removeEventListener('pointercancel', onWinUp)
    dragging = false
    spine.cursor = 'auto'
    spine.eventMode = 'auto'
  }

  cleanups.set(spine, cleanup)
}

export function detachSpineDrag(spine: Spine): void {
  const fn = cleanups.get(spine)
  if (fn) {
    fn()
    cleanups.delete(spine)
  }
}
