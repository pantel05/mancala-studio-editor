import type { Graphics } from 'pixi.js'

/** Reference phone aspect (logical W:H), not a specific device model. */
const PHONE_PORTRAIT_WH = 9 / 19.5
const PHONE_LANDSCAPE_WH = 19.5 / 9

export type SafeFramePreset = 'off' | 'phone-portrait' | 'phone-landscape'

export function aspectForPreset(preset: SafeFramePreset): number | null {
  if (preset === 'off') return null
  return preset === 'phone-portrait' ? PHONE_PORTRAIT_WH : PHONE_LANDSCAPE_WH
}

export type SafeFrameRect = { x: number; y: number; w: number; h: number }

export type SafeFramePair = { device: SafeFrameRect; safe: SafeFrameRect }

/** Largest axis-aligned rect with given aspect ratio, centered in the screen (letterbox / pillarbox). */
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

export function computeSafeFramePair(
  screenW: number,
  screenH: number,
  preset: SafeFramePreset,
  /** Inset toward safe area, as percent of min(device w, h). Default 5. */
  insetPercent: number,
): SafeFramePair | null {
  const ar = aspectForPreset(preset)
  if (ar == null || screenW <= 0 || screenH <= 0) return null
  const device = letterboxedDeviceRect(screenW, screenH, ar)
  const safe = insetRectByPercent(device, insetPercent)
  return { device, safe }
}

const dimFill = { color: 0x000000, alpha: 0.38 } as const
const deviceStroke = { width: 1, color: 0xffffff, alpha: 0.75 } as const
const safeStroke = { width: 1, color: 0xf5d547, alpha: 0.9 } as const

/** Screen-space overlay: dim outside device, stroke device and safe rects. */
export function paintSafeFrameOverlay(
  g: Graphics,
  screenW: number,
  screenH: number,
  preset: SafeFramePreset,
  insetPercent = 5,
): void {
  g.clear()
  if (preset === 'off') return
  const pair = computeSafeFramePair(screenW, screenH, preset, insetPercent)
  if (!pair) return
  const { device: d, safe: s } = pair

  if (d.y > 0) g.rect(0, 0, screenW, d.y).fill(dimFill)
  if (d.y + d.h < screenH) {
    g.rect(0, d.y + d.h, screenW, screenH - d.y - d.h).fill(dimFill)
  }
  if (d.x > 0) g.rect(0, d.y, d.x, d.h).fill(dimFill)
  if (d.x + d.w < screenW) {
    g.rect(d.x + d.w, d.y, screenW - d.x - d.w, d.h).fill(dimFill)
  }

  g.rect(d.x, d.y, d.w, d.h).stroke(deviceStroke)
  if (s.w > 2 && s.h > 2) {
    g.rect(s.x, s.y, s.w, s.h).stroke(safeStroke)
  }
}
