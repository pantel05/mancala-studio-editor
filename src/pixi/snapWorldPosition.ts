/** World placement grid in scene units (Inspector / cursor readout use one decimal). */
export const WORLD_POSITION_SNAP = 0.5

export function snapWorldScalar(v: number): number {
  return Math.round(v / WORLD_POSITION_SNAP) * WORLD_POSITION_SNAP
}

export function snapWorldXY(x: number, y: number): { x: number; y: number } {
  return { x: snapWorldScalar(x), y: snapWorldScalar(y) }
}
