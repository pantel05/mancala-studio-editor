import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import type { Attachment } from '@esotericsoftware/spine-core'
import type { Spine } from '@esotericsoftware/spine-pixi-v8'
import type { PixiStageHandle } from './PixiStage'
import { pickIdleAnimationName } from './spine/pickIdleAnimation'
import type { SkeletonPlaceholderInfo } from './spine/scanSkeletonPlaceholders'
import { snapWorldScalar } from './pixi/snapWorldPosition'

function isCanvasDragPickTargetIgnored(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest(
      'button, input, select, textarea, option, .spine-field, .spine-toolbar, details, .spine-draw-order, .spine-placeholders-block, .spine-placeholder-bind, .spine-placeholder-row, .spine-world-position-readout',
    ),
  )
}

function parseInspectorWorldCoord(raw: string): number | null {
  const t = raw
    .trim()
    .replace(/\s*px\s*$/i, '')
    .replace(',', '.')
    .trim()
  if (t === '' || t === '-' || t === '—') return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return n
}

export type { SkeletonPlaceholderInfo }

export type SpineControlRow = {
  id: string
  displayName: string
  spine: Spine
  /** When true, canvas drag is disabled for this instance. */
  locked: boolean
  /** When false, the skeleton is hidden on the preview stage. */
  layerVisible: boolean
  /**
   * Invalid vs Common placeholders list — rig stays on canvas frozen (no playback / drag)
   * until names match or the list is updated.
   */
  placeholderPolicyFrozen: boolean
  /**
   * User clicked **Ignore** on the frozen banner — rig is unfrozen for editing but the
   * error banner and red hierarchy colour remain until the policy actually passes.
   */
  placeholderPolicyIgnored: boolean
  /** Skeleton file from last import (atlas @1x / @2x preview). */
  skeletonSourceFile?: File
  /** Atlas tags present for this stem in the import batch. */
  atlasAvailableTags?: string[]
  /** Active atlas tag (`''` = `stem.atlas`). */
  activeAtlasTag?: string
  /** Bones detected as placeholders (see `placeholderConvention.ts`). */
  placeholders: SkeletonPlaceholderInfo[]
  /** Maps placeholder bone name → attached skeleton row id (symbol). */
  placeholderBindings: Record<string, string>
  /** When this instance is parented under another skeleton’s placeholder bone. */
  pinnedUnder: null | { hostRowId: string; boneName: string }
  /**
   * Animation names present on this skeleton that are NOT in the Common Animation States list.
   * Empty when the list is empty (validation disabled) or all names are known.
   */
  unknownAnimationNames: string[]
}

/** Imperative API for global sync (Play all / Pause all / Restart all). */
export type SpineInstanceHandle = {
  /** Rewind to frame 0, paused — next frame all can start together. */
  prepareSyncStart: () => void
  /** Resume playback after {@link prepareSyncStart}. */
  beginPlayback: () => void
  pausePlayback: () => void
  /** Rewind to frame 0; keep playing vs paused as it was. */
  rewindKeepTransport: () => void
}

const noopHandle: SpineInstanceHandle = {
  prepareSyncStart: () => {},
  beginPlayback: () => {},
  pausePlayback: () => {},
  rewindKeepTransport: () => {},
}

/**
 * Pointer-drag scrub for a single numeric axis readout.
 * Click + drag left/right changes the value in real time (1 px = 1 unit, snapped to 0.5).
 * Double-click is unaffected — the span keeps its onDoubleClick handler as normal.
 */
function useAxisScrub(
  disabled: boolean,
  /** Return current `{value, companion}` at scrub-start — or null to abort. */
  onBegin: () => { value: number; companion: number } | null,
  /** Called each move frame with the new snapped value and the frozen companion. */
  onChange: (newValue: number, companion: number) => void,
  onEditBegin: (() => void) | undefined,
  onEditEnd: ((committed: boolean) => void) | undefined,
  sensitivity = 1,
) {
  const scrubRef = useRef<{
    startX: number
    startValue: number
    companion: number
    active: boolean
    pointerId: number
  } | null>(null)
  const [isScrubbing, setIsScrubbing] = useState(false)

  // Always-fresh refs so move/end handlers never go stale
  const onBeginRef = useRef(onBegin)
  const onChangeRef = useRef(onChange)
  const onEditBeginRef = useRef(onEditBegin)
  const onEditEndRef = useRef(onEditEnd)
  onBeginRef.current = onBegin
  onChangeRef.current = onChange
  onEditBeginRef.current = onEditBegin
  onEditEndRef.current = onEditEnd

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (disabled || e.button !== 0) return
      const result = onBeginRef.current()
      if (result === null) return
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      scrubRef.current = {
        startX: e.clientX,
        startValue: result.value,
        companion: result.companion,
        active: false,
        pointerId: e.pointerId,
      }
    },
    [disabled],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const s = scrubRef.current
      if (!s || e.pointerId !== s.pointerId) return
      const delta = (e.clientX - s.startX) * sensitivity
      if (!s.active && Math.abs(delta) < 3) return
      if (!s.active) {
        s.active = true
        onEditBeginRef.current?.()
        setIsScrubbing(true)
        document.body.style.cursor = 'ew-resize'
        document.body.style.userSelect = 'none'
      }
      onChangeRef.current(snapWorldScalar(s.startValue + delta), s.companion)
    },
    [sensitivity],
  )

  const endScrub = useCallback((committed: boolean) => {
    const s = scrubRef.current
    if (!s) return
    scrubRef.current = null
    if (s.active) {
      onEditEndRef.current?.(committed)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setIsScrubbing(false)
    }
  }, [])

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (scrubRef.current?.pointerId !== e.pointerId) return
      endScrub(true)
    },
    [endScrub],
  )

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (scrubRef.current?.pointerId !== e.pointerId) return
      endScrub(false)
    },
    [endScrub],
  )

  return { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel, isScrubbing }
}

