import { NineSliceSprite, Sprite, Texture, type Application, type Container, type FederatedPointerEvent } from 'pixi.js'
import { Point } from 'pixi.js'
import type { NineSliceInsets, SpriteRow } from '../SpriteRow'
import { snapWorldScalar } from './snapWorldPosition'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Both Sprite and NineSliceSprite share the same positional / visual API. */
export type AnySprite = Sprite | NineSliceSprite

// ---------------------------------------------------------------------------
// Drag
// ---------------------------------------------------------------------------

const dragCleanups = new WeakMap<AnySprite, () => void>()

export type AttachSpriteDragOptions = {
  onLeftPointerDown?: () => void
  isDragEnabled?: () => boolean
  onDragStart?: (clientX: number, clientY: number) => void
  onDragEnd?: () => void
}

export function attachSpriteDrag(
  sprite: AnySprite,
  app: Application,
  world: Container,
  opts?: AttachSpriteDragOptions,
): void {
  detachSpriteDrag(sprite)

  sprite.eventMode = 'dynamic'
  sprite.cursor = 'grab'

  let dragging = false
  const lastLocal = new Point()

  const onWinMove = (e: PointerEvent) => {
    if (!dragging) return
    const g = new Point()
    app.renderer.events.mapPositionToPoint(g, e.clientX, e.clientY)
    const cur = world.toLocal(g)
    sprite.position.x += cur.x - lastLocal.x
    sprite.position.y += cur.y - lastLocal.y
    sprite.position.x = snapWorldScalar(sprite.position.x)
    sprite.position.y = snapWorldScalar(sprite.position.y)
    lastLocal.copyFrom(cur)
  }

  const onWinUp = () => {
    if (!dragging) return
    dragging = false
    const canDrag = opts?.isDragEnabled ? opts.isDragEnabled() : true
    sprite.cursor = canDrag ? 'grab' : 'default'
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
    sprite.cursor = 'grabbing'
    lastLocal.copyFrom(e.getLocalPosition(world))
    window.addEventListener('pointermove', onWinMove)
    window.addEventListener('pointerup', onWinUp)
    window.addEventListener('pointercancel', onWinUp)
  }

  sprite.on('pointerdown', onDown)

  const cleanup = () => {
    sprite.off('pointerdown', onDown)
    window.removeEventListener('pointermove', onWinMove)
    window.removeEventListener('pointerup', onWinUp)
    window.removeEventListener('pointercancel', onWinUp)
    dragging = false
    sprite.cursor = 'auto'
    sprite.eventMode = 'auto'
  }

  dragCleanups.set(sprite, cleanup)
}

export function detachSpriteDrag(sprite: AnySprite): void {
  const fn = dragCleanups.get(sprite)
  if (fn) {
    fn()
    dragCleanups.delete(sprite)
  }
}

// ---------------------------------------------------------------------------
// Lifecycle — plain Sprite
// ---------------------------------------------------------------------------

/**
 * Load an image from an object URL and return a Pixi Sprite.
 * Uses a plain HTMLImageElement — PixiJS Assets.load cannot determine the
 * file type from blob:// URLs (no extension), so we bypass it entirely.
 * The anchor is set to (0.5, 0.5) so position matches world-space centre,
 * consistent with Spine's placement origin convention.
 */
export async function createPixiSprite(objectUrl: string): Promise<Sprite> {
  const img = new Image()
  img.src = objectUrl
  await new Promise<void>((resolve, reject) => {
    if (img.complete && img.naturalWidth > 0) { resolve(); return }
    img.addEventListener('load', () => resolve(), { once: true })
    img.addEventListener('error', () => reject(new Error('Failed to load sprite image')), { once: true })
  })
  const sprite = Sprite.from(img)
  sprite.anchor.set(0.5, 0.5)
  return sprite
}

/** Add a sprite to the world container and enable rendering. */
export function addSpriteToWorld(world: Container, sprite: AnySprite): void {
  world.addChild(sprite)
}

/** Remove a sprite from its parent and destroy it (does NOT revoke the object URL). */
function destroyAnySprite(sprite: AnySprite): void {
  detachSpriteDrag(sprite)
  sprite.parent?.removeChild(sprite)
  sprite.destroy({ texture: false, textureSource: false })
}

