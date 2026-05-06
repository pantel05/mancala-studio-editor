/**
 * Scenario / composition timeline: one row per Spine instance, clips = animation segments on a global clock.
 * v1: no overlap on a single row; gaps hide the skeleton for that interval.
 */

export type ScenarioClip = {
  id: string
  animName: string
  /** Composition time (seconds), inclusive start. */
  start: number
  /** Composition time (seconds), exclusive end. */
  end: number
}

export type ScenarioTrack = {
  spineRowId: string
  clips: ScenarioClip[]
}

/** Named cue on the composition timeline (jump-to for review). */
export type ScenarioMarker = {
  id: string
  /** Composition time (seconds). */
  timeSec: number
  label: string
}

export function newScenarioClipId(): string {
  return `sc-${Math.random().toString(36).slice(2, 11)}`
}

export function newScenarioMarkerId(): string {
  return `sm-${Math.random().toString(36).slice(2, 11)}`
}
