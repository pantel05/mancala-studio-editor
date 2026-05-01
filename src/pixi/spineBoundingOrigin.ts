import type { Bone } from '@esotericsoftware/spine-core'
import type { Spine } from '@esotericsoftware/spine-pixi-v8'
import { Point } from 'pixi.js'

/** Prefer explicit Spine root name; otherwise first bone (Spine convention). */
function getRootBone(spine: Spine): Bone | null {
  const sk = spine.skeleton
  const named = sk.findBone('root')
  if (named) return named
  return sk.bones.length > 0 ? sk.bones[0] : null
}

/**
 * Places the Spine display pivot at the **root bone** (Spine skeleton origin for placement),
 * with position compensation so the rig does not jump. Matches Spine editor/runtime convention:
 * root bone lives at skeleton (0,0); the Pixi node `(x, y)` then tracks that root in world space.
 *
 * Call after `scale` is set and `update(0)` is meaningful.
 */
export function applySpineOriginAtRootBone(spine: Spine): void {
  spine.update(0)
  const root = getRootBone(spine)
  if (!root) return

  const globalBone = new Point(root.worldX, root.worldY)
  spine.skeletonToPixiWorldCoordinates(globalBone)

  const localRoot = new Point()
  spine.toLocal(globalBone, undefined, localRoot)
  if (!Number.isFinite(localRoot.x) || !Number.isFinite(localRoot.y)) return

  spine.pivot.set(localRoot.x, localRoot.y)
  const sx = spine.scale.x
  const sy = spine.scale.y
  spine.position.x += localRoot.x * sx
  spine.position.y += localRoot.y * sy
}
