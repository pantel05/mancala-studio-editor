import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SpineControlRow } from '../SpineInstanceControls'
import { ScenarioClipAnimMenu } from './ScenarioClipAnimMenu'
import { computeScenarioDurationSec, validateTrackNoOverlap } from './scenarioModel'
import { setClipStartResolvingOverlap } from './scenarioClipDrag'
import { getScenarioClipBlockStyle, getScenarioLaneLabelStyle, getScenarioLaneTrackStyle } from './scenarioTrackColors'
import type { ScenarioClip, ScenarioMarker, ScenarioTrack } from './scenarioTypes'
import { newScenarioClipId } from './scenarioTypes'

const PX_PER_SEC = 72
const ROW_H = 44
const LABEL_W = 140

export type ScenarioClipTrackLanesProps = {
  tracks: ScenarioTrack[]
  onTracksChange: (next: ScenarioTrack[] | ((prev: ScenarioTrack[]) => ScenarioTrack[])) => void
  spineRows: SpineControlRow[]
  /** Scenario timeline lane order only — does not affect hierarchy / canvas draw order. */
  laneOrder: string[]
  moveScenarioLaneBeforeTarget: (sourceId: string, targetId: string) => void
  compositionTime: number
  onCompositionTimeChange: (t: number) => void
  onUserScrub: () => void
  markers: ScenarioMarker[]
  onMarkerSeek: (timeSec: number) => void
  onRemoveMarker: (id: string) => void
  onBeginMarkerDragUndo: () => void
  onMarkerTimeChange: (id: string, timeSec: number) => void
}

function animationDuration(row: SpineControlRow, animName: string): number {
  const list = row.spine.skeleton.data.animations as { name: string; duration: number }[]
  const a = list.find((x) => x.name === animName)
  return a && a.duration > 0 ? a.duration : 1
}

function rowById(rows: SpineControlRow[], id: string): SpineControlRow | undefined {
  return rows.find((r) => r.id === id)
}