/** Remove a sprite from its parent, destroy it, and optionally revoke the object URL. */
export function destroyPixiSprite(sprite: AnySprite, objectUrl?: string): void {
  detachSpriteDrag(sprite)
  sprite.parent?.removeChild(sprite)
  sprite.destroy({ texture: true, textureSource: true })
  if (objectUrl) {
    try { URL.revokeObjectURL(objectUrl) } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// 9-slice conversion
// ---------------------------------------------------------------------------

/**
 * Default inset values for a texture: 1/4 of the shorter dimension, min 1.
 */
export function defaultNineSliceInsets(textureWidth: number, textureHeight: number): NineSliceInsets {
  const v = Math.max(1, Math.floor(Math.min(textureWidth, textureHeight) / 4))
  return { left: v, top: v, right: v, bottom: v }
}

/**
 * Replace the row's plain Sprite with a NineSliceSprite using the same texture.
 * Copies position, rotation, alpha, and visibility. Re-inserts at the same
 * z-index in the world container. Re-attaches drag with the same options.
 * Mutates `row.sprite` in place.
 */
export function convertToNineSlice(
  row: SpriteRow,
  world: Container,
  insets: NineSliceInsets,
  app?: Application,
  dragOpts?: AttachSpriteDragOptions,
): NineSliceSprite {
  const old = row.sprite
  const texture: Texture = old.texture as Texture

  const nss = new NineSliceSprite({
    texture,
    leftWidth:   insets.left,
    topHeight:   insets.top,
    rightWidth:  insets.right,
    bottomHeight: insets.bottom,
  })

  // Match rendered pixel size to current visual size
  nss.width  = old.width
  nss.height = old.height
  nss.position.copyFrom(old.position)
  nss.rotation = old.rotation
  nss.alpha = old.alpha
  nss.visible = old.visible
  // NineSliceSprite pivot at centre for consistent world-position behaviour
  nss.pivot.set(nss.width / 2, nss.height / 2)

  const zIndex = old.parent ? Array.from(old.parent.children).indexOf(old) : -1
  destroyAnySprite(old)

  if (zIndex >= 0 && zIndex < world.children.length) {
    world.addChildAt(nss, zIndex)
  } else {
    world.addChild(nss)
  }

  if (app && dragOpts) attachSpriteDrag(nss, app, world, dragOpts)
  row.sprite = nss
  return nss
}

/**
 * Replace the row's NineSliceSprite back to a plain Sprite.
 * Copies position, rotation, alpha, and visibility. Re-inserts at the same
 * z-index in the world container. Re-attaches drag with the same options.
 * Mutates `row.sprite` in place.
 */
export function convertToSprite(
  row: SpriteRow,
  world: Container,
  app?: Application,
  dragOpts?: AttachSpriteDragOptions,
): Sprite {
  const old = row.sprite
  const texture: Texture = old.texture as Texture

  const sprite = new Sprite(texture)
  sprite.anchor.set(0.5, 0.5)
  sprite.position.copyFrom(old.position)
  sprite.rotation = old.rotation
  sprite.alpha = old.alpha
  sprite.visible = old.visible
  // Restore scale so visual size matches the width/height of the nine-slice
  sprite.scale.set(1, 1)

  const zIndex = old.parent ? Array.from(old.parent.children).indexOf(old) : -1
  destroyAnySprite(old)

  if (zIndex >= 0 && zIndex < world.children.length) {
    world.addChildAt(sprite, zIndex)
  } else {
    world.addChild(sprite)
  }

  if (app && dragOpts) attachSpriteDrag(sprite, app, world, dragOpts)
  row.sprite = sprite
  return sprite
}

/**
 * Update a NineSliceSprite's insets in-place.
 * PixiJS v8 exposes `leftWidth`, `topHeight`, `rightWidth`, `bottomHeight`
 * as mutable properties — no recreation required.
 */
export function setNineSliceInsets(sprite: NineSliceSprite, insets: NineSliceInsets): void {
  sprite.leftWidth   = insets.left
  sprite.topHeight   = insets.top
  sprite.rightWidth  = insets.right
  sprite.bottomHeight = insets.bottom
}

/**
 * @deprecated Use `setNineSliceInsets` for in-place mutation (PixiJS v8).
 * Kept for backward compatibility — delegates to `convertToNineSlice`.
 */
export function rebuildNineSlice(
  row: SpriteRow,
  world: Container,
  insets: NineSliceInsets,
  app?: Application,
  dragOpts?: AttachSpriteDragOptions,
): NineSliceSprite {
  return convertToNineSlice(row, world, insets, app, dragOpts)
}

// ---------------------------------------------------------------------------
// File type helpers
// ---------------------------------------------------------------------------

/** Image file extensions we treat as sprite assets (not Spine textures). */
export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'])

export function isImageFile(file: File): boolean {
  const lower = file.name.toLowerCase()
  return [...IMAGE_EXTENSIONS].some((ext) => lower.endsWith(ext))
}
