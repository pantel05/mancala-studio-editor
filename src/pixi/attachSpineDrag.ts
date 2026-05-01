import type { Application, Container, FederatedPointerEvent } from 'pixi.js'
import { Point } from 'pixi.js'
import type { Spine } from '@esotericsoftware/spine-pixi-v8'
import { snapWorldScalar } from './snapWorldPosition'

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
  const lastLocal = new Point()

  const onWinMove = (e: PointerEvent) => {
    if (!dragging) return
    const g = new Point()
    app.renderer.events.mapPositionToPoint(g, e.clientX, e.clientY)
    /** Use the spine's actual parent for local-space delta so nested children
     *  (attached under a placeholder bone wrapper) move in bone space, not world space. */
    const posParent = spine.parent ?? world
    const cur = posParent.toLocal(g)
    spine.position.x += cur.x - lastLocal.x
    spine.position.y += cur.y - lastLocal.y
    spine.position.x = snapWorldScalar(spine.position.x)
    spine.position.y = snapWorldScalar(spine.position.y)
    lastLocal.copyFrom(cur)
  }

  const onWinUp = () => {
    if (!dragging) return
    dragging = false
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
    lastLocal.copyFrom(e.getLocalPosition(spine.parent ?? world))
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
