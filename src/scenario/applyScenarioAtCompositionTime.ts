import type { Spine } from '@esotericsoftware/spine-pixi-v8'
import type { SpineControlRow } from '../SpineInstanceControls'
import { applySpineClipAtTimeZero } from '../isolate/isolateSpineAnimationReset'
import { findClipAtTime } from './scenarioModel'
import type { ScenarioTrack } from './scenarioTypes'

function isRowPlaybackFrozen(row: SpineControlRow): boolean {
  return row.placeholderPolicyFrozen && !row.placeholderPolicyIgnored
}

/**
 * Applies scenario poses at composition time `t`. Updates `scenarioGapHiddenIds` for gaps.
 * Does not set {@link Spine#visible} — the host syncs visibility with layout + this set.
 *
 * Always keeps {@link Spine#autoUpdate} **false**: the composition clock is the only time source.
 * If `autoUpdate` were true while we set `trackTime` each frame, Spine would also advance the track
 * internally and the two would fight (visible flicker / stutter during Play).
 */
export function applyScenarioAtCompositionTime(
  tracks: ScenarioTrack[],
  spineRows: SpineControlRow[],
  t: number,
  scenarioGapHiddenIds: Set<string>,
): void {
  scenarioGapHiddenIds.clear()
  const rowById = new Map(spineRows.map((r) => [r.id, r]))

  // Scenario is the only time source — never leave stragglers on Spine's internal ticker (e.g. rows
  // not listed on tracks yet, or placeholder-frozen rows that skip the loop below).
  for (const row of spineRows) {
    if (!row.spine.destroyed) row.spine.autoUpdate = false
  }

  for (const tr of tracks) {
    const row = rowById.get(tr.spineRowId)
    if (!row || row.spine.destroyed) continue
    if (isRowPlaybackFrozen(row)) continue

    const clip = findClipAtTime(tr.clips, t)
    if (!clip) {
      scenarioGapHiddenIds.add(tr.spineRowId)
      row.spine.autoUpdate = false
      continue
    }

    applyClipPose(row.spine, clip.animName, Math.max(0, t - clip.start))
  }
}

function applyClipPose(spine: Spine, animName: string, trackTime: number): void {
  if (spine.destroyed) return
  const te0 = spine.state.tracks[0]
  const same = te0?.animation?.name === animName
  if (!same) {
    applySpineClipAtTimeZero(spine, animName, 1)
  }
  const te = spine.state.tracks[0]
  if (te) {
    te.trackTime = trackTime
    te.loop = false
  }
  spine.state.timeScale = 1
  spine.autoUpdate = false
  spine.update(0)
}