/** Live readout of {@link PixiStageHandle.getSpineBoneLocalOffset} for nested children. */
function useInspectorBoneOffset(
  spine: Spine,
  viewportStageRef: RefObject<PixiStageHandle | null> | undefined,
  inspectorActive: boolean,
  isPinned: boolean,
  pauseLiveReadout: boolean,
): { x: string; y: string } {
  const [labels, setLabels] = useState({ x: '—', y: '—' })
  const lastKeyRef = useRef('')

  useEffect(() => {
    if (!inspectorActive || !viewportStageRef || !isPinned || pauseLiveReadout) return

    lastKeyRef.current = ''
    let frameId = 0
    let cancelled = false
    const loop = () => {
      if (cancelled) return
      const pos = viewportStageRef.current?.getSpineBoneLocalOffset(spine)
      if (pos) {
        const xs = pos.x.toFixed(1)
        const ys = pos.y.toFixed(1)
        const key = `${xs}\t${ys}`
        if (key !== lastKeyRef.current) {
          lastKeyRef.current = key
          setLabels({ x: `${xs} px`, y: `${ys} px` })
        }
      }
      if (!cancelled) frameId = requestAnimationFrame(loop)
    }
    frameId = requestAnimationFrame(loop)
    return () => {
      cancelled = true
      cancelAnimationFrame(frameId)
    }
  }, [inspectorActive, viewportStageRef, spine, isPinned, pauseLiveReadout])

  return labels
}

/** Live readout of {@link PixiStageHandle.getSpineWorldPosition} while the inspector pane is visible. */
function useInspectorWorldPositionPx(
  spine: Spine,
  viewportStageRef: RefObject<PixiStageHandle | null> | undefined,
  inspectorActive: boolean,
  /** Pause RAF updates while an axis input is focused (avoids fighting the draft). */
  pauseLiveReadout: boolean,
): { x: string; y: string } {
  const [labels, setLabels] = useState({ x: '—', y: '—' })
  const lastKeyRef = useRef('')

  useEffect(() => {
    if (!inspectorActive || !viewportStageRef || pauseLiveReadout) return

    lastKeyRef.current = ''
    let frameId = 0
    let cancelled = false
    const loop = () => {
      if (cancelled) return
      const pos = viewportStageRef.current?.getSpineWorldPosition(spine)
      if (pos) {
        const xs = pos.x.toFixed(1)
        const ys = pos.y.toFixed(1)
        const key = `${xs}\t${ys}`
        if (key !== lastKeyRef.current) {
          lastKeyRef.current = key
          setLabels({ x: `${xs} px`, y: `${ys} px` })
        }
      }
      if (!cancelled) frameId = requestAnimationFrame(loop)
    }
    frameId = requestAnimationFrame(loop)
    return () => {
      cancelled = true
      cancelAnimationFrame(frameId)
    }
  }, [inspectorActive, viewportStageRef, spine, pauseLiveReadout])

  return labels
}

export const SpineInstanceControls = forwardRef<
  SpineInstanceHandle,
  {
    row: SpineControlRow
    /** Used to change Pixi draw order (z-index) for this skeleton vs others. */
    viewportStageRef?: RefObject<PixiStageHandle | null>
    /** Highlight when this skeleton is the active canvas pick (hierarchy or direct canvas click). */
    canvasDragPickActive?: boolean
    /** Toggle canvas pick highlight for this row (click panel outside form controls). */
    onToggleCanvasDragPick?: () => void
    /** Other loaded rows (for attaching symbols to placeholder bones). */
    allRows?: SpineControlRow[]
    /** Attach or clear a symbol skeleton on a placeholder bone of this row’s skeleton. */
    onPlaceholderBind?: (hostRowId: string, boneName: string, childRowId: string | null) => void
    /** When false, skip per-frame position polling (hidden inspector panes). */
    inspectorActive?: boolean
    /** Capture scene snapshot before inspector-driven world move (undo). */
    onWorldPositionEditBegin?: () => void
    /** After a placement apply attempt; `committed` is whether the stage applied the move. */
    onWorldPositionEditEnd?: (committed: boolean) => void
    /** User pressed Ignore on the frozen banner — unfreeze but keep error visible. */
    onIgnorePlaceholderPolicy?: () => void
    /**
     * Called when the user clicks "Add to list" on the unknown animation names banner.
     * Receives the list of animation names to add to Common Animation States.
     */
    onAddToCommonAnimations?: (names: string[]) => void
  }
