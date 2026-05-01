import { Application, Container, FederatedPointerEvent, Graphics, Point } from 'pixi.js'

export type StageBackdropMode = 'dark' | 'checker'

export function paintBackdrop(
  g: Graphics,
  w: number,
  h: number,
  mode: StageBackdropMode,
): void {
  g.clear()
  if (mode === 'dark') {
    g.rect(0, 0, w, h).fill({ color: 0x1a1d26 })
    return
  }
  const t = 14
  g.rect(0, 0, w, h).fill({ color: 0x1a1d26 })
  for (let y = 0; y < h + t; y += t) {
    for (let x = 0; x < w + t; x += t) {
      const c = ((x / t + y / t) & 1) === 0 ? 0x2a303c : 0x1f2329
      g.rect(x, y, t, t).fill({ color: c, alpha: 0.9 })
    }
  }
}

/**
 * Wheel zoom (toward cursor). Pan: middle-mouse drag anywhere on the host, or Shift+drag on the backdrop.
 */
export function attachStageNavigation(
  host: HTMLElement,
  app: Application,
  world: Container,
  backdrop: Graphics,
  opts: {
    getBackdropMode: () => StageBackdropMode
    onViewChange?: (scale: number) => void
    /** Primary click on backdrop (not used for shift+drag pan). */
    onBackdropLeftPointerDown?: () => void
  },
): () => void {
  const redraw = () => {
    paintBackdrop(
      backdrop,
      app.screen.width,
      app.screen.height,
      opts.getBackdropMode(),
    )
  }

  redraw()
  app.renderer.on('resize', redraw)

  const onWheel = (e: WheelEvent) => {
    if (!host.contains(e.target as Node)) return
    e.preventDefault()
    const old = world.scale.x
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08
    const ns = Math.min(4, Math.max(0.2, old * factor))
    const p = new Point()
    app.renderer.events.mapPositionToPoint(p, e.clientX, e.clientY)
    const og = new Point()
    world.getGlobalPosition(og)
    const wlX = (p.x - og.x) / old
    const wlY = (p.y - og.y) / old
    world.scale.set(ns)
    const shellG = new Point()
    if (world.parent) {
      world.parent.getGlobalPosition(shellG)
      world.position.set(p.x - wlX * ns - shellG.x, p.y - wlY * ns - shellG.y)
    } else {
      world.position.set(p.x - wlX * ns, p.y - wlY * ns)
    }
    opts.onViewChange?.(ns)
  }
  host.addEventListener('wheel', onWheel, { passive: false })

  let panning = false
  const lastPan = new Point()

  const onPanWinMove = (e: PointerEvent) => {
    if (!panning) return
    const cur = new Point()
    app.renderer.events.mapPositionToPoint(cur, e.clientX, e.clientY)
    world.x += cur.x - lastPan.x
    world.y += cur.y - lastPan.y
    lastPan.copyFrom(cur)
  }

  const endPanWin = () => {
    if (!panning) return
    panning = false
    window.removeEventListener('pointermove', onPanWinMove)
    window.removeEventListener('pointerup', endPanWin)
    window.removeEventListener('pointercancel', endPanWin)
  }

  const beginPan = (clientX: number, clientY: number) => {
    if (panning) return
    panning = true
    app.renderer.events.mapPositionToPoint(lastPan, clientX, clientY)
    window.addEventListener('pointermove', onPanWinMove)
    window.addEventListener('pointerup', endPanWin)
    window.addEventListener('pointercancel', endPanWin)
  }

  const onHostMiddleDown = (e: PointerEvent) => {
    if (e.button !== 1) return
    if (!host.contains(e.target as Node)) return
    beginPan(e.clientX, e.clientY)
    e.preventDefault()
  }

  const onBackdropDown = (ev: FederatedPointerEvent) => {
    if (ev.shiftKey && ev.button === 0) {
      beginPan(ev.clientX, ev.clientY)
      ev.stopPropagation()
      return
    }
    if (ev.button === 0) opts.onBackdropLeftPointerDown?.()
  }

  host.addEventListener('pointerdown', onHostMiddleDown)
  backdrop.on('pointerdown', onBackdropDown)

  return () => {
    endPanWin()
    app.renderer.off('resize', redraw)
    host.removeEventListener('wheel', onWheel)
    host.removeEventListener('pointerdown', onHostMiddleDown)
    backdrop.off('pointerdown', onBackdropDown)
  }
}
