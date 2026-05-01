import type { Sprite } from 'pixi.js'

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
  /** The live Pixi Sprite on the canvas. */
  sprite: Sprite
  /** When true, canvas drag is disabled. */
  locked: boolean
  /** When false, the sprite is hidden on the canvas. */
  layerVisible: boolean
}
