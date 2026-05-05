import type { PlaceholderLayoutKey } from '../spine/placeholderLayoutResolution'

/** Shared visibility fields for spine and sprite rows. */
export type LayerVisibilityState = {
  layerVisible: boolean
  layoutPtLayerVisible?: boolean
  layoutLsLayerVisible?: boolean
  layoutTbLayerVisible?: boolean
}

/**
 * Whether the object is shown on the canvas for the active layout.
 * Main always shows every object; other layouts use per-tab overrides, else {@link LayerVisibilityState.layerVisible}.
 */
export function effectiveLayerVisible(row: LayerVisibilityState, layout: PlaceholderLayoutKey): boolean {
  if (layout === 'main') return true
  if (layout === 'pt') {
    return row.layoutPtLayerVisible !== undefined ? row.layoutPtLayerVisible : row.layerVisible
  }
  if (layout === 'ls') {
    return row.layoutLsLayerVisible !== undefined ? row.layoutLsLayerVisible : row.layerVisible
  }
  return row.layoutTbLayerVisible !== undefined ? row.layoutTbLayerVisible : row.layerVisible
}
