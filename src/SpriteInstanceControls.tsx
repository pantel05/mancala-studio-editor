import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import type { PixiStageHandle } from './PixiStage'
import type { NineSliceInsets, SpriteRow } from './SpriteRow'
import { defaultNineSliceInsets } from './pixi/spriteLayer'
// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function parseCoord(raw: string): number | null {
  const t = raw.trim().replace(/\s*(px|°|%)\s*$/i, '').replace(',', '.').trim()
  if (t === '' || t === '-' || t === '—') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/**
 * Click-drag scrub for a single numeric axis.
 * Same interaction model as the Spine inspector.
 */
function snapTo(v: number, step: number): number {
  return Math.round(v / step) * step
}

function useAxisScrub(
  disabled: boolean,
  onBegin: () => { value: number; companion: number } | null,
  onChange: (newValue: number, companion: number) => void,
  onEditBegin: (() => void) | undefined,
  onEditEnd: ((committed: boolean) => void) | undefined,
  sensitivity = 1,
  snapStep = 0.5,
) {
  const scrubRef = useRef<{
    startX: number
    startValue: number
    companion: number
    active: boolean
    pointerId: number
  } | null>(null)
  const [isScrubbing, setIsScrubbing] = useState(false)

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
      const rawDelta = e.clientX - s.startX
      if (!s.active && Math.abs(rawDelta) < 3) return
      if (!s.active) {
        s.active = true
        onEditBeginRef.current?.()
        setIsScrubbing(true)
        document.body.style.cursor = 'ew-resize'
        document.body.style.userSelect = 'none'
      }
      onChangeRef.current(snapTo(s.startValue + rawDelta * sensitivity, snapStep), s.companion)
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

// ---------------------------------------------------------------------------
// Live position readout (RAF loop while inspector is open)
// ---------------------------------------------------------------------------

function useLiveSpritePosition(
  row: SpriteRow,
  viewportStageRef: RefObject<PixiStageHandle | null> | undefined,
  inspectorActive: boolean,
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
      const pos = viewportStageRef.current?.getSpriteWorldPosition(row.sprite)
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
  }, [inspectorActive, viewportStageRef, row.sprite, pauseLiveReadout])

  return labels
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SpriteInstanceControls({
  row,
  viewportStageRef,
  canvasDragPickActive,
  onToggleCanvasDragPick,
  inspectorActive = false,
  onEditBegin,
  onEditEnd,
  onNineSliceToggle,
}: {
  row: SpriteRow
  viewportStageRef?: RefObject<PixiStageHandle | null>
  canvasDragPickActive?: boolean
  onToggleCanvasDragPick?: () => void
  inspectorActive?: boolean
  /** Capture snapshot before any property change (undo). */
  onEditBegin?: () => void
  /** After property change attempt. */
  onEditEnd?: (committed: boolean) => void
  /** Called after 9-slice is toggled on or off (enables/disables canvas guides). */
  onNineSliceToggle?: (enabled: boolean, row: SpriteRow) => void
}) {
  // ── Local state mirroring the Sprite properties ──────────────────────────
  const [scaleLinked, setScaleLinked] = useState(true)
  const scaleLinkedRef = useRef(scaleLinked)
  scaleLinkedRef.current = scaleLinked
  /** Ratio Y/X (or X/Y) captured at the start of a scrub drag, for proportional scaling. */
  const scaleLinkedRatioRef = useRef(1)

  const [scaleX, setScaleX] = useState(() => row.sprite.scale.x)
  const [scaleY, setScaleY] = useState(() => row.sprite.scale.y)
  const [rotationDeg, setRotationDeg] = useState(() =>
    Math.round((row.sprite.rotation * 180) / Math.PI * 10) / 10,
  )
  const [opacity, setOpacity] = useState(() => Math.round(row.sprite.alpha * 100))

  // Reset local state when the selected row changes
  useEffect(() => {
    setScaleX(row.sprite.scale.x)
    setScaleY(row.sprite.scale.y)
    setRotationDeg(Math.round((row.sprite.rotation * 180) / Math.PI * 10) / 10)
    setOpacity(Math.round(row.sprite.alpha * 100))
  }, [row.id, row.sprite])

  // Sync local state → Pixi Sprite (only when NOT in 9-slice mode)
  useEffect(() => { if (!row.nineSlice) row.sprite.scale.x = scaleX }, [scaleX, row.sprite, row.nineSlice])
  useEffect(() => { if (!row.nineSlice) row.sprite.scale.y = scaleY }, [scaleY, row.sprite, row.nineSlice])
  useEffect(() => { row.sprite.rotation = (rotationDeg * Math.PI) / 180 }, [rotationDeg, row.sprite])
  useEffect(() => { row.sprite.alpha = opacity / 100 }, [opacity, row.sprite])

  // ── 9-slice state ─────────────────────────────────────────────────────────
  const [nineSliceEnabled, setNineSliceEnabled] = useState(() => row.nineSlice)
  const [insets, setInsets] = useState<NineSliceInsets>(() => ({ ...row.nineSliceInsets }))
  // Width/Height in pixels (for 9-slice mode)
  const [sliceWidth, setSliceWidth] = useState(() => row.sprite.width)
  const [sliceHeight, setSliceHeight] = useState(() => row.sprite.height)
  // Proportional link for width/height
  const [sizeLinked, setSizeLinked] = useState(true)
  const sizeLinkedRef = useRef(sizeLinked)
  sizeLinkedRef.current = sizeLinked
  const sizeLinkedRatioRef = useRef(1)

  // Reset 9-slice state when the selected row changes (different id)
  useEffect(() => {
    setNineSliceEnabled(row.nineSlice)
    setInsets({ ...row.nineSliceInsets })
    setSliceWidth(row.sprite.width)
    setSliceHeight(row.sprite.height)
  }, [row.id, row.sprite, row.nineSlice, row.nineSliceInsets])

  // Sync insets from the row object when the row REFERENCE changes but the id
  // stays the same (happens after a canvas guide drag end triggers setSpriteRows
  // in App.tsx, creating a new spread copy of the row with updated nineSliceInsets).
  const prevRowRef = useRef(row)
  useEffect(() => {
    if (prevRowRef.current !== row && prevRowRef.current.id === row.id) {
      setInsets({ ...row.nineSliceInsets })
    }
    prevRowRef.current = row
  }, [row])

  // Sync width/height → NineSliceSprite
  useEffect(() => {
    if (!nineSliceEnabled) return
    row.sprite.width = sliceWidth
  }, [sliceWidth, nineSliceEnabled, row.sprite])
  useEffect(() => {
    if (!nineSliceEnabled) return
    row.sprite.height = sliceHeight
  }, [sliceHeight, nineSliceEnabled, row.sprite])

  const handleToggleNineSlice = useCallback(() => {
    const stage = viewportStageRef?.current
    if (!stage) return
    onEditBegin?.()
    if (!nineSliceEnabled) {
      // Compute sensible default insets from texture size
      const texW = row.sprite.texture?.width ?? row.sprite.width
      const texH = row.sprite.texture?.height ?? row.sprite.height
      const defaultInsets = defaultNineSliceInsets(texW, texH)
      const newInsets: NineSliceInsets = {
        left:   Math.min(row.nineSliceInsets.left,   Math.floor(texW / 3)),
        top:    Math.min(row.nineSliceInsets.top,    Math.floor(texH / 3)),
        right:  Math.min(row.nineSliceInsets.right,  Math.floor(texW / 3)),
        bottom: Math.min(row.nineSliceInsets.bottom, Math.floor(texH / 3)),
      }
      // If all insets are still the uninitialised default, use auto
      if (newInsets.left === 10 && newInsets.top === 10) Object.assign(newInsets, defaultInsets)
      const w = row.sprite.width
      const h = row.sprite.height
      row.nineSliceInsets = newInsets
      stage.enableNineSlice(row, newInsets)
      row.nineSlice = true
      setInsets(newInsets)
      setSliceWidth(w)
      setSliceHeight(h)
      onNineSliceToggle?.(true, row)
    } else {
      stage.disableNineSlice(row)
      row.nineSlice = false
      // Reset scale to 1 so the sprite appears at natural texture size
      setScaleX(row.sprite.scale.x)
      setScaleY(row.sprite.scale.y)
      onNineSliceToggle?.(false, row)
    }
    setNineSliceEnabled((v) => !v)
    onEditEnd?.(true)
  }, [nineSliceEnabled, row, viewportStageRef, onEditBegin, onEditEnd, onNineSliceToggle])

  const applyInsets = useCallback((newInsets: NineSliceInsets) => {
    const stage = viewportStageRef?.current
    if (!stage) return
    row.nineSliceInsets = newInsets
    stage.updateNineSliceInsets(row, newInsets)
    setInsets(newInsets)
  }, [row, viewportStageRef])

  // ── World position edit state ─────────────────────────────────────────────
  const [posEdit, setPosEdit] = useState<null | { axis: 'x' | 'y'; draft: string }>(null)
  const posEditRef = useRef(posEdit)
  posEditRef.current = posEdit
  const posInputRef = useRef<HTMLInputElement | null>(null)
  const skipPosBlurRef = useRef(false)

  useEffect(() => { setPosEdit(null) }, [row.id])

  const posLabels = useLiveSpritePosition(row, viewportStageRef, inspectorActive, Boolean(posEdit))

  useLayoutEffect(() => {
    if (!posEdit) return
    const el = posInputRef.current
    el?.focus()
    el?.select()
  }, [posEdit?.axis])

  // ── Scrub handlers ────────────────────────────────────────────────────────
  const disabled = row.locked

  const posXScrub = useAxisScrub(
    disabled,
    () => {
      const pos = viewportStageRef?.current?.getSpriteWorldPosition(row.sprite)
      return pos ? { value: pos.x, companion: pos.y } : null
    },
    (newX, frozenY) => { viewportStageRef?.current?.setSpriteWorldPosition(row.sprite, newX, frozenY) },
    onEditBegin,
    onEditEnd,
  )

  const posYScrub = useAxisScrub(
    disabled,
    () => {
      const pos = viewportStageRef?.current?.getSpriteWorldPosition(row.sprite)
      return pos ? { value: pos.y, companion: pos.x } : null
    },
    (newY, frozenX) => { viewportStageRef?.current?.setSpriteWorldPosition(row.sprite, frozenX, newY) },
    onEditBegin,
    onEditEnd,
  )

  const scaleXScrub = useAxisScrub(
    disabled,
    () => {
      const sx = row.sprite.scale.x
      const sy = row.sprite.scale.y
      scaleLinkedRatioRef.current = sx !== 0 ? sy / sx : 1
      return { value: sx, companion: sy }
    },
    (newVal) => {
      const clamped = Math.max(0.01, newVal)
      onEditBegin?.()
      setScaleX(clamped)
      if (scaleLinkedRef.current) setScaleY(Math.max(0.01, clamped * scaleLinkedRatioRef.current))
      onEditEnd?.(true)
    },
    undefined,
    undefined,
    0.01,
    0.1,
  )

  const scaleYScrub = useAxisScrub(
    disabled,
    () => {
      const sx = row.sprite.scale.x
      const sy = row.sprite.scale.y
      scaleLinkedRatioRef.current = sy !== 0 ? sx / sy : 1
      return { value: sy, companion: sx }
    },
    (newVal) => {
      const clamped = Math.max(0.01, newVal)
      onEditBegin?.()
      setScaleY(clamped)
      if (scaleLinkedRef.current) setScaleX(Math.max(0.01, clamped * scaleLinkedRatioRef.current))
      onEditEnd?.(true)
    },
    undefined,
    undefined,
    0.01,
    0.1,
  )

  const rotScrub = useAxisScrub(
    disabled,
    () => ({ value: rotationDeg, companion: 0 }),
    (newVal) => { onEditBegin?.(); setRotationDeg(newVal); onEditEnd?.(true) },
    undefined,
    undefined,
    1,
  )

  const sliceWidthScrub = useAxisScrub(
    disabled,
    () => {
      const w = row.sprite.width
      const h = row.sprite.height
      sizeLinkedRatioRef.current = w !== 0 ? h / w : 1
      return { value: w, companion: h }
    },
    (newVal) => {
      const clamped = Math.max(1, newVal)
      onEditBegin?.()
      setSliceWidth(clamped)
      if (sizeLinkedRef.current) setSliceHeight(Math.max(1, clamped * sizeLinkedRatioRef.current))
      onEditEnd?.(true)
    },
    undefined,
    undefined,
    1,
    1,
  )

  const sliceHeightScrub = useAxisScrub(
    disabled,
    () => {
      const w = row.sprite.width
      const h = row.sprite.height
      sizeLinkedRatioRef.current = h !== 0 ? w / h : 1
      return { value: h, companion: w }
    },
    (newVal) => {
      const clamped = Math.max(1, newVal)
      onEditBegin?.()
      setSliceHeight(clamped)
      if (sizeLinkedRef.current) setSliceWidth(Math.max(1, clamped * sizeLinkedRatioRef.current))
      onEditEnd?.(true)
    },
    undefined,
    undefined,
    1,
    1,
  )

  // ── Position double-click edit ─────────────────────────────────────────────
  const beginEditPosAxis = useCallback(
    (axis: 'x' | 'y') => {
      if (disabled) return
      const pos = viewportStageRef?.current?.getSpriteWorldPosition(row.sprite)
      if (!pos) return
      setPosEdit({ axis, draft: (axis === 'x' ? pos.x : pos.y).toFixed(1) })
    },
    [disabled, viewportStageRef, row.sprite],
  )

  const commitPosEdit = useCallback(() => {
    const cur = posEditRef.current
    if (!cur) return
    const stage = viewportStageRef?.current
    const pos = stage?.getSpriteWorldPosition(row.sprite)
    if (!stage || !pos) { setPosEdit(null); return }
    const v = parseCoord(cur.draft)
    if (v === null) { setPosEdit(null); return }
    const nx = cur.axis === 'x' ? v : pos.x
    const ny = cur.axis === 'y' ? v : pos.y
    onEditBegin?.()
    const ok = stage.setSpriteWorldPosition(row.sprite, nx, ny)
    onEditEnd?.(ok)
    setPosEdit(null)
  }, [viewportStageRef, row.sprite, onEditBegin, onEditEnd])

  const onPosKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') { e.preventDefault(); skipPosBlurRef.current = true; commitPosEdit() }
      else if (e.key === 'Escape') { e.preventDefault(); skipPosBlurRef.current = true; setPosEdit(null) }
    },
    [commitPosEdit],
  )

  const onPosBlur = useCallback(() => {
    if (skipPosBlurRef.current) { skipPosBlurRef.current = false; return }
    commitPosEdit()
  }, [commitPosEdit])

  // ── Inline edit helpers for Scale X/Y, Rotation, and 9-slice Width/Height ─
  const [scaleXEdit, setScaleXEdit] = useState<string | null>(null)
  const [scaleYEdit, setScaleYEdit] = useState<string | null>(null)
  const [rotEdit, setRotEdit] = useState<string | null>(null)
  const [sliceWEdit, setSliceWEdit] = useState<string | null>(null)
  const [sliceHEdit, setSliceHEdit] = useState<string | null>(null)

  useEffect(() => { setScaleXEdit(null); setScaleYEdit(null); setRotEdit(null); setSliceWEdit(null); setSliceHEdit(null) }, [row.id])

  const scaleXInputRef = useRef<HTMLInputElement | null>(null)
  const scaleYInputRef = useRef<HTMLInputElement | null>(null)
  const rotInputRef = useRef<HTMLInputElement | null>(null)
  const sliceWInputRef = useRef<HTMLInputElement | null>(null)
  const sliceHInputRef = useRef<HTMLInputElement | null>(null)
  const skipScaleXBlur = useRef(false)
  const skipScaleYBlur = useRef(false)
  const skipRotBlur = useRef(false)
  const skipSliceWBlur = useRef(false)
  const skipSliceHBlur = useRef(false)

  useLayoutEffect(() => { if (scaleXEdit !== null) { scaleXInputRef.current?.focus(); scaleXInputRef.current?.select() } }, [scaleXEdit !== null]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { if (scaleYEdit !== null) { scaleYInputRef.current?.focus(); scaleYInputRef.current?.select() } }, [scaleYEdit !== null]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { if (rotEdit !== null) { rotInputRef.current?.focus(); rotInputRef.current?.select() } }, [rotEdit !== null]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { if (sliceWEdit !== null) { sliceWInputRef.current?.focus(); sliceWInputRef.current?.select() } }, [sliceWEdit !== null]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { if (sliceHEdit !== null) { sliceHInputRef.current?.focus(); sliceHInputRef.current?.select() } }, [sliceHEdit !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  const commitScaleX = useCallback(() => {
    if (scaleXEdit === null) return
    const v = parseCoord(scaleXEdit)
    if (v !== null) {
      const clamped = Math.max(0.01, v)
      onEditBegin?.()
      setScaleX(clamped)
      if (scaleLinked && scaleX !== 0) setScaleY(Math.max(0.01, clamped * (scaleY / scaleX)))
      onEditEnd?.(true)
    }
    setScaleXEdit(null)
  }, [scaleXEdit, scaleLinked, scaleX, scaleY, onEditBegin, onEditEnd])

  const commitScaleY = useCallback(() => {
    if (scaleYEdit === null) return
    const v = parseCoord(scaleYEdit)
    if (v !== null) {
      const clamped = Math.max(0.01, v)
      onEditBegin?.()
      setScaleY(clamped)
      if (scaleLinked && scaleY !== 0) setScaleX(Math.max(0.01, clamped * (scaleX / scaleY)))
      onEditEnd?.(true)
    }
    setScaleYEdit(null)
  }, [scaleYEdit, scaleLinked, scaleX, scaleY, onEditBegin, onEditEnd])

  const commitRot = useCallback(() => {
    if (rotEdit === null) return
    const v = parseCoord(rotEdit)
    if (v !== null) { onEditBegin?.(); setRotationDeg(v); onEditEnd?.(true) }
    setRotEdit(null)
  }, [rotEdit, onEditBegin, onEditEnd])

  const commitSliceW = useCallback(() => {
    if (sliceWEdit === null) return
    const v = parseCoord(sliceWEdit)
    if (v !== null) {
      const clamped = Math.max(1, Math.round(v))
      onEditBegin?.()
      setSliceWidth(clamped)
      if (sizeLinked && sliceWidth !== 0) setSliceHeight(Math.max(1, Math.round(clamped * (sliceHeight / sliceWidth))))
      onEditEnd?.(true)
    }
    setSliceWEdit(null)
  }, [sliceWEdit, sizeLinked, sliceWidth, sliceHeight, onEditBegin, onEditEnd])

  const commitSliceH = useCallback(() => {
    if (sliceHEdit === null) return
    const v = parseCoord(sliceHEdit)
    if (v !== null) {
      const clamped = Math.max(1, Math.round(v))
      onEditBegin?.()
      setSliceHeight(clamped)
      if (sizeLinked && sliceHeight !== 0) setSliceWidth(Math.max(1, Math.round(clamped * (sliceWidth / sliceHeight))))
      onEditEnd?.(true)
    }
    setSliceHEdit(null)
  }, [sliceHEdit, sizeLinked, sliceWidth, sliceHeight, onEditBegin, onEditEnd])

  const onPanelPointerDownCapture = useCallback(
    (e: { button: number; target: EventTarget | null }) => {
      if (e.button !== 0 || !onToggleCanvasDragPick) return
      const target = e.target
      if (target instanceof Element && target.closest('button, input, select, textarea, .sprite-field')) return
      onToggleCanvasDragPick()
    },
    [onToggleCanvasDragPick],
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  const posReadoutTitle = disabled
    ? 'Unavailable while locked.'
    : 'Scene units (same as grid). Drag to scrub · Double-click to type. Snaps to 0.5 px.'

  return (
    <div
      className={`sprite-controls${canvasDragPickActive ? ' is-canvas-drag-pick' : ''}`}
      data-sprite-id={row.id}
      onPointerDownCapture={onPanelPointerDownCapture}
    >
      {/* Header */}
      <div className="sprite-controls-head">
        <span className="sprite-controls-title">{row.displayName}</span>
        <span className="sprite-controls-badge">Image</span>
      </div>

      <div className="sprite-controls-body">
        {/* World Position */}
        <div className="sprite-field sprite-world-position-field">
          <span className="sprite-field-label">World position</span>
          <div className="sprite-world-position-values" aria-live="polite" title={posReadoutTitle}>
            {posEdit?.axis === 'x' ? (
              <label className="spine-world-position-edit">
                <span className="spine-world-position-axis-label">X</span>
                <input
                  ref={posInputRef}
                  type="text"
                  inputMode="decimal"
                  className="spine-world-position-input"
                  value={posEdit.draft}
                  onChange={(e) => setPosEdit((w) => w && w.axis === 'x' ? { ...w, draft: e.target.value } : w)}
                  onBlur={onPosBlur}
                  onKeyDown={onPosKeyDown}
                  aria-label="World position X"
                />
                <span className="spine-world-position-unit"> px</span>
              </label>
            ) : (
              <span
                role="button"
                tabIndex={disabled ? -1 : 0}
                className="spine-world-position-readout"
                onDoubleClick={() => beginEditPosAxis('x')}
                onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); beginEditPosAxis('x') } }}
                onPointerDown={posXScrub.handlePointerDown}
                onPointerMove={posXScrub.handlePointerMove}
                onPointerUp={posXScrub.handlePointerUp}
                onPointerCancel={posXScrub.handlePointerCancel}
                title={disabled ? undefined : 'Drag to scrub · Double-click to type'}
              >
                X {posLabels.x}
              </span>
            )}
            {posEdit?.axis === 'y' ? (
              <label className="spine-world-position-edit">
                <span className="spine-world-position-axis-label">Y</span>
                <input
                  ref={posInputRef}
                  type="text"
                  inputMode="decimal"
                  className="spine-world-position-input"
                  value={posEdit.draft}
                  onChange={(e) => setPosEdit((w) => w && w.axis === 'y' ? { ...w, draft: e.target.value } : w)}
                  onBlur={onPosBlur}
                  onKeyDown={onPosKeyDown}
                  aria-label="World position Y"
                />
                <span className="spine-world-position-unit"> px</span>
              </label>
            ) : (
              <span
                role="button"
                tabIndex={disabled ? -1 : 0}
                className="spine-world-position-readout"
                onDoubleClick={() => beginEditPosAxis('y')}
                onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); beginEditPosAxis('y') } }}
                onPointerDown={posYScrub.handlePointerDown}
                onPointerMove={posYScrub.handlePointerMove}
                onPointerUp={posYScrub.handlePointerUp}
                onPointerCancel={posYScrub.handlePointerCancel}
                title={disabled ? undefined : 'Drag to scrub · Double-click to type'}
              >
                Y {posLabels.y}
              </span>
            )}
          </div>
        </div>

        {/* Scale X/Y — hidden when 9-slice is active */}
        {!nineSliceEnabled && <div className="sprite-field sprite-scale-field">
          <span className="sprite-field-label">Scale</span>
          <div className="sprite-scale-values">
            {/* Scale X */}
            {scaleXEdit !== null ? (
              <label className="spine-world-position-edit">
                <span className="spine-world-position-axis-label">X</span>
                <input
                  ref={scaleXInputRef}
                  type="text"
                  inputMode="decimal"
                  className="spine-world-position-input"
                  value={scaleXEdit}
                  onChange={(e) => setScaleXEdit(e.target.value)}
                  onBlur={() => { if (skipScaleXBlur.current) { skipScaleXBlur.current = false; return } commitScaleX() }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); skipScaleXBlur.current = true; commitScaleX() } else if (e.key === 'Escape') { e.preventDefault(); skipScaleXBlur.current = true; setScaleXEdit(null) } }}
                />
              </label>
            ) : (
              <span
                role="button"
                tabIndex={disabled ? -1 : 0}
                className="spine-world-position-readout"
                onDoubleClick={() => !disabled && setScaleXEdit(scaleX.toFixed(3))}
                onPointerDown={scaleXScrub.handlePointerDown}
                onPointerMove={scaleXScrub.handlePointerMove}
                onPointerUp={scaleXScrub.handlePointerUp}
                onPointerCancel={scaleXScrub.handlePointerCancel}
                title={disabled ? undefined : 'Drag to scrub · Double-click to type'}
              >
                X {scaleX.toFixed(3)}
              </span>
            )}

            {/* Scale Y */}
            {scaleYEdit !== null ? (
              <label className="spine-world-position-edit">
                <span className="spine-world-position-axis-label">Y</span>
                <input
                  ref={scaleYInputRef}
                  type="text"
                  inputMode="decimal"
                  className="spine-world-position-input"
                  value={scaleYEdit}
                  onChange={(e) => setScaleYEdit(e.target.value)}
                  onBlur={() => { if (skipScaleYBlur.current) { skipScaleYBlur.current = false; return } commitScaleY() }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); skipScaleYBlur.current = true; commitScaleY() } else if (e.key === 'Escape') { e.preventDefault(); skipScaleYBlur.current = true; setScaleYEdit(null) } }}
                />
              </label>
            ) : (
              <span
                role="button"
                tabIndex={disabled ? -1 : 0}
                className="spine-world-position-readout"
                onDoubleClick={() => !disabled && setScaleYEdit(scaleY.toFixed(3))}
                onPointerDown={scaleYScrub.handlePointerDown}
                onPointerMove={scaleYScrub.handlePointerMove}
                onPointerUp={scaleYScrub.handlePointerUp}
                onPointerCancel={scaleYScrub.handlePointerCancel}
                title={disabled ? undefined : 'Drag to scrub · Double-click to type'}
              >
                Y {scaleY.toFixed(3)}
              </span>
            )}

            {/* Proportional link toggle */}
            <button
              type="button"
              className={`sprite-scale-link${scaleLinked ? ' is-linked' : ''}`}
              onClick={() => setScaleLinked((v) => !v)}
              title={scaleLinked ? 'Proportional scaling on — click to unlock' : 'Proportional scaling off — click to lock'}
              aria-pressed={scaleLinked}
              aria-label="Toggle proportional scale"
            >
              <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {scaleLinked ? (
                  <>
                    <path d="M6.5 9.5a3 3 0 0 0 4.243 0l1.414-1.414a3 3 0 0 0-4.243-4.243L6.5 5.257"/>
                    <path d="M9.5 6.5a3 3 0 0 0-4.243 0L3.843 7.914a3 3 0 0 0 4.243 4.243L9.5 10.743"/>
                  </>
                ) : (
                  <>
                    <path d="M6.5 9.5a3 3 0 0 0 4.243 0l1.414-1.414a3 3 0 0 0-4.243-4.243L6.5 5.257" strokeOpacity="0.35"/>
                    <path d="M9.5 6.5a3 3 0 0 0-4.243 0L3.843 7.914a3 3 0 0 0 4.243 4.243L9.5 10.743" strokeOpacity="0.35"/>
                    <line x1="10" y1="6" x2="13" y2="3" strokeOpacity="0.7"/>
                    <line x1="12" y1="4" x2="13" y2="3" strokeOpacity="0.7"/>
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>}

        {/* Width/Height — shown only when 9-slice is active */}
        {nineSliceEnabled && <div className="sprite-field sprite-scale-field">
          <span className="sprite-field-label">Size (px)</span>
          <div className="sprite-scale-values">
            {/* Width */}
            {sliceWEdit !== null ? (
              <label className="spine-world-position-edit">
                <span className="spine-world-position-axis-label">W</span>
                <input
                  ref={sliceWInputRef}
                  type="text"
                  inputMode="decimal"
                  className="spine-world-position-input"
                  value={sliceWEdit}
                  onChange={(e) => setSliceWEdit(e.target.value)}
                  onBlur={() => { if (skipSliceWBlur.current) { skipSliceWBlur.current = false; return } commitSliceW() }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); skipSliceWBlur.current = true; commitSliceW() } else if (e.key === 'Escape') { e.preventDefault(); skipSliceWBlur.current = true; setSliceWEdit(null) } }}
                />
              </label>
            ) : (
              <span
                role="button"
                tabIndex={disabled ? -1 : 0}
                className="spine-world-position-readout"
                onDoubleClick={() => !disabled && setSliceWEdit(String(Math.round(sliceWidth)))}
                onPointerDown={sliceWidthScrub.handlePointerDown}
                onPointerMove={sliceWidthScrub.handlePointerMove}
                onPointerUp={sliceWidthScrub.handlePointerUp}
                onPointerCancel={sliceWidthScrub.handlePointerCancel}
                title={disabled ? undefined : 'Drag to scrub · Double-click to type'}
              >
                W {Math.round(sliceWidth)}
              </span>
            )}
            {/* Height */}
            {sliceHEdit !== null ? (
              <label className="spine-world-position-edit">
                <span className="spine-world-position-axis-label">H</span>
                <input
                  ref={sliceHInputRef}
                  type="text"
                  inputMode="decimal"
                  className="spine-world-position-input"
                  value={sliceHEdit}
                  onChange={(e) => setSliceHEdit(e.target.value)}
                  onBlur={() => { if (skipSliceHBlur.current) { skipSliceHBlur.current = false; return } commitSliceH() }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); skipSliceHBlur.current = true; commitSliceH() } else if (e.key === 'Escape') { e.preventDefault(); skipSliceHBlur.current = true; setSliceHEdit(null) } }}
                />
              </label>
            ) : (
              <span
                role="button"
                tabIndex={disabled ? -1 : 0}
                className="spine-world-position-readout"
                onDoubleClick={() => !disabled && setSliceHEdit(String(Math.round(sliceHeight)))}
                onPointerDown={sliceHeightScrub.handlePointerDown}
                onPointerMove={sliceHeightScrub.handlePointerMove}
                onPointerUp={sliceHeightScrub.handlePointerUp}
                onPointerCancel={sliceHeightScrub.handlePointerCancel}
                title={disabled ? undefined : 'Drag to scrub · Double-click to type'}
              >
                H {Math.round(sliceHeight)}
              </span>
            )}
            {/* Proportional size link */}
            <button
              type="button"
              className={`sprite-scale-link${sizeLinked ? ' is-linked' : ''}`}
              onClick={() => setSizeLinked((v) => !v)}
              title={sizeLinked ? 'Proportional size on — click to unlock' : 'Proportional size off — click to lock'}
              aria-pressed={sizeLinked}
              aria-label="Toggle proportional size"
            >
              <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {sizeLinked ? (
                  <>
                    <path d="M6.5 9.5a3 3 0 0 0 4.243 0l1.414-1.414a3 3 0 0 0-4.243-4.243L6.5 5.257"/>
                    <path d="M9.5 6.5a3 3 0 0 0-4.243 0L3.843 7.914a3 3 0 0 0 4.243 4.243L9.5 10.743"/>
                  </>
                ) : (
                  <>
                    <path d="M6.5 9.5a3 3 0 0 0 4.243 0l1.414-1.414a3 3 0 0 0-4.243-4.243L6.5 5.257" strokeOpacity="0.35"/>
                    <path d="M9.5 6.5a3 3 0 0 0-4.243 0L3.843 7.914a3 3 0 0 0 4.243 4.243L9.5 10.743" strokeOpacity="0.35"/>
                    <line x1="10" y1="6" x2="13" y2="3" strokeOpacity="0.7"/>
                    <line x1="12" y1="4" x2="13" y2="3" strokeOpacity="0.7"/>
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>}

        {/* Rotation */}
        <div className="sprite-field">
          <span className="sprite-field-label">Rotation</span>
          {rotEdit !== null ? (
            <label className="spine-world-position-edit sprite-rotation-edit">
              <input
                ref={rotInputRef}
                type="text"
                inputMode="decimal"
                className="spine-world-position-input"
                value={rotEdit}
                onChange={(e) => setRotEdit(e.target.value)}
                onBlur={() => { if (skipRotBlur.current) { skipRotBlur.current = false; return } commitRot() }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); skipRotBlur.current = true; commitRot() } else if (e.key === 'Escape') { e.preventDefault(); skipRotBlur.current = true; setRotEdit(null) } }}
                aria-label="Rotation in degrees"
              />
              <span className="spine-world-position-unit">°</span>
            </label>
          ) : (
            <span
              role="button"
              tabIndex={disabled ? -1 : 0}
              className="spine-world-position-readout sprite-rotation-readout"
              onDoubleClick={() => !disabled && setRotEdit(rotationDeg.toFixed(1))}
              onPointerDown={rotScrub.handlePointerDown}
              onPointerMove={rotScrub.handlePointerMove}
              onPointerUp={rotScrub.handlePointerUp}
              onPointerCancel={rotScrub.handlePointerCancel}
              title={disabled ? undefined : 'Drag to scrub · Double-click to type'}
            >
              {rotationDeg.toFixed(1)}°
            </span>
          )}
        </div>

        {/* 9-Slice toggle + insets */}
        <div className="sprite-field sprite-nineslice-row">
          <label className="sprite-nineslice-toggle">
            <input
              type="checkbox"
              checked={nineSliceEnabled}
              disabled={disabled}
              onChange={handleToggleNineSlice}
            />
            <span>9-slice</span>
          </label>
          {nineSliceEnabled && (
            <div className="sprite-nineslice-insets" title="Corner insets in source texture pixels">
              {(['left', 'top', 'right', 'bottom'] as const).map((side) => (
                <label key={side} className="sprite-nineslice-inset-field">
                  <span className="sprite-nineslice-inset-label">{side[0].toUpperCase()}</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    disabled={disabled}
                    className="sprite-nineslice-inset-input"
                    value={insets[side]}
                    onChange={(e) => {
                      const v = Math.max(0, Math.round(Number(e.target.value)))
                      if (!Number.isFinite(v)) return
                      onEditBegin?.()
                      const newInsets = { ...insets, [side]: v }
                      applyInsets(newInsets)
                      onEditEnd?.(true)
                    }}
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Opacity */}
        <label className="sprite-field">
          <span className="sprite-field-label">Opacity {opacity}%</span>
          <input
            type="range"
            className="spine-range"
            min={0}
            max={100}
            step={1}
            value={opacity}
            disabled={disabled}
            onChange={(e) => {
              onEditBegin?.()
              setOpacity(Number(e.target.value))
              onEditEnd?.(true)
            }}
          />
        </label>

        {/* Image info */}
        <div className="sprite-field sprite-source-info">
          <span className="sprite-field-label">Source</span>
          <span className="sprite-source-name" title={row.sourceFile.name}>{row.sourceFile.name}</span>
        </div>
      </div>
    </div>
  )
}
