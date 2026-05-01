import { Container, Graphics, Point, type Application, type FederatedPointerEvent } from 'pixi.js'
import type { NineSliceInsets, SpriteRow } from '../SpriteRow'

// ---------------------------------------------------------------------------
// Visual constants
// ---------------------------------------------------------------------------

/** Blue that matches the IMG inspector badge colour. */
const GUIDE_COLOR = 0x56b4e9
const LINE_ALPHA = 0.9
/** Width (px) of the invisible grab strip centred on each guide line. */
const HIT_STRIP = 14
const HANDLE_RADIUS = 4

// ---------------------------------------------------------------------------
// NineSliceGuide
// ---------------------------------------------------------------------------

/**
 * Draws four draggable guide lines on the PixiJS canvas that let the user
 * adjust the Left / Top / Right / Bottom insets of a NineSliceSprite by
 * dragging directly on the canvas instead of typing numbers.
 *
 * The guide container is inserted as a sibling of the sprite inside `world`,
 * just before the overlay so it stays on top of all sprite content.
 *
 * Each frame (Pixi ticker) the container is repositioned + rotated to match
 * the sprite, so the guides follow moves/rotations automatically.
 *
 * When the user is NOT dragging, the guide syncs its inset values from
 * `row.nineSliceInsets` so that changes typed in the inspector panel are
 * reflected instantly on the canvas.
 */
export class NineSliceGuide {
  private readonly container: Container
  private readonly linesGfx: Graphics
  private readonly hitLeft: Graphics
  private readonly hitRight: Graphics
  private readonly hitTop: Graphics
  private readonly hitBottom: Graphics

  readonly row: SpriteRow
  private _insets: NineSliceInsets
  private dragging: { side: keyof NineSliceInsets } | null = null

  private readonly app: Application
  private readonly onInsetChange: (newInsets: NineSliceInsets) => void
  private readonly onDragStart: () => void
  private readonly onDragEnd: () => void

  constructor(
    app: Application,
    world: Container,
    row: SpriteRow,
    insets: NineSliceInsets,
    onInsetChange: (newInsets: NineSliceInsets) => void,
    onDragStart: () => void,
    onDragEnd: () => void,
    /** Insert the container just before this object (keeps guide below overlay). */
    insertBefore?: Container | Graphics,
  ) {
    this.app = app
    this.row = row
    this._insets = { ...insets }
    this.onInsetChange = onInsetChange
    this.onDragStart = onDragStart
    this.onDragEnd = onDragEnd

    this.container = new Container()

    // Insert just before the overlay so guides render above sprites but
    // below the snap / selection overlay.
    const idx = insertBefore ? (world.children as Container[]).indexOf(insertBefore as Container) : -1
    if (idx >= 0) {
      world.addChildAt(this.container, idx)
    } else {
      world.addChild(this.container)
    }

    this.linesGfx = new Graphics()
    this.container.addChild(this.linesGfx)

    this.hitLeft   = this.makeHitStrip('left')
    this.hitRight  = this.makeHitStrip('right')
    this.hitTop    = this.makeHitStrip('top')
    this.hitBottom = this.makeHitStrip('bottom')

    window.addEventListener('pointermove',   this.onWinMove)
    window.addEventListener('pointerup',     this.onWinUp)
    window.addEventListener('pointercancel', this.onWinUp)

    app.ticker.add(this.tick)
    this.tick() // draw immediately so there's no 1-frame gap
  }

  // ── private helpers ────────────────────────────────────────────────────────

