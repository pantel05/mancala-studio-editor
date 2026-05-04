import type { Container, Graphics } from 'pixi.js'
import { visibleWorldBounds } from './worldGrid'

/**
 * Layout authoring frames: **world scene units** (Spine placement / grid), **1440p / QHD**–class
 * sizes where applicable (see {@link WORLD_QHD_LANDSCAPE_WH}, {@link WORLD_QHD_PORTRAIT_WH}).
 */

/** v2 layout authoring targets (MVP_SCOPE): portrait 9:16, landscape 16:9; tablet ratio still product-TBD — use 4:3 here. */
export type LayoutAuthoringTarget = 'pt' | 'ls' | 'tb'

export function aspectForLayoutAuthoringTarget(target: LayoutAuthoringTarget): number {
  switch (target) {
    case 'pt':
      return 9 / 16
    case 'ls':
      return 16 / 9
    case 'tb':
      return 4 / 3
  }
}

/** Stored on `project.json` for compatibility; the editor no longer exposes a separate safe-frame UI. */
export type SafeFramePreset = 'off' | 'phone-portrait' | 'phone-landscape'

export type SafeFrameRect = { x: number; y: number; w: number; h: number }

export type SafeFramePair = { device: SafeFrameRect; safe: SafeFrameRect }

/**
 * Largest axis-aligned rect with given aspect ratio, centered in the screen (letterbox / pillarbox).
 * Kept for callers that need screen-space layout; the editor draws frames in **world** space instead.
 */
export function letterboxedDeviceRect(
  screenW: number,
  screenH: number,
  deviceWidthOverHeight: number,
): SafeFrameRect {
  const screenAr = screenW / screenH
  let w: number
  let h: number
  if (screenAr > deviceWidthOverHeight) {
    h = screenH
    w = h * deviceWidthOverHeight
  } else {
    w = screenW
    h = w / deviceWidthOverHeight
  }
  const x = (screenW - w) / 2
  const y = (screenH - h) / 2
  return { x, y, w, h }
}

/** Inset on each side: `insetPercent`% of min(device w, h). */
export function insetRectByPercent(rect: SafeFrameRect, insetPercent: number): SafeFrameRect {
  const m = (insetPercent / 100) * Math.min(rect.w, rect.h)
  return {
    x: rect.x + m,
    y: rect.y + m,
    w: Math.max(0, rect.w - 2 * m),
    h: Math.max(0, rect.h - 2 * m),
  }
}

/** QHD / “1440p” landscape **2560×1440** in world units (16:9). */
export const WORLD_QHD_LANDSCAPE_WH = { w: 2560, h: 1440 } as const

/** QHD portrait **1440×2560** in world units (9:16). */
export const WORLD_QHD_PORTRAIT_WH = { w: 1440, h: 2560 } as const

/**
 * Tablet **4:3** in world units (**2560×1920**), same horizontal span as QHD landscape for a consistent scale ladder.
 */
export const WORLD_TABLET_4_3_WH = { w: 2560, h: 1920 } as const

function worldDeviceDimensionsForAspect(aspectWidthOverHeight: number): { w: number; h: number } {
  if (aspectWidthOverHeight < 1) {
    return { w: WORLD_QHD_PORTRAIT_WH.w, h: WORLD_QHD_PORTRAIT_WH.h }
  }
  const d169 = Math.abs(aspectWidthOverHeight - 16 / 9)
  const d43 = Math.abs(aspectWidthOverHeight - 4 / 3)
  if (d43 < d169) {
    return { w: WORLD_TABLET_4_3_WH.w, h: WORLD_TABLET_4_3_WH.h }
  }
  return { w: WORLD_QHD_LANDSCAPE_WH.w, h: WORLD_QHD_LANDSCAPE_WH.h }
}

/**
 * Device + inner “safe” rect centered on world origin (0,0), **1440p-class** sizes where applicable.
 * Pan/zoom move content relative to this frame so you can verify fit at any magnification.
 */
export function computeWorldReferenceDevicePair(
  aspectWidthOverHeight: number,
  insetPercent: number,
): SafeFramePair {
  const { w, h } = worldDeviceDimensionsForAspect(aspectWidthOverHeight)
  const device: SafeFrameRect = { x: -w / 2, y: -h / 2, w, h }
  const safe = insetRectByPercent(device, insetPercent)
  return { device, safe }
}

export function computeWorldLayoutAuthoringPair(
  target: LayoutAuthoringTarget,
  insetPercent: number,
): SafeFramePair {
  const ar = aspectForLayoutAuthoringTarget(target)
  return computeWorldReferenceDevicePair(ar, insetPercent)
}

const dimFill = { color: 0x000000, alpha: 0.38 } as const
const deviceStroke = { width: 1, color: 0xffffff, alpha: 0.75 } as const
const safeStroke = { width: 1, color: 0xf5d547, alpha: 0.9 } as const

function paintWorldDimmedDevicePair(
  g: Graphics,
  vb: { minX: number; maxX: number; minY: number; maxY: number },
  pair: SafeFramePair,
): void {
  const { device: d, safe: s } = pair
  const ox0 = vb.minX
  const ox1 = vb.maxX
  const oy0 = vb.minY
  const oy1 = vb.maxY

  const topH = Math.max(0, Math.min(d.y, oy1) - oy0)
  if (topH > 0) g.rect(ox0, oy0, ox1 - ox0, topH).fill(dimFill)

  const botY0 = Math.max(d.y + d.h, oy0)
  const botH = Math.max(0, oy1 - botY0)
  if (botH > 0) g.rect(ox0, botY0, ox1 - ox0, botH).fill(dimFill)

  const midY0 = Math.max(oy0, d.y)
  const midY1 = Math.min(oy1, d.y + d.h)
  if (midY1 > midY0) {
    const leftW = Math.max(0, Math.min(d.x, ox1) - ox0)
    if (leftW > 0) g.rect(ox0, midY0, leftW, midY1 - midY0).fill(dimFill)

    const rightX0 = Math.max(d.x + d.w, ox0)
    const rightW = Math.max(0, ox1 - rightX0)
    if (rightW > 0) g.rect(rightX0, midY0, rightW, midY1 - midY0).fill(dimFill)
  }

  g.rect(d.x, d.y, d.w, d.h).stroke(deviceStroke)
  if (s.w > 2 && s.h > 2) {
    g.rect(s.x, s.y, s.w, s.h).stroke(safeStroke)
  }
}

/**
 * World-space overlay: dims outside the device rect (only within the currently visible world band),
 * strokes device + safe. Transforms with the same pan/zoom as the scene.
 */
export function paintWorldReferenceFrameOverlay(
  g: Graphics,
  world: Container,
  screenW: number,
  screenH: number,
  pair: SafeFramePair,
): void {
  g.clear()
  if (screenW <= 0 || screenH <= 0) return
  const vb = visibleWorldBounds(world, screenW, screenH)
  paintWorldDimmedDevicePair(g, vb, pair)
}
