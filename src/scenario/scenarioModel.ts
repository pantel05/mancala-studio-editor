import type { SpineControlRow } from '../SpineInstanceControls'
import { pickIdleAnimationName } from '../spine/pickIdleAnimation'
import type { ScenarioClip, ScenarioTrack } from './scenarioTypes'
import { newScenarioClipId } from './scenarioTypes'

/** Latest clip end, or `emptyFallback` when there are no clips. */
export function computeScenarioDurationSec(tracks: ScenarioTrack[], emptyFallback = 0.25): number {
  let maxEnd = 0
  for (const tr of tracks) {
    for (const c of tr.clips) {
      if (c.end > maxEnd) maxEnd = c.end
    }
  }
  return maxEnd > 0 ? maxEnd : emptyFallback
}

export function findClipAtTime(clips: ScenarioClip[], t: number): ScenarioClip | undefined {
  for (const c of clips) {
    if (t >= c.start && t < c.end) return c
  }
  // Keep the final pose visible at/after composition end instead of hiding on the exact last frame.
  let tail: ScenarioClip | undefined
  for (const c of clips) {
    if (!tail || c.end > tail.end) tail = c
  }
  if (tail && t >= tail.end) return tail
  return undefined
}

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

/** Returns an error message if any two clips on the track overlap; otherwise null. */
export function validateTrackNoOverlap(track: ScenarioTrack): string | null {
  const sorted = [...track.clips].sort((x, y) => x.start - y.start)
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!
    const cur = sorted[i]!
    if (intervalsOverlap(prev.start, prev.end, cur.start, cur.end)) {
      return `Overlapping clips on row (${prev.animName} vs ${cur.animName})`
    }
  }
  return null
}

/** Rebuild track list order to match spine ids in layer order (top of list = front). */
/**
 * Pinned child row ids that should float at world root for this frame: host is in a scenario gap
 * but the child still has an active clip (so the child is shown without forcing the host visible).
 */
export function computeScenarioSoloPinnedChildIds(
  spineRows: SpineControlRow[],
  scenarioGapHiddenIds: Set<string>,
): Set<string> {
  const want = new Set<string>()
  for (const row of spineRows) {
    if (!row.pinnedUnder) continue
    const hostId = row.pinnedUnder.hostRowId
    if (!scenarioGapHiddenIds.has(hostId)) continue
    if (scenarioGapHiddenIds.has(row.id)) continue
    want.add(row.id)
  }
  return want
}

export function orderTracksLikeLayerOrder(
  tracks: ScenarioTrack[],
  layerOrder: string[],
  spineRowIds: Set<string>,
): ScenarioTrack[] {
  const byId = new Map(tracks.map((t) => [t.spineRowId, t]))
  const next: ScenarioTrack[] = []
  for (const id of layerOrder) {
    if (!spineRowIds.has(id)) continue
    const tr = byId.get(id)
    if (tr) next.push(tr)
  }
  for (const tr of tracks) {
    if (!spineRowIds.has(tr.spineRowId)) continue
    if (!next.some((x) => x.spineRowId === tr.spineRowId)) next.push(tr)
  }
  return next
}

function animationNames(row: SpineControlRow): string[] {
  const list = row.spine.skeleton.data.animations as { name: string }[]
  return list.map((a) => a.name)
}

function animationDuration(row: SpineControlRow, animName: string): number {
  const list = row.spine.skeleton.data.animations as { name: string; duration: number }[]
  const a = list.find((x) => x.name === animName)
  return a && a.duration > 0 ? a.duration : 1
}

/**
 * Initial tracks: same order as layerOrder (spines only). One clip [0, duration] using the current
 * track-0 animation when possible, else idle / first animation.
 */
export function seedScenarioTracksFromScene(
  layerOrder: string[],
  spineRows: SpineControlRow[],
): ScenarioTrack[] {
  const namesById = new Map<string, string[]>()
  for (const r of spineRows) {
    namesById.set(r.id, animationNames(r))
  }

  const tracks: ScenarioTrack[] = []
  for (const id of layerOrder) {
    const row = spineRows.find((r) => r.id === id)
    if (!row) continue
    const names = namesById.get(id) ?? []
    const fromTrack = row.spine.state.tracks[0]?.animation?.name
    const animName =
      fromTrack && names.includes(fromTrack)
        ? fromTrack
        : pickIdleAnimationName(names) ?? names[0] ?? ''
    if (!animName) {
      tracks.push({ spineRowId: id, clips: [] })
      continue
    }
    const end = Math.max(0.05, animationDuration(row, animName))
    tracks.push({
      spineRowId: id,
      clips: [
        {
          id: newScenarioClipId(),
          animName,
          start: 0,
          end,
        },
      ],
    })
  }
  return tracks
}
