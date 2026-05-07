import type { Application, Container } from 'pixi.js'
import { Point } from 'pixi.js'

/** Map viewport client coordinates to **world** container space (same as grid / inspector). */
export function clientPointerToWorldXY(
  app: Application,
  world: Container,
  clientX: number,
  clientY: number,
  out: Point,
): void {
  app.renderer.events.mapPositionToPoint(out, clientX, clientY)
  world.toLocal(out, undefined, out)
}

/** Screen-space movement before axis lock commits (Shift + dominant direction). */
export const AXIS_LOCK_THRESHOLD_PX = 4

export type AxisLock = 'x' | 'y' | null

export type AxisDragSession = {
  axisLock: AxisLock
  dragStartClientX: number
  dragStartClientY: number
  prevShift: boolean
}

export function initAxisDragSession(clientX: number, clientY: number, shiftKey: boolean): AxisDragSession {
  return {
    axisLock: null,
    dragStartClientX: clientX,
    dragStartClientY: clientY,
    prevShift: shiftKey,
  }
}

/** Call each pointermove; mutates session (Shift toggle resets lock + threshold origin). */
export function updateAxisLockOnMove(session: AxisDragSession, clientX: number, clientY: number, shiftKey: boolean): void {
  if (shiftKey !== session.prevShift) {
    session.axisLock = null
    session.dragStartClientX = clientX
    session.dragStartClientY = clientY
    session.prevShift = shiftKey
  }
  if (!shiftKey) {
    session.axisLock = null
    return
  }
  if (session.axisLock != null) return
  const tdx = clientX - session.dragStartClientX
  const tdy = clientY - session.dragStartClientY
  if (Math.abs(tdx) >= AXIS_LOCK_THRESHOLD_PX || Math.abs(tdy) >= AXIS_LOCK_THRESHOLD_PX) {
    session.axisLock = Math.abs(tdx) >= Math.abs(tdy) ? 'x' : 'y'
  }
}

/** World-space delta from pointer motion; masked when Shift is held and axis is locked. */
export function maskWorldDelta(
  dWorldX: number,
  dWorldY: number,
  shiftKey: boolean,
  session: AxisDragSession,
): { x: number; y: number } {
  if (!shiftKey || session.axisLock == null) {
    return { x: dWorldX, y: dWorldY }
  }
  if (session.axisLock === 'x') return { x: dWorldX, y: 0 }
  return { x: 0, y: dWorldY }
}
