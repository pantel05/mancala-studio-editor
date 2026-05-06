import { useEffect, useMemo, useState } from 'react'
import type { SpineControlRow } from '../SpineInstanceControls'
import { computeScenarioDurationSec } from './scenarioModel'
import type { ScenarioMarker, ScenarioTrack } from './scenarioTypes'
import { ScenarioClipTrackLanes } from './ScenarioClipTrackLanes'
import './scenario.css'

export type ScenarioTimelinePanelProps = {
  tracks: ScenarioTrack[]
  onTracksChange: (next: ScenarioTrack[] | ((prev: ScenarioTrack[]) => ScenarioTrack[])) => void
  spineRows: SpineControlRow[]
  scenarioLaneOrder: string[]
  moveScenarioLaneBeforeTarget: (sourceId: string, targetId: string) => void
  compositionTime: number
  onCompositionTimeChange: (t: number) => void
  onUserScrub: () => void
  transportPlaying: boolean
  onTransportPlayingChange: (v: boolean) => void
  loop: boolean
  onLoopChange: (v: boolean) => void
  fps: number
  onFpsChange: (v: number) => void
  scenarioActive: boolean
  markers: ScenarioMarker[]
  onAddMarker: (label: string, timeSec: number) => void
  onRemoveMarker: (id: string) => void
  onMarkerSeek: (timeSec: number) => void
  onBeginMarkerDragUndo: () => void
  onMarkerTimeChange: (id: string, timeSec: number) => void
}

export function ScenarioTimelinePanel({
  tracks,
  onTracksChange,
  spineRows,
  scenarioLaneOrder,
  moveScenarioLaneBeforeTarget,
  compositionTime,
  onCompositionTimeChange,
  onUserScrub,
  transportPlaying,
  onTransportPlayingChange,
  loop,
  onLoopChange,
  fps,
  onFpsChange,
  scenarioActive,
  markers,
  onAddMarker,
  onRemoveMarker,
  onMarkerSeek,
  onBeginMarkerDragUndo,
  onMarkerTimeChange,
}: ScenarioTimelinePanelProps) {
  const duration = useMemo(() => computeScenarioDurationSec(tracks, 0), [tracks])
  const displayDuration = duration > 0 ? duration : 0
  const frameLabel = useMemo(() => Math.floor(compositionTime * fps), [compositionTime, fps])

  const [showMarkerForm, setShowMarkerForm] = useState(false)
  const [markerLabelInput, setMarkerLabelInput] = useState('')

  useEffect(() => {
    if (!scenarioActive) {
      setShowMarkerForm(false)
      setMarkerLabelInput('')
    }
  }, [scenarioActive])

  const submitMarker = () => {
    const name = markerLabelInput.trim()
    if (!name) return
    onAddMarker(name, compositionTime)
    setMarkerLabelInput('')
    setShowMarkerForm(false)
  }

  return (
    <div className="scenario-panel">
      <p className="scenario-panel-hint">
        Drag the <strong>blue playhead</strong> (triangle) or click the ruler to scrub. Clip blocks: drag to move;
        ▾ picks the animation. Composition length matches the last clip end. Row colors follow timeline lane order
        (↑↓ reorders lanes here only — hierarchy draw order is unchanged). <strong>Markers</strong> (named cues) live
        on the ruler — click to jump the playhead, drag horizontally to move the marker.
      </p>

      <div className="scenario-toolbar">
        <label>
          <input type="checkbox" checked={loop} onChange={(e) => onLoopChange(e.target.checked)} />
          Loop composition
        </label>
        <label>
          FPS (readout)
          <input
            type="number"
            className="editor-input"
            style={{ width: '4em' }}
            min={1}
            max={120}
            step={1}
            value={fps}
            onChange={(e) => onFpsChange(Math.max(1, Math.min(120, Number(e.target.value) || 30)))}
          />
        </label>
        <span className="scenario-frame-readout" aria-live="polite">
          Frame ~{frameLabel} · {compositionTime.toFixed(2)}s / {displayDuration.toFixed(2)}s
        </span>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            onTransportPlayingChange(!transportPlaying)
          }}
        >
          {transportPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={!scenarioActive}
          title={scenarioActive ? 'Add a named marker at the current playhead time' : 'Turn on Scenario mode first'}
          onClick={() => {
            setShowMarkerForm((v) => !v)
            setMarkerLabelInput('')
          }}
        >
          {showMarkerForm ? 'Cancel marker' : 'Add marker…'}
        </button>
        {showMarkerForm && scenarioActive ? (
          <div className="scenario-marker-form" role="group" aria-label="Add timeline marker at playhead">
            <input
              type="text"
              className="editor-input"
              placeholder="e.g. DWP presentation"
              value={markerLabelInput}
              style={{ minWidth: 200, maxWidth: '100%' }}
              onChange={(e) => setMarkerLabelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setShowMarkerForm(false)
                  setMarkerLabelInput('')
                }
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submitMarker()
                }
              }}
              autoFocus
            />
            <button type="button" className="btn btn-sm" onClick={submitMarker}>
              Add at {compositionTime.toFixed(2)}s
            </button>
          </div>
        ) : null}
      </div>

      <ScenarioClipTrackLanes
        tracks={tracks}
        onTracksChange={onTracksChange}
        spineRows={spineRows}
        laneOrder={scenarioLaneOrder}
        moveScenarioLaneBeforeTarget={moveScenarioLaneBeforeTarget}
        compositionTime={compositionTime}
        onCompositionTimeChange={onCompositionTimeChange}
        onUserScrub={onUserScrub}
        markers={markers}
        onMarkerSeek={onMarkerSeek}
        onRemoveMarker={onRemoveMarker}
        onBeginMarkerDragUndo={onBeginMarkerDragUndo}
        onMarkerTimeChange={onMarkerTimeChange}
      />
    </div>
  )
}
