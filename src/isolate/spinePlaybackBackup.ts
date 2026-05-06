import type { Spine } from '@esotericsoftware/spine-pixi-v8'

/** Serializable Spine playback state for restoring after isolate mode. */
export type SpinePlaybackBackup = {
  autoUpdate: boolean
  stateTimeScale: number
  track0Animation: string | null
  track0Loop: boolean
  track0TrackTime: number
}

export function captureSpinePlaybackBackup(spine: Spine): SpinePlaybackBackup {
  const cur = spine.state.getCurrent(0)
  return {
    autoUpdate: spine.autoUpdate,
    stateTimeScale: spine.state.timeScale,
    track0Animation: cur?.animation?.name ?? null,
    track0Loop: cur?.loop ?? false,
    track0TrackTime: cur?.trackTime ?? 0,
  }
}

export function restoreSpinePlaybackBackup(spine: Spine, b: SpinePlaybackBackup): void {
  spine.autoUpdate = b.autoUpdate
  spine.state.timeScale = b.stateTimeScale
  if (b.track0Animation) {
    const e = spine.state.setAnimation(0, b.track0Animation, b.track0Loop)
    e.trackTime = b.track0TrackTime
  } else {
    spine.state.clearTrack(0)
  }
  spine.update(0)
}
