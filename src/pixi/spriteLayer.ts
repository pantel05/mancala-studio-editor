import { Assets, Sprite, Texture, type Application, type Container, type FederatedPointerEvent } from 'pixi.js'
import { Point } from 'pixi.js'
import { snapWorldScalar } from './snapWorldPosition'

// ---------------------------------------------------------------------------
// Drag
// ---------------------------------------------------------------------------

const dragCleanups = new WeakMap<Sprite, () => void>()

export type AttachSpriteDragOptions = {
  onLeftPointerDown?: () => void
  isDragEnabled?: () => boolean
  onDragStart?: (clientX: number, clientY: number) => void
  onDragEnd?: () => void
}

export function attachSpriteDrag(
  sprite: Sprite,
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

export function detachSpriteDrag(sprite: Sprite): void {
  const fn = dragCleanups.get(sprite)
  if (fn) {
    fn()
    dragCleanups.delete(sprite)
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Load an image from an object URL and return a Pixi Sprite.
 * The sprite's anchor is set to (0.5, 0.5) so position matches world-space centre,
 * consistent with Spine's placement origin convention.
 */
export async function createPixiSprite(objectUrl: string): Promise<Sprite> {
  const texture = await Assets.load<Texture>(objectUrl)
  const sprite = new Sprite(texture)
  sprite.anchor.set(0.5, 0.5)
  return sprite
}

/** Add a sprite to the world container and enable rendering. */
export function addSpriteToWorld(world: Container, sprite: Sprite): void {
  world.addChild(sprite)
}

/** Remove a sprite from its parent and free its texture + object URL. */
export function destroyPixiSprite(sprite: Sprite, objectUrl?: string): void {
  detachSpriteDrag(sprite)
  sprite.parent?.removeChild(sprite)
  sprite.destroy({ texture: true, textureSource: false })
  if (objectUrl) {
    try { URL.revokeObjectURL(objectUrl) } catch { /* ignore */ }
  }
  if (objectUrl) {
    Assets.unload(objectUrl).catch(() => { /* ignore */ })
  }
}

/** Image file extensions we treat as sprite assets (not Spine textures). */
export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'])

export function isImageFile(file: File): boolean {
  const lower = file.name.toLowerCase()
  return [...IMAGE_EXTENSIONS].some((ext) => lower.endsWith(ext))
}
