import type { NineSliceSprite, Sprite } from 'pixi.js'

/** Inset distances (in source texture pixels) for 9-slice scaling. */
export type NineSliceInsets = {
  left: number
  top: number
  right: number
  bottom: number
}

/** A static image object in the scene (PNG / WebP / JPG). */
export type SpriteRow = {
  id: string
  /** Discriminant so hierarchy / inspector can tell spine from sprite. */
  kind: 'sprite'
  displayName: string
  /** Original image File — kept so it can be saved into the project archive. */
  sourceFile: File
  /** `URL.createObjectURL(sourceFile)` — used as the Pixi texture source. */
  objectUrl: string
  /**
   * The live Pixi display object on the canvas.
   * Regular `Sprite` when nineSlice is false; `NineSliceSprite` when true.
   */
  sprite: Sprite | NineSliceSprite
  /** When true, canvas drag is disabled. */
  locked: boolean
  /** When false, the sprite is hidden on the canvas. */
  layerVisible: boolean
  /** Whether 9-slice scaling is active for this sprite. */
  nineSlice: boolean
  /** Inset values used when nineSlice is true. */
  nineSliceInsets: NineSliceInsets
}
