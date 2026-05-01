import type { Container, Graphics } from 'pixi.js'
import { Point } from 'pixi.js'
import type { Spine } from '@esotericsoftware/spine-pixi-v8'

/** Visible on dark backdrop + Solid mode (was easy to mistake for “no grid”). */
const gridMinor = { width: 1, color: 0x9aa8bd, alpha: 0.48 } as const
const axisXStroke = { width: 2, color: 0xd95454, alpha: 0.88 } as const
const axisYStroke = { width: 2, color: 0x4bbd6e, alpha: 0.88 } as const
const originFill = { color: 0xffffff, alpha: 0.92 } as const
const spineAnchorStroke = { width: 2, color: 0x4ec7ff, alpha: 0.82 } as const

/** ~target spacing between grid lines on screen (CSS pixels). */
const TARGET_GRID_PX = 72

export type WorldGridPaintOpts = {
  enabled: boolean
  /** Spine instance roots in **world** space (skeleton attachment point). */
  spineAnchors: { x: number; y: number }[]
}

function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 100
  const exp = Math.floor(Math.log10(raw))
  const base = 10 ** exp
  const m = raw / base
  const f = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10
  return f * base
}

/** Visible world-space axis-aligned bounds from screen corners (handles pan/zoom only). */
function visibleWorldBounds(
  world: Container,
  screenW: number,
  screenH: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const corners = [
    new Point(0, 0),
    new Point(screenW, 0),
    new Point(0, screenH),
    new Point(screenW, screenH),
  ]
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  const local = new Point()
  for (const c of corners) {
    world.toLocal(c, undefined, local)
    minX = Math.min(minX, local.x)
    maxX = Math.max(maxX, local.x)
    minY = Math.min(minY, local.y)
    maxY = Math.max(maxY, local.y)
  }

  const sx = Math.max(Math.abs(world.scale.x), 1e-6)
  const sy = Math.max(Math.abs(world.scale.y), 1e-6)
  const padX = (maxX - minX) * 0.06 + 40 / sx
  const padY = (maxY - minY) * 0.06 + 40 / sy
  return {
    minX: minX - padX,
    maxX: maxX + padX,
    minY: minY - padY,
    maxY: maxY + padY,
  }
}

/**
 * World-space grid and axes through (0,0): +X right, +Y down (Pixi / Spine runtime).
 * With the stage camera default, world (0,0) is drawn at the viewport center (see `PixiStage`).
 * Drawn under Spine instances; transforms with pan/zoom.
 */
export function paintWorldGrid(
  g: Graphics,
  world: Container,
  screenW: number,
  screenH: number,
  opts: WorldGridPaintOpts,
): void {
  g.clear()
  if (!opts.enabled || screenW <= 0 || screenH <= 0) return

  const { minX, maxX, minY, maxY } = visibleWorldBounds(world, screenW, screenH)
  const sx = Math.max(Math.abs(world.scale.x), 1e-6)
  const step = niceStep(TARGET_GRID_PX / sx)

  const eps = Math.max(step * 1e-6, 1e-4)
  const startX = Math.floor(minX / step) * step
  const endX = Math.ceil(maxX / step) * step
  const startY = Math.floor(minY / step) * step
  const endY = Math.ceil(maxY / step) * step

  for (let x = startX; x <= endX + eps; x += step) {
    if (Math.abs(x) < eps) continue
    g.moveTo(x, minY).lineTo(x, maxY).stroke(gridMinor)
  }
  for (let y = startY; y <= endY + eps; y += step) {
    if (Math.abs(y) < eps) continue
    g.moveTo(minX, y).lineTo(maxX, y).stroke(gridMinor)
  }

  if (minY <= 0 && maxY >= 0 && minX < maxX) {
    g.moveTo(minX, 0).lineTo(maxX, 0).stroke(axisXStroke)
  }
  if (minX <= 0 && maxX >= 0 && minY < maxY) {
    g.moveTo(0, minY).lineTo(0, maxY).stroke(axisYStroke)
  }

  const originR = Math.max(2.5 / sx, 1.5)
  g.circle(0, 0, originR).fill(originFill)

  const arm = Math.max(12 / sx, 5)
  for (const p of opts.spineAnchors) {
    g.moveTo(p.x - arm, p.y).lineTo(p.x + arm, p.y).stroke(spineAnchorStroke)
    g.moveTo(p.x, p.y - arm).lineTo(p.x, p.y + arm).stroke(spineAnchorStroke)
    const r = Math.max(3 / sx, 2)
    g.circle(p.x, p.y, r).stroke(spineAnchorStroke)
  }
}

/** Skeleton instance origin in world space (works when Spine is nested under placeholders). */
export function spineAnchorsInWorldSpace(world: Container, spines: Spine[]): { x: number; y: number }[] {
  const global = new Point()
  const local = new Point()
  const out: { x: number; y: number }[] = []
  for (const spine of spines) {
    if (spine.destroyed) continue   // skip spines mid-swap / partially destroyed
    try {
      spine.getGlobalPosition(global)
      world.toLocal(global, undefined, local)
      out.push({ x: local.x, y: local.y })
    } catch {
      // transform not ready yet (e.g. just added to scene, first tick not run)
    }
  }
  return out
}