>(function SpineInstanceControls(
  {
    row,
    viewportStageRef,
    canvasDragPickActive,
    onToggleCanvasDragPick,
    allRows = [],
    onPlaceholderBind,
    inspectorActive = false,
    onWorldPositionEditBegin,
    onWorldPositionEditEnd,
    onIgnorePlaceholderPolicy,
    onAddToCommonAnimations,
  },
  ref,
) {
  const names = useMemo(
    () => row.spine.skeleton.data.animations.map((a) => a.name),
    [row.spine],
  )

  const skinEntries = useMemo(
    () =>
      row.spine.skeleton.data.skins.map((s, i) => ({
        index: i,
        label: s.name || '(unnamed)',
      })),
    [row.spine],
  )

  const slotNames = useMemo(
    () => row.spine.skeleton.slots.map((s) => s.data.name),
    [row.spine],
  )

  const savedSlotAttachments = useRef(new Map<string, Attachment | null>())
  const [hiddenSlots, setHiddenSlots] = useState<Set<string>>(() => new Set())

  const [anim, setAnim] = useState(() => pickIdleAnimationName(names) ?? '')
  const [loop, setLoop] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [sceneScale, setSceneScale] = useState(() => row.spine.scale.x)
  const [scrubTime, setScrubTime] = useState(0)
  const [skinSelect, setSkinSelect] = useState(() => {
    const sk = row.spine.skeleton.skin
    if (!sk) return ''
    const i = row.spine.skeleton.data.skins.findIndex(
      (s) => s === sk || s.name === sk.name,
    )
    return i >= 0 ? String(i) : ''
  })

  const animRef = useRef(anim)
  const loopRef = useRef(loop)
  const speedRef = useRef(speed)
  const playingRef = useRef(playing)
  animRef.current = anim
  loopRef.current = loop
  speedRef.current = speed
  playingRef.current = playing

  useEffect(() => {
    savedSlotAttachments.current.clear()
    setHiddenSlots(new Set())
  }, [row.id])

  const trackEntry = row.spine.state.tracks[0]
  const trackDuration = trackEntry?.animation?.duration ?? 0

  useLayoutEffect(() => {
    const spine = row.spine
    if (row.placeholderPolicyFrozen && !row.placeholderPolicyIgnored) {
      spine.autoUpdate = false
      spine.state.timeScale = 0
      spine.update(0)
      setPlaying(false)
      return
    }
    const cur = spine.skeleton.skin
    if (!cur) setSkinSelect('')
    else {
      const i = spine.skeleton.data.skins.findIndex(
        (s) => s === cur || s.name === cur.name,
      )
      setSkinSelect(i >= 0 ? String(i) : '')
    }
    if (names.length === 0) {
      spine.autoUpdate = true
      spine.update(0)
      setScrubTime(0)
      return
    }
    // Prefer the animation the user already had selected (e.g. after an atlas-tag swap where
    // the skeleton structure is identical). Fall back to idle pick only for new skeletons.
    const prevAnim = animRef.current
    const clip =
      prevAnim && names.includes(prevAnim)
        ? prevAnim
        : (pickIdleAnimationName(names) ?? names[0])
    if (!clip) return
    const restoreLoop = loopRef.current
    const restoreSpeed = speedRef.current
    const restorePlaying = playingRef.current
    setAnim(clip)
    setLoop(restoreLoop)
    setSpeed(restoreSpeed)
    spine.autoUpdate = false
    spine.state.timeScale = restorePlaying ? restoreSpeed : 0
    spine.state.clearTrack(0)
    spine.state.setAnimation(0, clip, restoreLoop)
    spine.update(0)
    const te0 = spine.state.tracks[0]
    setScrubTime(te0?.trackTime ?? 0)
    setPlaying(restorePlaying)
  }, [row.id, row.spine, names, row.placeholderPolicyFrozen, row.placeholderPolicyIgnored])

  useEffect(() => {
    if (!playing) return
    row.spine.state.timeScale = speed
  }, [speed, playing, row.spine])

  useEffect(() => {
    row.spine.scale.set(sceneScale)
  }, [sceneScale, row.spine])

  useEffect(() => {
    if (!playing || names.length === 0) return
    let id = 0
    const tick = () => {
      const te = row.spine.state.tracks[0]
      if (te) setScrubTime(te.trackTime)
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [playing, names.length, row.spine])

  useEffect(() => {
    if (playing || names.length === 0) return
    const te = row.spine.state.tracks[0]
    if (te) setScrubTime(te.trackTime)
  }, [playing, names.length, row.spine, anim, loop])

  const applyScrub = useCallback(
    (value: number) => {
      const te = row.spine.state.tracks[0]
      if (!te?.animation) return
      const d = te.animation.duration
      const clamped = Math.max(0, Math.min(value, d))
      setScrubTime(clamped)
      te.trackTime = clamped
      row.spine.update(0)
    },
    [row.spine],
  )

  const onSlotVisibleChange = useCallback(
    (slotName: string, visible: boolean) => {
      const sk = row.spine.skeleton
      const slot = sk.findSlot(slotName)
      if (!slot) return
      if (!visible) {
        savedSlotAttachments.current.set(slotName, slot.getAttachment())
        slot.setAttachment(null)
        setHiddenSlots((prev) => new Set(prev).add(slotName))
      } else {
        const prev =
          savedSlotAttachments.current.get(slotName) ??
          (slot.data.attachmentName
            ? sk.getAttachment(slot.data.index, slot.data.attachmentName)
            : null)
        slot.setAttachment(prev)
        savedSlotAttachments.current.delete(slotName)
        setHiddenSlots((prev) => {
          const next = new Set(prev)
          next.delete(slotName)
          return next
        })
      }
      sk.updateCache()
      row.spine.update(0)
    },
    [row.spine],
  )

  useImperativeHandle(
    ref,
    () => {
      if (names.length === 0 || (row.placeholderPolicyFrozen && !row.placeholderPolicyIgnored)) return noopHandle

      const spine = row.spine
      return {
        prepareSyncStart() {
          const name =
            animRef.current ||
            pickIdleAnimationName(names) ||
            names[0]
          if (!name) return
          spine.state.clearTrack(0)
          spine.state.setAnimation(0, name, loopRef.current)
          const te = spine.state.tracks[0]
          if (te) te.trackTime = 0
          spine.autoUpdate = false
          spine.update(0)
          setPlaying(false)
        },
        beginPlayback() {
          spine.autoUpdate = true
          spine.state.timeScale = speedRef.current
          setPlaying(true)
        },
        pausePlayback() {
          spine.autoUpdate = false
          setPlaying(false)
        },
        rewindKeepTransport() {
          const name =
            animRef.current ||
            pickIdleAnimationName(names) ||
            names[0]
          if (!name) return
          spine.state.clearTrack(0)
          spine.state.setAnimation(0, name, loopRef.current)
          const te = spine.state.tracks[0]
          if (te) te.trackTime = 0
          if (playingRef.current) {
            spine.autoUpdate = true
            spine.state.timeScale = speedRef.current
            spine.update(0)
          } else {
            spine.autoUpdate = false
            spine.update(0)
          }
        },
      }
    },
    [names, row.placeholderPolicyFrozen, row.placeholderPolicyIgnored, row.spine],
  )

  const onSkinChange = useCallback(
    (value: string) => {
      const s = row.spine
      const sk = s.skeleton
      setSkinSelect(value)
      if (value === '') {
        sk.setSkin(sk.data.defaultSkin ?? null)
      } else {
        const idx = Number(value)
        const picked = sk.data.skins[idx]
        if (picked) sk.setSkin(picked)
      }
      sk.setSlotsToSetupPose()
      sk.updateCache()
      s.update(0)
    },
    [row.spine],
  )

  const onAnimChange = useCallback(
    (name: string) => {
      const s = row.spine
      setAnim(name)
      s.state.setAnimation(0, name, loop)
      if (!playing) {
        s.autoUpdate = false
        s.update(0)
      }
      const te = s.state.tracks[0]
      setScrubTime(te?.trackTime ?? 0)
    },
    [loop, playing, row.spine],
  )

  const onLoopChange = useCallback(
    (next: boolean) => {
      const s = row.spine
      setLoop(next)
      const te = s.state.tracks[0]
      if (te) te.loop = next
      if (!playing) s.update(0)
    },
    [playing, row.spine],
  )

  const play = useCallback(() => {
    if (names.length === 0) return
    const s = row.spine
    const name = pickIdleAnimationName(names)
    if (!name) return
    setAnim(name)
    s.autoUpdate = true
    s.state.timeScale = speed
    s.state.setAnimation(0, name, loop)
    setPlaying(true)
  }, [loop, names, row.spine, speed])

  const pause = useCallback(() => {
    row.spine.autoUpdate = false
    setPlaying(false)
  }, [row.spine])

  const drawToFront = useCallback(() => {
    viewportStageRef?.current?.bringSpineToDrawFront(row.spine)
  }, [row.spine, viewportStageRef])

  const drawToBack = useCallback(() => {
    viewportStageRef?.current?.sendSpineToDrawBack(row.spine)
  }, [row.spine, viewportStageRef])

  const onPanelPointerDownCapture = useCallback(
    (e: { button: number; target: EventTarget | null }) => {
      if (e.button !== 0 || !onToggleCanvasDragPick) return
      if (isCanvasDragPickTargetIgnored(e.target)) return
      onToggleCanvasDragPick()
    },
    [onToggleCanvasDragPick],
  )

  const restart = useCallback(() => {
    const s = row.spine
    const name = anim || pickIdleAnimationName(names) || names[0]
    if (!name) return
    s.state.clearTrack(0)
    s.state.setAnimation(0, name, loop)
    const te = s.state.tracks[0]
    if (te) te.trackTime = 0
    setScrubTime(0)
    if (!playing) {
      s.autoUpdate = false
      s.update(0)
    }
  }, [anim, loop, names, playing, row.spine])

  const placeholderPolicyBanner = useMemo(() => {
    if (row.placeholderPolicyIgnored) {
      return (
        <div className="spine-frozen-banner spine-frozen-banner--ignored" role="alert">
          <strong>Warning</strong> — placeholder names still don&apos;t match{' '}
          <strong>Settings → Common placeholders</strong>. Working in ignored mode — fix to clear this warning.
        </div>
      )
    }
    if (!row.placeholderPolicyFrozen) return null
    return (
      <div className="spine-frozen-banner" role="alert">
        <strong>Frozen</strong> — placeholder bone names do not match{' '}
        <strong>Settings → Common placeholders</strong>. Fix the names in Spine or add the missing entries.
        {onIgnorePlaceholderPolicy && (
          <div className="spine-frozen-banner-actions">
            <button
              type="button"
              className="btn btn-sm spine-frozen-ignore-btn"
              onClick={onIgnorePlaceholderPolicy}
              title="Unfreeze and work with this object — the warning will stay until the names are fixed"
            >
              Ignore
            </button>
          </div>
        )}
      </div>
    )
  }, [row.placeholderPolicyFrozen, row.placeholderPolicyIgnored, onIgnorePlaceholderPolicy])

  const unknownAnimationsBanner = useMemo(() => {
    const unknown = row.unknownAnimationNames
    if (!unknown || unknown.length === 0) return null
    return (
      <div className="spine-anim-warning-banner" role="alert">
        <strong>Warning</strong> — {unknown.length === 1 ? 'animation' : 'animations'}{' '}
        {unknown.map((n, i) => (
          <span key={n}>
            <code className="spine-anim-warning-name">{n}</code>
            {i < unknown.length - 1 ? ', ' : ''}
          </span>
        ))}{' '}
        {unknown.length === 1 ? 'is' : 'are'} not in{' '}
        <strong>Settings → Common Animation States</strong>.
        {onAddToCommonAnimations && (
          <div className="spine-frozen-banner-actions">
            <button
              type="button"
              className="btn btn-sm spine-anim-add-btn"
              onClick={() => onAddToCommonAnimations(unknown)}
              title="Add all unknown animation names to the Common Animation States list"
            >
              Add all to list
            </button>
          </div>
        )}
      </div>
    )
  }, [row.unknownAnimationNames, onAddToCommonAnimations])

  const pinnedBanner = useMemo(() => {
    if (!row.pinnedUnder) return null
    const host = allRows.find((r) => r.id === row.pinnedUnder!.hostRowId)
    return (
      <div className="spine-pinned-banner" role="status">
        Nested under <strong>{host?.displayName ?? row.pinnedUnder.hostRowId}</strong>
        {' · '}
        placeholder bone <code>{row.pinnedUnder.boneName}</code>
      </div>
    )
  }, [allRows, row.pinnedUnder])

  const placeholdersPanel = useMemo(() => {
    if (row.placeholders.length === 0 || !onPlaceholderBind) return null
    return (
      <details className="spine-placeholders-block" open>
        <summary className="spine-placeholders-summary">
          Placeholders ({row.placeholders.length})
        </summary>
        <p className="spine-placeholder-help">
          Convention-driven bones (see <code className="spine-inline-code">placeholderConvention.ts</code>). Pick
          another skeleton so it is parented under this one and follows the bone on the canvas.
        </p>
        {row.placeholders.map((ph) => {
          const boundId = row.placeholderBindings[ph.boneName]
          const candidates = allRows.filter(
            (r) =>
              r.id !== row.id &&
              (!r.pinnedUnder ||
                (r.pinnedUnder.hostRowId === row.id && r.pinnedUnder.boneName === ph.boneName)),
          )
          return (
            <div key={ph.boneName} className="spine-placeholder-row">
              <div className="spine-placeholder-meta">
                <span
                  className="spine-placeholder-bone"
                  title={
                    ph.parentBoneName ? `Parent bone in skeleton: ${ph.parentBoneName}` : 'Root-level bone'
                  }
                >
                  {ph.boneName}
                </span>
                {ph.slotName ? (
                  <span className="spine-placeholder-slot"> · slot {ph.slotName}</span>
                ) : null}
              </div>
              <label className="spine-placeholder-bind">
                <span className="spine-field-label">Attach symbol</span>
                <select
                  className="spine-select"
                  value={boundId ?? ''}
                  disabled={row.placeholderPolicyFrozen && !row.placeholderPolicyIgnored}
                  onChange={(e) => onPlaceholderBind(row.id, ph.boneName, e.target.value || null)}
                >
                  <option value="">— None —</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )
        })}
      </details>
    )
  }, [allRows, onPlaceholderBind, row])

  const transportLocked = row.placeholderPolicyFrozen && !row.placeholderPolicyIgnored

  const isPinned = Boolean(row.pinnedUnder)
  /** Disabled for locked/frozen spines AND for nested children (world position is bone-driven). */
  const worldPosDisabled =
    row.locked ||
    (row.placeholderPolicyFrozen && !row.placeholderPolicyIgnored) ||
    isPinned
  /** Disabled for locked/frozen spines only — pinned children should always edit their bone offset. */
  const boneOffsetDisabled = row.locked || (row.placeholderPolicyFrozen && !row.placeholderPolicyIgnored)

  const [worldEdit, setWorldEdit] = useState<null | { axis: 'x' | 'y'; draft: string }>(null)
  const [boneOffsetEdit, setBoneOffsetEdit] = useState<null | { axis: 'x' | 'y'; draft: string }>(null)

  useEffect(() => {
    setWorldEdit(null)
    setBoneOffsetEdit(null)
  }, [row.id])

  const worldEditRef = useRef(worldEdit)
  worldEditRef.current = worldEdit
  const worldPosInputRef = useRef<HTMLInputElement | null>(null)
  const skipWorldPosBlurCommitRef = useRef(false)

  const worldPosLabels = useInspectorWorldPositionPx(
    row.spine,
    viewportStageRef,
    inspectorActive,
    Boolean(worldEdit),
  )

  const boneOffsetLabels = useInspectorBoneOffset(
    row.spine,
    viewportStageRef,
    inspectorActive,
    isPinned,
    Boolean(boneOffsetEdit),
  )

  // ── Click-drag scrub for world position and bone offset axes ────────────────
  const worldXScrub = useAxisScrub(
    worldPosDisabled,
    () => {
      const pos = viewportStageRef?.current?.getSpineWorldPosition(row.spine)
      return pos ? { value: pos.x, companion: pos.y } : null
    },
    (newX, frozenY) => {
      viewportStageRef?.current?.setSpineWorldPlacementXY(row.spine, newX, frozenY)
    },
    onWorldPositionEditBegin,
    onWorldPositionEditEnd,
  )

  const worldYScrub = useAxisScrub(
    worldPosDisabled,
    () => {
      const pos = viewportStageRef?.current?.getSpineWorldPosition(row.spine)
      return pos ? { value: pos.y, companion: pos.x } : null
    },
    (newY, frozenX) => {
      viewportStageRef?.current?.setSpineWorldPlacementXY(row.spine, frozenX, newY)
    },
    onWorldPositionEditBegin,
    onWorldPositionEditEnd,
  )

  const boneXScrub = useAxisScrub(
    boneOffsetDisabled || !isPinned,
    () => {
      const pos = viewportStageRef?.current?.getSpineBoneLocalOffset(row.spine)
      return pos ? { value: pos.x, companion: pos.y } : null
    },
    (newX, frozenY) => {
      viewportStageRef?.current?.setSpineBoneLocalOffset(row.spine, newX, frozenY)
    },
    onWorldPositionEditBegin,
    onWorldPositionEditEnd,
  )

  const boneYScrub = useAxisScrub(
    boneOffsetDisabled || !isPinned,
    () => {
      const pos = viewportStageRef?.current?.getSpineBoneLocalOffset(row.spine)
      return pos ? { value: pos.y, companion: pos.x } : null
    },
    (newY, frozenX) => {
      viewportStageRef?.current?.setSpineBoneLocalOffset(row.spine, frozenX, newY)
    },
    onWorldPositionEditBegin,
    onWorldPositionEditEnd,
  )

  /** Only when opening an axis — not on every draft keystroke (would re-`select()` and trap the caret). */
  useLayoutEffect(() => {
    if (!worldEdit) return
    const el = worldPosInputRef.current
    el?.focus()
    el?.select()
  }, [worldEdit?.axis])

  const beginEditWorldAxis = useCallback(
    (axis: 'x' | 'y') => {
      if (worldPosDisabled) return
      const pos = viewportStageRef?.current?.getSpineWorldPosition(row.spine)
      if (!pos) return
      setWorldEdit({ axis, draft: axis === 'x' ? pos.x.toFixed(1) : pos.y.toFixed(1) })
    },
    [worldPosDisabled, viewportStageRef, row.spine],
  )

  const commitWorldPositionEdit = useCallback(() => {
    const cur = worldEditRef.current
    if (!cur) return
    const stage = viewportStageRef?.current
    const pos = stage?.getSpineWorldPosition(row.spine)
    if (!stage || !pos) {
      setWorldEdit(null)
      return
    }
    const v = parseInspectorWorldCoord(cur.draft)
    if (v === null) {
      setWorldEdit(null)
      return
    }
    const nx = cur.axis === 'x' ? v : pos.x
    const ny = cur.axis === 'y' ? v : pos.y
    onWorldPositionEditBegin?.()
    const ok = stage.setSpineWorldPlacementXY(row.spine, nx, ny)
    onWorldPositionEditEnd?.(ok)
    setWorldEdit(null)
  }, [viewportStageRef, row.spine, onWorldPositionEditBegin, onWorldPositionEditEnd])

  const onWorldPosKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        skipWorldPosBlurCommitRef.current = true
        commitWorldPositionEdit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        skipWorldPosBlurCommitRef.current = true
        setWorldEdit(null)
      }
    },
    [commitWorldPositionEdit],
  )

  const onWorldPosInputBlur = useCallback(() => {
    if (skipWorldPosBlurCommitRef.current) {
      skipWorldPosBlurCommitRef.current = false
      return
    }
    commitWorldPositionEdit()
  }, [commitWorldPositionEdit])

  // ── Bone offset edit (only for pinned/nested children) ──────────────────────
  const boneOffsetEditRef = useRef(boneOffsetEdit)
  boneOffsetEditRef.current = boneOffsetEdit
  const boneOffsetInputRef = useRef<HTMLInputElement | null>(null)
  const skipBoneOffsetBlurCommitRef = useRef(false)

  useLayoutEffect(() => {
    if (!boneOffsetEdit) return
    const el = boneOffsetInputRef.current
    el?.focus()
    el?.select()
  }, [boneOffsetEdit?.axis])

  const beginEditBoneOffsetAxis = useCallback(
    (axis: 'x' | 'y') => {
      if (boneOffsetDisabled) return
      const pos = viewportStageRef?.current?.getSpineBoneLocalOffset(row.spine)
      if (!pos) return
      setBoneOffsetEdit({ axis, draft: axis === 'x' ? pos.x.toFixed(1) : pos.y.toFixed(1) })
    },
    [boneOffsetDisabled, viewportStageRef, row.spine],
  )

  const commitBoneOffsetEdit = useCallback(() => {
    const cur = boneOffsetEditRef.current
    if (!cur) return
    const stage = viewportStageRef?.current
    const pos = stage?.getSpineBoneLocalOffset(row.spine)
    if (!stage || !pos) {
      setBoneOffsetEdit(null)
      return
    }
    const v = parseInspectorWorldCoord(cur.draft)
    if (v === null) {
      setBoneOffsetEdit(null)
      return
    }
    const nx = cur.axis === 'x' ? v : pos.x
    const ny = cur.axis === 'y' ? v : pos.y
    onWorldPositionEditBegin?.()
    const ok = stage.setSpineBoneLocalOffset(row.spine, nx, ny)
    onWorldPositionEditEnd?.(ok)
    setBoneOffsetEdit(null)
  }, [viewportStageRef, row.spine, onWorldPositionEditBegin, onWorldPositionEditEnd])

  const onBoneOffsetKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        skipBoneOffsetBlurCommitRef.current = true
        commitBoneOffsetEdit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        skipBoneOffsetBlurCommitRef.current = true
        setBoneOffsetEdit(null)
      }
    },
    [commitBoneOffsetEdit],
  )

  const onBoneOffsetInputBlur = useCallback(() => {
    if (skipBoneOffsetBlurCommitRef.current) {
      skipBoneOffsetBlurCommitRef.current = false
      return
    }
    commitBoneOffsetEdit()
  }, [commitBoneOffsetEdit])

  const worldPositionBlock = (
    <div className="spine-field spine-world-position-field">
      <span className="spine-field-label">World position</span>
      <div
        className="spine-world-position-values"
        aria-live="polite"
        title={
          isPinned
            ? 'Read-only while nested under a placeholder — use Bone offset to reposition.'
            : worldPosDisabled
              ? 'Unavailable while locked or frozen.'
              : 'Scene units (same as grid). Drag to scrub · Double-click to type. Snaps to 0.5 px.'
        }
      >
        {worldEdit?.axis === 'x' ? (
          <label className="spine-world-position-edit">
            <span className="spine-world-position-axis-label">X</span>
            <input
              ref={worldPosInputRef}
              type="text"
              inputMode="decimal"
              className="spine-world-position-input"
              value={worldEdit.draft}
              onChange={(e) =>
                setWorldEdit((w) => (w && w.axis === 'x' ? { ...w, draft: e.target.value } : w))
              }
              onBlur={onWorldPosInputBlur}
              onKeyDown={onWorldPosKeyDown}
              aria-label="World position X (scene units)"
            />
            <span className="spine-world-position-unit"> px</span>
          </label>
        ) : (
          <span
            role="button"
            tabIndex={worldPosDisabled ? -1 : 0}
            className="spine-world-position-readout"
            onDoubleClick={() => beginEditWorldAxis('x')}
            onKeyDown={(e) => {
              if (!worldPosDisabled && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault()
                beginEditWorldAxis('x')
              }
            }}
            onPointerDown={worldXScrub.handlePointerDown}
            onPointerMove={worldXScrub.handlePointerMove}
            onPointerUp={worldXScrub.handlePointerUp}
            onPointerCancel={worldXScrub.handlePointerCancel}
            title={worldPosDisabled ? undefined : 'Drag to scrub · Double-click to type'}
          >
            X {worldPosLabels.x}
          </span>
        )}
        {worldEdit?.axis === 'y' ? (
          <label className="spine-world-position-edit">
            <span className="spine-world-position-axis-label">Y</span>
            <input
              ref={worldPosInputRef}
              type="text"
              inputMode="decimal"
              className="spine-world-position-input"
              value={worldEdit.draft}
              onChange={(e) =>
                setWorldEdit((w) => (w && w.axis === 'y' ? { ...w, draft: e.target.value } : w))
              }
              onBlur={onWorldPosInputBlur}
              onKeyDown={onWorldPosKeyDown}
              aria-label="World position Y (scene units)"
            />
            <span className="spine-world-position-unit"> px</span>
          </label>
        ) : (
          <span
            role="button"
            tabIndex={worldPosDisabled ? -1 : 0}
            className="spine-world-position-readout"
            onDoubleClick={() => beginEditWorldAxis('y')}
            onKeyDown={(e) => {
              if (!worldPosDisabled && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault()
                beginEditWorldAxis('y')
              }
            }}
            onPointerDown={worldYScrub.handlePointerDown}
            onPointerMove={worldYScrub.handlePointerMove}
            onPointerUp={worldYScrub.handlePointerUp}
            onPointerCancel={worldYScrub.handlePointerCancel}
            title={worldPosDisabled ? undefined : 'Drag to scrub · Double-click to type'}
          >
            Y {worldPosLabels.y}
          </span>
        )}
      </div>
    </div>
  )

  const boneOffsetBlock = isPinned ? (
    <div className="spine-field spine-world-position-field">
      <span className="spine-field-label">
        Bone offset{' '}
        <span className="spine-field-label-hint">(relative to placeholder bone)</span>
      </span>
      <div
        className="spine-world-position-values"
        aria-live="polite"
        title={
          boneOffsetDisabled
            ? 'Unavailable while locked or frozen.'
            : 'Offset from the placeholder bone in bone-local space. Drag to scrub · Double-click to type. Snaps to 0.5 px.'
        }
      >
        {boneOffsetEdit?.axis === 'x' ? (
          <label className="spine-world-position-edit">
            <span className="spine-world-position-axis-label">X</span>
            <input
              ref={boneOffsetInputRef}
              type="text"
              inputMode="decimal"
              className="spine-world-position-input"
              value={boneOffsetEdit.draft}
              onChange={(e) =>
                setBoneOffsetEdit((w) => (w && w.axis === 'x' ? { ...w, draft: e.target.value } : w))
              }
              onBlur={onBoneOffsetInputBlur}
              onKeyDown={onBoneOffsetKeyDown}
              aria-label="Bone offset X (bone-local units)"
            />
            <span className="spine-world-position-unit"> px</span>
          </label>
        ) : (
          <span
            role="button"
            tabIndex={boneOffsetDisabled ? -1 : 0}
            className="spine-world-position-readout"
            onDoubleClick={() => beginEditBoneOffsetAxis('x')}
            onKeyDown={(e) => {
              if (!boneOffsetDisabled && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault()
                beginEditBoneOffsetAxis('x')
              }
            }}
            onPointerDown={boneXScrub.handlePointerDown}
            onPointerMove={boneXScrub.handlePointerMove}
            onPointerUp={boneXScrub.handlePointerUp}
            onPointerCancel={boneXScrub.handlePointerCancel}
            title={boneOffsetDisabled ? undefined : 'Drag to scrub · Double-click to type'}
          >
            X {boneOffsetLabels.x}
          </span>
        )}
        {boneOffsetEdit?.axis === 'y' ? (
          <label className="spine-world-position-edit">
            <span className="spine-world-position-axis-label">Y</span>
            <input
              ref={boneOffsetInputRef}
              type="text"
              inputMode="decimal"
              className="spine-world-position-input"
              value={boneOffsetEdit.draft}
              onChange={(e) =>
                setBoneOffsetEdit((w) => (w && w.axis === 'y' ? { ...w, draft: e.target.value } : w))
              }
              onBlur={onBoneOffsetInputBlur}
              onKeyDown={onBoneOffsetKeyDown}
              aria-label="Bone offset Y (bone-local units)"
            />
            <span className="spine-world-position-unit"> px</span>
          </label>
        ) : (
          <span
            role="button"
            tabIndex={boneOffsetDisabled ? -1 : 0}
            className="spine-world-position-readout"
            onDoubleClick={() => beginEditBoneOffsetAxis('y')}
            onKeyDown={(e) => {
              if (!boneOffsetDisabled && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault()
                beginEditBoneOffsetAxis('y')
              }
            }}
            onPointerDown={boneYScrub.handlePointerDown}
            onPointerMove={boneYScrub.handlePointerMove}
            onPointerUp={boneYScrub.handlePointerUp}
            onPointerCancel={boneYScrub.handlePointerCancel}
            title={boneOffsetDisabled ? undefined : 'Drag to scrub · Double-click to type'}
          >
            Y {boneOffsetLabels.y}
          </span>
        )}
      </div>
    </div>
  ) : null

  if (names.length === 0) {
    return (
      <div
        className={`spine-controls${canvasDragPickActive ? ' is-canvas-drag-pick' : ''}`}
        data-spine-id={row.id}
        onPointerDownCapture={onPanelPointerDownCapture}
      >
        {placeholderPolicyBanner}
        {unknownAnimationsBanner}
        {pinnedBanner}
        <div className="spine-controls-head">
          <span className="spine-controls-title">{row.displayName}</span>
          <div className="spine-controls-head-right">
            <div className="spine-draw-order" role="group" aria-label="Draw order">
              <button
                type="button"
                className="spine-order-btn"
                onClick={drawToFront}
                title="Draw in front of other skeletons"
              >
                Front
              </button>
              <button
                type="button"
                className="spine-order-btn"
                onClick={drawToBack}
                title="Draw behind other skeletons"
              >
                Back
              </button>
            </div>
            <span className="spine-controls-badge">Skeleton</span>
          </div>
        </div>
        {worldPositionBlock}
        {boneOffsetBlock}
        <p className="spine-controls-empty">This skeleton has no animations.</p>
        {skinEntries.length > 0 && (
          <label className="spine-field">
            <span className="spine-field-label">Skin</span>
            <select
              className="spine-select"
              value={skinSelect}
              disabled={transportLocked}
              onChange={(e) => onSkinChange(e.target.value)}
            >
              <option value="">Default skin</option>
              {skinEntries.map((e) => (
                <option key={e.index} value={String(e.index)}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {slotNames.length > 0 && (
          <details className="spine-slots-block">
            <summary className="spine-slots-summary">Slots ({slotNames.length})</summary>
            <div className="spine-slots-scroll">
              {[...slotNames].sort().map((sn) => (
                <label key={sn} className="spine-slot-row">
                  <input
                    type="checkbox"
                    disabled={transportLocked}
                    checked={!hiddenSlots.has(sn)}
                    onChange={(e) => onSlotVisibleChange(sn, e.target.checked)}
                  />
                  <span className="spine-slot-name" title={sn}>
                    {sn}
                  </span>
                </label>
              ))}
            </div>
          </details>
        )}
        <label className="spine-field">
          <span className="spine-field-label">Canvas scale {sceneScale.toFixed(2)}×</span>
          <input
            type="range"
            className="spine-range"
            min={0.05}
            max={2}
            step={0.05}
            value={sceneScale}
            onChange={(e) => setSceneScale(Number(e.target.value))}
          />
        </label>
        {placeholdersPanel}
      </div>
    )
  }

  return (
    <div
      className={`spine-controls${canvasDragPickActive ? ' is-canvas-drag-pick' : ''}`}
      data-spine-id={row.id}
      onPointerDownCapture={onPanelPointerDownCapture}
    >
      {placeholderPolicyBanner}
      {unknownAnimationsBanner}
      {pinnedBanner}
      <div className="spine-controls-head">
        <span className="spine-controls-title">{row.displayName}</span>
        <div className="spine-controls-head-right">
          <div className="spine-draw-order" role="group" aria-label="Draw order">
            <button
              type="button"
              className="spine-order-btn"
              onClick={drawToFront}
              title="Draw in front of other skeletons"
            >
              Front
            </button>
            <button
              type="button"
              className="spine-order-btn"
              onClick={drawToBack}
              title="Draw behind other skeletons"
            >
              Back
            </button>
          </div>
          <span className="spine-controls-badge">Skeleton</span>
        </div>
      </div>
      <div className="spine-controls-body">
        {worldPositionBlock}
        {boneOffsetBlock}
        <label className="spine-field">
          <span className="spine-field-label">Animation</span>
          <select
            className="spine-select"
            value={anim}
            disabled={transportLocked}
            onChange={(e) => onAnimChange(e.target.value)}
          >
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        {skinEntries.length > 0 && (
          <label className="spine-field">
            <span className="spine-field-label">Skin</span>
            <select
              className="spine-select"
              value={skinSelect}
              disabled={transportLocked}
              onChange={(e) => onSkinChange(e.target.value)}
            >
              <option value="">Default skin</option>
              {skinEntries.map((e) => (
                <option key={e.index} value={String(e.index)}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="spine-toolbar">
          <button
            type="button"
            className="btn btn-sm primary"
            onClick={play}
            disabled={transportLocked || playing}
          >
            Play
          </button>
          <button type="button" className="btn btn-sm" onClick={pause} disabled={transportLocked || !playing}>
            Pause
          </button>
          <button type="button" className="btn btn-sm" onClick={restart} disabled={transportLocked}>
            Restart
          </button>
        </div>

        <label className="spine-field spine-field-inline">
          <input
            type="checkbox"
            disabled={transportLocked}
            checked={loop}
            onChange={(e) => onLoopChange(e.target.checked)}
          />
          <span>Loop</span>
        </label>

        <label className="spine-field">
          <span className="spine-field-label">Speed {speed.toFixed(2)}×</span>
          <input
            type="range"
            className="spine-range"
            min={0.5}
            max={2}
            step={0.05}
            value={speed}
            disabled={transportLocked}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
        </label>

        {trackDuration > 0 && (
          <label className="spine-field spine-field-block">
            <span className="spine-field-label">
              Time {scrubTime.toFixed(2)}s / {trackDuration.toFixed(2)}s
            </span>
            <input
              type="range"
              className="spine-range spine-range-wide"
              min={0}
              max={trackDuration}
              step={0.001}
              value={Math.min(scrubTime, trackDuration)}
              disabled={transportLocked}
              onChange={(e) => applyScrub(Number(e.target.value))}
            />
          </label>
        )}

        {slotNames.length > 0 && (
          <details className="spine-slots-block">
            <summary className="spine-slots-summary">Slots ({slotNames.length})</summary>
            <div className="spine-slots-scroll">
              {[...slotNames].sort().map((sn) => (
                <label key={sn} className="spine-slot-row">
                  <input
                    type="checkbox"
                    disabled={transportLocked}
                    checked={!hiddenSlots.has(sn)}
                    onChange={(e) => onSlotVisibleChange(sn, e.target.checked)}
                  />
                  <span className="spine-slot-name" title={sn}>
                    {sn}
                  </span>
                </label>
              ))}
            </div>
          </details>
        )}

        <label className="spine-field">
          <span className="spine-field-label">Canvas scale {sceneScale.toFixed(2)}×</span>
          <input
            type="range"
            className="spine-range"
            min={0.05}
            max={2}
            step={0.05}
            value={sceneScale}
            onChange={(e) => setSceneScale(Number(e.target.value))}
          />
        </label>
      </div>
      {placeholdersPanel}
    </div>
  )
})
