/** Current .mancala project file format version. Increment when breaking changes are made. */
export const PROJECT_FORMAT_VERSION = 1

export const MANCALA_FILE_EXT = '.mancala'
export const MANCALA_MIME = 'application/zip'

/** One spine object entry inside the project file. */
export type ProjectObject = {
  /** Stable ID used to resolve placeholder bindings within this file. */
  id: string
  displayName: string
  /** Filename of the skeleton (e.g. "hero.skel" or "hero.json"). Used to locate the asset in the ZIP. */
  skeletonFile: string
  /** Which atlas tag was active when saved ('' = default, '1x', '2x'). */
  activeAtlasTag: string
  /** World position of the placement anchor. */
  position: { x: number; y: number }
  /** Uniform scale applied to the skeleton. */
  scale: number
  /** Whether the layer is visible on the canvas. */
  layerVisible: boolean
  /** Whether the layer is locked (no drag). */
  locked: boolean
  /** Active animation name, or null if none. */
  animation: string | null
  /** Whether the animation loops. */
  loop: boolean
  /** Animation playback speed (timeScale). */
  speed: number
  /** Whether the animation was playing when saved. */
  playing: boolean
  /** Active skin name. */
  skin: string | null
  /** Placeholder binding map: boneName → target object id (within this project). */
  placeholderBindings: Record<string, string>
  /**
   * Bone-local offset when this object is nested under a placeholder.
   * null when not pinned.
   */
  boneOffset: { x: number; y: number } | null
  /** When nested: the host object id and bone name. */
  pinnedUnder: { hostId: string; boneName: string } | null
  /** User pressed Ignore on the frozen placeholder banner. */
  placeholderPolicyIgnored: boolean
}

/** One sprite (static image) object inside the project file. */
export type SpriteObject = {
  /** Stable ID used to resolve placeholder bindings within this file. */
  id: string
  displayName: string
  /** Filename of the source image (e.g. "background.png"). Used to locate the asset in the ZIP. */
  imageFile: string
  /** World position of the sprite centre. */
  position: { x: number; y: number }
  scaleX: number
  scaleY: number
  /** Rotation in radians. */
  rotation: number
  /** Alpha 0-1. */
  alpha: number
  layerVisible: boolean
  locked: boolean
  /** Whether 9-slice scaling is active. Absent in older files = false. */
  nineSlice?: boolean
  /** Inset distances (source texture pixels). Present only when nineSlice is true. */
  nineSliceInsets?: { left: number; top: number; right: number; bottom: number }
  /** Rendered width in world units when 9-slice is active. */
  nineSliceWidth?: number
  /** Rendered height in world units when 9-slice is active. */
  nineSliceHeight?: number
}

/** Viewport / scene-level settings stored in the project. */
export type ProjectViewport = {
  backdropMode: string
  safeFramePreset: string
}

/** Root structure of project.json inside the .mancala ZIP. */
export type MancalaProject = {
  version: typeof PROJECT_FORMAT_VERSION
  app: 'MANCALA GAMING STUDIO EDITOR'
  savedAt: string
  viewport: ProjectViewport
  /** Ordered array — first entry is drawn in front (top of hierarchy). */
  objects: ProjectObject[]
  /** Static image sprites in the scene. */
  sprites: SpriteObject[]
  /**
   * Unified front-to-back draw order: IDs from both `objects` and `sprites`.
   * First ID = drawn in front (top of hierarchy).
   * When absent (older files), falls back to the order of `objects`.
   */
  layerOrder: string[]
}