export function ScenarioClipTrackLanes({
  tracks,
  onTracksChange,
  spineRows,
  laneOrder,
  moveScenarioLaneBeforeTarget,
  compositionTime,
  onCompositionTimeChange,
  onUserScrub,
  markers,
  onMarkerSeek,
  onRemoveMarker,
  onBeginMarkerDragUndo,
  onMarkerTimeChange,
}: ScenarioClipTrackLanesProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [playheadDragging, setPlayheadDragging] = useState(false)
  /** Horizontal scroll of the lane grid — keeps the playhead overlay aligned with content. */
  const [laneScrollLeft, setLaneScrollLeft] = useState(0)

  /** Composition length = latest clip end (no extra tail past last block). */
  const duration = useMemo(() => Math.max(computeScenarioDurationSec(tracks, 0), 0), [tracks])
  const timelineEnd = Math.max(duration, 0.25)
  const contentWidth = Math.max(320, timelineEnd * PX_PER_SEC + 32)

  const orderedTracks = useMemo(() => {
    const spineIds = new Set(spineRows.map((r) => r.id))
    const byId = new Map(tracks.map((t) => [t.spineRowId, t]))
    const out: ScenarioTrack[] = []
    for (const id of laneOrder) {
      if (!spineIds.has(id)) continue
      const tr = byId.get(id)
      if (tr) out.push(tr)
    }
    for (const tr of tracks) {
      if (!spineIds.has(tr.spineRowId)) continue
      if (!out.some((x) => x.spineRowId === tr.spineRowId)) out.push(tr)
    }
    return out
  }, [tracks, laneOrder, spineRows])

  const clientXToTime = useCallback(
    (clientX: number) => {
      const el = scrollRef.current
      if (!el) return 0
      const rect = el.getBoundingClientRect()
      const contentX = clientX - rect.left + el.scrollLeft
      if (contentX < LABEL_W) return 0
      return Math.max(0, (contentX - LABEL_W) / PX_PER_SEC)
    },
    [],
  )

  const updateTrack = useCallback(
    (spineRowId: string, fn: (tr: ScenarioTrack) => ScenarioTrack) => {
      onTracksChange((prev) => prev.map((t) => (t.spineRowId === spineRowId ? fn(t) : t)))
    },
    [onTracksChange],
  )

  const moveTrackUp = (rowId: string) => {
    const idx = laneOrder.indexOf(rowId)
    if (idx <= 0) return
    const above = laneOrder[idx - 1]
    if (above) moveScenarioLaneBeforeTarget(rowId, above)
  }

  const moveTrackDown = (rowId: string) => {
    const idx = laneOrder.indexOf(rowId)
    if (idx < 0 || idx >= laneOrder.length - 1) return
    const below = laneOrder[idx + 1]
    if (below) moveScenarioLaneBeforeTarget(below, rowId)
  }

  const addClip = (spineRowId: string) => {
    const row = rowById(spineRows, spineRowId)
    if (!row) return
    const names = row.spine.skeleton.data.animations.map((a) => a.name)
    const animName = names[0] ?? ''
    if (!animName) return
    const tr = tracks.find((t) => t.spineRowId === spineRowId)
    let start = 0
    if (tr && tr.clips.length > 0) {
      start = Math.max(...tr.clips.map((c) => c.end))
    }
    const len = animationDuration(row, animName)
    const end = start + Math.max(0.05, len)
    updateTrack(spineRowId, (t) => ({
      ...t,
      clips: [...t.clips, { id: newScenarioClipId(), animName, start, end }],
    }))
  }

  const removeClip = (spineRowId: string, clipId: string) => {
    updateTrack(spineRowId, (tr) => ({
      ...tr,
      clips: tr.clips.filter((c) => c.id !== clipId),
    }))
  }

  const onAnimPick = (spineRowId: string, clipId: string, animName: string) => {
    const row = rowById(spineRows, spineRowId)
    updateTrack(spineRowId, (tr) => ({
      ...tr,
      clips: tr.clips.map((c) => {
        if (c.id !== clipId) return c
        if (!row) return { ...c, animName }
        const d = animationDuration(row, animName)
        return { ...c, animName, end: c.start + Math.max(0.05, d) }
      }),
    }))
  }

  const rulerTicks = useMemo(() => {
    const ticks: number[] = []
    const step = timelineEnd <= 8 ? 0.5 : timelineEnd <= 24 ? 1 : 2
    for (let t = 0; t <= timelineEnd + 0.001; t += step) {
      ticks.push(Number(t.toFixed(4)))
    }
    return ticks
  }, [timelineEnd])

  const sortedMarkers = useMemo(
    () => [...markers].sort((a, b) => a.timeSec - b.timeSec),
    [markers],
  )

  const onScrollAreaPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('.scenario-playhead-wrap')) return
    if ((e.target as HTMLElement).closest('.scenario-ruler-marker-wrap')) return
    const t = clientXToTime(e.clientX)
    onUserScrub()
    onCompositionTimeChange(Math.min(t, timelineEnd))
  }

  useEffect(() => {
    if (!playheadDragging) return
    const onMove = (ev: PointerEvent) => {
      const raw = clientXToTime(ev.clientX)
      onUserScrub()
      onCompositionTimeChange(Math.min(raw, timelineEnd))
    }
    const onUp = () => setPlayheadDragging(false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [playheadDragging, clientXToTime, onCompositionTimeChange, onUserScrub, timelineEnd])

  const playheadContentLeftPx = LABEL_W + Math.min(compositionTime, timelineEnd) * PX_PER_SEC
  const playheadOverlayLeftPx = playheadContentLeftPx - laneScrollLeft

  return (
    <div className="scenario-lanes-root">
      <div
        className="scenario-lanes-scroll"
        ref={scrollRef}
        onScroll={(e) => setLaneScrollLeft(e.currentTarget.scrollLeft)}
        onPointerDown={onScrollAreaPointerDown}
        role="presentation"
      >
        <div
          className="scenario-lanes-inner"
          style={{ width: LABEL_W + contentWidth, minWidth: '100%' }}
        >
          <div className="scenario-timeline-stack">
            <div className="scenario-ruler-row scenario-ruler-row--with-playhead">
              <div
                className="scenario-ruler-label-gutter scenario-ruler-label-gutter--padded"
                style={{ width: LABEL_W }}
                aria-hidden
              />
              <div
                className="scenario-ruler-area scenario-ruler-area--padded"
                style={{ width: contentWidth, minWidth: contentWidth, position: 'relative' }}
              >
                {rulerTicks.map((t) => (
                  <div
                    key={t}
                    className="scenario-ruler-tick"
                    style={{ left: t * PX_PER_SEC }}
                    title={`${t}s`}
                  >
                    <span className="scenario-ruler-tick-label">
                      {Math.abs(t - Math.round(t)) < 0.02 ? `${Math.round(t)}s` : ''}
                    </span>
                  </div>
                ))}
                {sortedMarkers.map((m) => (
                  <DraggableScenarioMarker
                    key={m.id}
                    marker={m}
                    pxPerSec={PX_PER_SEC}
                    timelineEnd={timelineEnd}
                    clientXToTime={clientXToTime}
                    onUserScrub={onUserScrub}
                    onSeek={onMarkerSeek}
                    onRemove={onRemoveMarker}
                    onBeginDragUndo={onBeginMarkerDragUndo}
                    onTimeChange={onMarkerTimeChange}
                  />
                ))}
              </div>
            </div>

            {orderedTracks.map((tr, trackIndex) => {
              const row = rowById(spineRows, tr.spineRowId)
              const err = validateTrackNoOverlap(tr)
              const names = row ? row.spine.skeleton.data.animations.map((a) => a.name) : []
              return (
                <div key={tr.spineRowId} className="scenario-lane-row" style={{ height: ROW_H }}>
                  <div
                    className="scenario-lane-label"
                    style={{ width: LABEL_W, ...getScenarioLaneLabelStyle(trackIndex) }}
                  >
                    <span className="scenario-lane-label-text" title={row?.displayName}>
                      {row?.displayName ?? tr.spineRowId}
                    </span>
                    <span className="scenario-lane-label-actions">
                      <button type="button" title="Move lane up (timeline only)" onClick={() => moveTrackUp(tr.spineRowId)}>
                        ↑
                      </button>
                      <button type="button" title="Move lane down (timeline only)" onClick={() => moveTrackDown(tr.spineRowId)}>
                        ↓
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => addClip(tr.spineRowId)}>
                        +
                      </button>
                    </span>
                  </div>
                  <div
                    className="scenario-lane-track"
                    style={{
                      width: contentWidth,
                      minWidth: contentWidth,
                      position: 'relative',
                      ...getScenarioLaneTrackStyle(trackIndex),
                    }}
                  >
                    {err ? (
                      <span className="scenario-lane-track-error" role="alert">
                        {err}
                      </span>
                    ) : null}
                    {tr.clips.length === 0 ? (
                      <span className="scenario-lane-empty">No clips — hidden in gaps</span>
                    ) : null}
                    {tr.clips.map((c) => (
                      <DraggableClipBlock
                        key={c.id}
                        clip={c}
                        names={names}
                        trackIndex={trackIndex}
                        pxPerSec={PX_PER_SEC}
                        onDragToStart={(absStart) => {
                          onUserScrub()
                          updateTrack(tr.spineRowId, (track) => ({
                            ...track,
                            clips: setClipStartResolvingOverlap(track.clips, c.id, absStart),
                          }))
                        }}
                        onAnimChange={(name) => onAnimPick(tr.spineRowId, c.id, name)}
                        onRemove={() => removeClip(tr.spineRowId, c.id)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Outside overflow:auto so the triangle is not clipped; above sticky ruler (z-index). */}
      <div
        className="scenario-playhead-wrap scenario-playhead-wrap--overlay"
        style={{ left: playheadOverlayLeftPx }}
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={Math.round(timelineEnd * 100) / 100}
        aria-valuenow={Math.round(compositionTime * 100) / 100}
        aria-label="Composition time — drag the line to scrub"
        title="Drag vertically anywhere on the blue line to scrub"
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.stopPropagation()
          e.preventDefault()
          onUserScrub()
          setPlayheadDragging(true)
        }}
      >
        <span className="scenario-playhead-handle" aria-hidden />
        <div className="scenario-playhead-line" aria-hidden />
      </div>
    </div>
  )
}

const MARKER_DRAG_THRESHOLD_PX = 5

type DraggableScenarioMarkerProps = {
  marker: ScenarioMarker
  pxPerSec: number
  timelineEnd: number
  clientXToTime: (clientX: number) => number
  onUserScrub: () => void
  onSeek: (timeSec: number) => void
  onRemove: (id: string) => void
  onBeginDragUndo: () => void
  onTimeChange: (id: string, timeSec: number) => void
}

function DraggableScenarioMarker({
  marker,
  pxPerSec,
  timelineEnd,
  clientXToTime,
  onUserScrub,
  onSeek,
  onRemove,
  onBeginDragUndo,
  onTimeChange,
}: DraggableScenarioMarkerProps) {
  const [dragging, setDragging] = useState(false)
  const originClientX = useRef(0)
  const dragActiveRef = useRef(false)

  const onMainPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    originClientX.current = e.clientX
    dragActiveRef.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onMainPointerMove = (e: React.PointerEvent) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const dx = e.clientX - originClientX.current
    if (Math.abs(dx) >= MARKER_DRAG_THRESHOLD_PX) {
      if (!dragActiveRef.current) {
        dragActiveRef.current = true
        onBeginDragUndo()
        setDragging(true)
      }
      const raw = clientXToTime(e.clientX)
      const t = Math.min(Math.max(0, raw), timelineEnd)
      onTimeChange(marker.id, t)
    }
  }

  const endDrag = (e: React.PointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    const wasDrag = dragActiveRef.current
    dragActiveRef.current = false
    setDragging(false)
    if (!wasDrag) {
      onUserScrub()
      onSeek(marker.timeSec)
    }
  }

  return (
    <div className="scenario-ruler-marker-wrap" style={{ left: marker.timeSec * pxPerSec }}>
      <button
        type="button"
        className={`scenario-ruler-marker${dragging ? ' is-dragging' : ''}`}
        title={`${marker.label} (${marker.timeSec.toFixed(2)}s) — drag to move, click to seek`}
        onPointerDown={onMainPointerDown}
        onPointerMove={onMainPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="scenario-ruler-marker-flag" aria-hidden />
        <span className="scenario-ruler-marker-label">{marker.label}</span>
      </button>
      <button
        type="button"
        className="scenario-ruler-marker-remove"
        title="Remove marker"
        aria-label={`Remove marker ${marker.label}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onRemove(marker.id)
        }}
      >
        ×
      </button>
    </div>
  )
}

type DraggableClipBlockProps = {
  clip: ScenarioClip
  names: string[]
  trackIndex: number
  pxPerSec: number
  onDragToStart: (absStartSec: number) => void
  onAnimChange: (name: string) => void
  onRemove: () => void
}

function DraggableClipBlock({
  clip,
  names,
  trackIndex,
  pxPerSec,
  onDragToStart,
  onAnimChange,
  onRemove,
}: DraggableClipBlockProps) {
  const [dragging, setDragging] = useState(false)
  const originX = useRef(0)
  const originStart = useRef(0)
  const colorStyle = getScenarioClipBlockStyle(trackIndex)

  const w = Math.max(10, (clip.end - clip.start) * pxPerSec)
  const left = clip.start * pxPerSec

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button,.scenario-anim-menu-root')) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    originX.current = e.clientX
    originStart.current = clip.start
    setDragging(true)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const dx = e.clientX - originX.current
    const deltaSec = dx / pxPerSec
    onDragToStart(originStart.current + deltaSec)
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    setDragging(false)
  }

  return (
    <div
      className={`scenario-clip-block${dragging ? ' is-dragging' : ''}`}
      style={{ left, width: w, ...colorStyle }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      title="Drag horizontally to move in time"
    >
      <div className="scenario-clip-block-bar" aria-hidden />
      <span className="scenario-clip-block-title">{clip.animName}</span>
      <ScenarioClipAnimMenu value={clip.animName} names={names} onChange={onAnimChange} />
      <button
        type="button"
        className="scenario-clip-block-remove"
        title="Remove clip"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
      >
        ×
      </button>
    </div>
  )
}
