import type { ScenarioClip } from './scenarioTypes'

const MIN_LEN = 0.05

/**
 * Move a clip to `desiredStart` (seconds), keeping its duration, and resolve overlaps on the same row
 * by sliding along the timeline (prefer preserving drag direction when ambiguous).
 */
export function setClipStartResolvingOverlap(
  clips: ScenarioClip[],
  clipId: string,
  desiredStart: number,
): ScenarioClip[] {
  const clip = clips.find((c) => c.id === clipId)
  if (!clip) return clips
  const duration = Math.max(MIN_LEN, clip.end - clip.start)
  let start = Math.max(0, desiredStart)
  let end = start + duration
  const rest = clips.filter((c) => c.id !== clipId)

  for (let guard = 0; guard < 64; guard++) {
    const overlapping = rest.find((o) => start < o.end && end > o.start)
    if (!overlapping) break
    const mid = (start + end) / 2
    const midO = (overlapping.start + overlapping.end) / 2
    if (mid >= midO) {
      start = overlapping.end
      end = start + duration
    } else {
      start = overlapping.start - duration
      if (start < 0) {
        start = 0
        end = duration
      } else {
        end = start + duration
      }
    }
  }

  return clips.map((c) => (c.id === clipId ? { ...c, start, end } : c))
}