  private makeHitStrip = (side: keyof NineSliceInsets): Graphics => {
    const g = new Graphics()
    g.eventMode = 'static'
    g.cursor = side === 'left' || side === 'right' ? 'ew-resize' : 'ns-resize'
    g.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation()
      this.dragging = { side }
      this.onDragStart()
    })
    this.container.addChild(g)
    return g
  }

  private onWinMove = (e: PointerEvent): void => {
    if (!this.dragging) return

    const gp = new Point()
    this.app.renderer.events.mapPositionToPoint(gp, e.clientX, e.clientY)
    const local = this.container.toLocal(gp)

    const s = this.row.sprite
    const w = s.width
    const h = s.height
    const { side } = this.dragging
    const ins = this._insets

    let v: number
    if (side === 'left') {
      v = Math.round(local.x + w / 2)
      v = Math.max(0, Math.min(w - ins.right - 2, v))
    } else if (side === 'right') {
      v = Math.round(w / 2 - local.x)
      v = Math.max(0, Math.min(w - ins.left - 2, v))
    } else if (side === 'top') {
      v = Math.round(local.y + h / 2)
      v = Math.max(0, Math.min(h - ins.bottom - 2, v))
    } else {
      v = Math.round(h / 2 - local.y)
      v = Math.max(0, Math.min(h - ins.top - 2, v))
    }

    if (v !== ins[side]) {
      this._insets = { ...ins, [side]: v }
      this.onInsetChange(this._insets)
    }
  }

  private onWinUp = (): void => {
    if (!this.dragging) return
    this.dragging = null
    this.onDragEnd()
  }

  // ── tick (runs every Pixi frame) ───────────────────────────────────────────

  private tick = (): void => {
    const s = this.row.sprite
    if (!s || s.destroyed) { this.destroy(); return }

    // Sync container transform to the sprite every frame.
    this.container.position.copyFrom(s.position)
    this.container.rotation = s.rotation

    // While not dragging, pull insets from the row so that inspector changes
    // (typed values) are reflected immediately in the guide lines.
    if (!this.dragging) {
      this._insets = { ...this.row.nineSliceInsets }
    }

    this.draw()
  }

  // ── draw ───────────────────────────────────────────────────────────────────

  private draw(): void {
    const s  = this.row.sprite
    const w  = s.width
    const h  = s.height
    const L  = -w / 2
    const T  = -h / 2
    const R  = w / 2
    const B  = h / 2
    const ins = this._insets

    const lx  = L + ins.left
    const rx  = R - ins.right
    const ty  = T + ins.top
    const by_ = B - ins.bottom   // 'by_' to avoid shadowing built-in 'by'

    const g = this.linesGfx
    g.clear()

    // Sprite outer bounds — very subtle white hairline
    g.rect(L, T, w, h).stroke({ color: 0xffffff, alpha: 0.12, width: 1 })

    // Four inset guide lines
    const ls = { color: GUIDE_COLOR, alpha: LINE_ALPHA, width: 1 }
    g.moveTo(lx,  T ).lineTo(lx, B ).stroke(ls)  // left
    g.moveTo(rx,  T ).lineTo(rx, B ).stroke(ls)  // right
    g.moveTo(L,  ty ).lineTo(R, ty ).stroke(ls)  // top
    g.moveTo(L, by_).lineTo(R, by_).stroke(ls)  // bottom

    // Drag handle dots (dark ring + coloured fill)
    const mx = (L + R) / 2
    const my = (T + B) / 2
    const dot = (x: number, y: number) => {
      g.circle(x, y, HANDLE_RADIUS + 1.5).fill({ color: 0x0d1117, alpha: 0.85 })
      g.circle(x, y, HANDLE_RADIUS      ).fill({ color: GUIDE_COLOR, alpha: 1 })
    }
    dot(lx,  my )  // left
    dot(rx,  my )  // right
    dot(mx,  ty )  // top
    dot(mx, by_)   // bottom

    // Update transparent hit strips
    const hw = HIT_STRIP / 2
    this.hitLeft  .clear().rect(lx  - hw, T, HIT_STRIP, h ).fill({ color: 0, alpha: 0 })
    this.hitRight .clear().rect(rx  - hw, T, HIT_STRIP, h ).fill({ color: 0, alpha: 0 })
    this.hitTop   .clear().rect(L, ty  - hw, w, HIT_STRIP ).fill({ color: 0, alpha: 0 })
    this.hitBottom.clear().rect(L, by_ - hw, w, HIT_STRIP ).fill({ color: 0, alpha: 0 })
  }

  // ── public API ─────────────────────────────────────────────────────────────

  /** Call when the guide should be removed (sprite deselected / 9-slice turned off). */
  destroy(): void {
    window.removeEventListener('pointermove',   this.onWinMove)
    window.removeEventListener('pointerup',     this.onWinUp)
    window.removeEventListener('pointercancel', this.onWinUp)
    this.app.ticker.remove(this.tick)
    if (this.container.parent) this.container.parent.removeChild(this.container)
    this.container.destroy({ children: true })
  }
}
