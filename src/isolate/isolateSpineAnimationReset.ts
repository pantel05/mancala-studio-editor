import type { Spine } from '@esotericsoftware/spine-pixi-v8'

/**
 * Full return to the skeleton’s setup/bind pose for the current skin:
 * clears animation tracks, resets {@link AnimationState#unkeyedState} (do not assign
 * {@link Slot#attachmentState} by hand — it must stay consistent with `unkeyedState` for
 * {@link AnimationState#apply}’s setup-attachment repair pass), clears slot deform so meshes
 * do not keep stale vertices, then {@link Skeleton#setToSetupPose} and one Pixi Spine update.
 */
export function resetSpineToSetupPoseAndClearTracks(spine: Spine): void {
  if (spine.destroyed) return
  spine.state.clearTracks()
  spine.state.unkeyedState = 0
  const sk = spine.skeleton
  for (let i = 0; i < sk.slots.length; i++) {
    sk.slots[i]!.deform.length = 0
  }
  sk.setToSetupPose()
  spine.update(0)
}

/**
 * Pose track 0 to the first instant of `animName` (no mix). Call after
 * {@link resetSpineToSetupPoseAndClearTracks} so the clip applies on a clean skeleton.
 */
export function applySpineClipAtTimeZero(spine: Spine, animName: string, timeScale = 1): void {
  if (spine.destroyed) return
  spine.state.timeScale = timeScale
  const entry = spine.state.setAnimation(0, animName, false)
  if (entry) {
    entry.mixDuration = 0
    entry.trackTime = 0
  }
  spine.update(0)
}
