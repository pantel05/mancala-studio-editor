import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { Application, Container, Graphics, Point, Sprite } from 'pixi.js'
import { Spine } from '@esotericsoftware/spine-pixi-v8'
import { attachSpineDrag, detachSpineDrag } from './pixi/attachSpineDrag'
import { attachSpriteDrag, createPixiSprite, addSpriteToWorld, destroyPixiSprite } from './pixi/spriteLayer'
import { attachSpineToHostPlaceholder } from './pixi/placeholderAttachment'
import {
  attachStageNavigation,
  paintBackdrop,
  type StageBackdropMode,
} from './pixi/stageBackdropAndNav'
import {
  paintSafeFrameOverlay,
  type SafeFramePreset,
} from './pixi/safeFrameOverlay'
import { snapWorldXY } from './pixi/snapWorldPosition'
import { applySpineOriginAtRootBone } from './pixi/spineBoundingOrigin'
import { paintWorldGrid, spineAnchorsInWorldSpace } from './pixi/worldGrid'
import {
  atlasTagForStemAndFile,
  atlasTagsForStem,
  filesByLowerName,
} from './spine/findAtlasForStem'
import { groupSpineFiles, type SpineFileGroup } from './spine/groupSpineFiles'
import { loadSpineFromFileGroup } from './spine/loadSpineFromFileGroup'
import { validateLoadedSkeletonPlaceholders } from './spine/validateLoadedSkeletonPlaceholders'
import type { ValidationIssue } from './spine/validateSpineSelection'
import { createWebGlDrawCallMeter, type WebGlDrawCallMeter } from './pixi/webglDrawCallMeter'

export type { StageBackdropMode }

export type StagePerformanceSnapshot = {
  fps: number
  frameMs: number
  /** WebGL draw calls last frame; `null` if not available (e.g. WebGPU / Canvas). */
  drawCalls: number | null
  rendererName: string
  resolution: number
  canvasPixelW: number
  canvasPixelH: number
  spineInstances: number
  visibleSpineInstances: number
  bonesTotal: number
  slotsTotal: number
  skinsTotal: number
  animationsTotal: number
  jsHeapUsedMb: string | null
  jsHeapTotalMb: string | null
}

export type LoadedSpineInstance = {
  id: string
  displayName: string
  spine: Spine
  /** Skeleton file from the import batch (for @1x / @2x atlas swap). */
  skeletonSourceFile: File
  /** Distinct atlas tags for this stem in the batch (`''` = `stem.atlas`). */
  atlasAvailableTags: string[]
  /** Which atlas variant was used for this instance. */
  activeAtlasTag: string
  /** Loaded despite invalid placeholder names — frozen until policy passes (see Bundle validation). */
  placeholderPolicyFrozen?: boolean
}

/** Minimal row data for parenting symbol spines under placeholder bones. */
export type PlaceholderReconcileRow = {
  id: string
  spine: Spine
  placeholderBindings: Record<string, string>
}

export type { SafeFramePreset }

export type PixiStageProps = {
  backdropMode?: StageBackdropMode
  /** World-space grid + axes at (0,0); Spine anchor markers at skeleton roots. */
  showWorldGrid?: boolean
  onStageViewChange?: (scale: number) => void
  /** Letterboxed device + inner safe rect in screen space (reference only). */
  safeFramePreset?: SafeFramePreset
  /** Increment when the set of Spine instances changes so hit targets are re-applied. */
  spineSceneRevision?: number
  /** Bump when a spine is swapped in-place (e.g. atlas @1x / @2x) so hit targets refresh. */
  atlasPreviewRevision?: number
  /** User clicked the stage backdrop (e.g. to clear canvas pick highlight). */
  onClearDragPointerTarget?: () => void
  /** Left-click on a skeleton on the canvas — sync hierarchy/inspector selection to that instance. */
  onSpineCanvasPointerDown?: (spine: Spine) => void
  /** Per-frame check: return false to block starting a drag (e.g. hierarchy lock). */
  getSpineDragEnabled?: (spine: Spine) => boolean
  /** Canvas drag began (for undo history). */
  onSpineDragStart?: () => void
  /** Canvas drag ended (for undo history). */
  onSpineDragEnd?: () => void
  /** Left-click on a sprite on the canvas — sync hierarchy/inspector selection to that instance. */
  onSpriteCanvasPointerDown?: (sprite: Sprite) => void
  /** Per-frame check: return false to block starting a sprite drag. */
  getSpriteDragEnabled?: (sprite: Sprite) => boolean
  /** Sprite canvas drag began (for undo history). */
  onSpriteDragStart?: () => void
  /** Sprite canvas drag ended (for undo history). */
  onSpriteDragEnd?: () => void
}

export type PixiStageHandle = {
  /**
   * Load Spine exports from local files (adds to the scene).
   * When `groups` is set, those pairs are loaded instead of re-running {@link groupSpineFiles} (e.g. after validation).
   */
  loadLocalFiles(
    files: File[],
    options?: { groups?: SpineFileGroup[]; allowedPlaceholderBoneNames?: string[] },
  ): Promise<{
    loaded: string[]
    errors: string[]
    notes: string[]
    newInstances: LoadedSpineInstance[]
    loadValidationIssues: ValidationIssue[]
  }>
  /** Remove all Spine instances from the canvas. */
  clearSpines(): void
  /** Remove and destroy one Spine (call after {@link reconcilePlaceholderAttachments} if it was nested). */
  removeSpine(spine: Spine): void
  /** Reset canvas zoom/pan (world transform). */
  resetStageView(): void
  /** Zoom and pan so every Spine instance fits inside the view with padding. */
  fitAllSpinesInView(): void
  /** Raise this skeleton above other spines (same world; debug overlay stays on top). */
  bringSpineToDrawFront(spine: Spine): void
  /** Lower this skeleton below other spines. */
  sendSpineToDrawBack(spine: Spine): void
  /**
   * Match Pixi z-order to sidebar order: first entry draws in front (top of hierarchy),
   * last draws behind (background among spines).
   */
  syncHierarchyDrawOrder(spinesTopIsFront: Spine[]): void
  /** Detach previous placeholder parents, then attach from current binding map. */
  reconcilePlaceholderAttachments(rows: PlaceholderReconcileRow[]): void
  /** Replace `oldSpine` in the world with `newSpine`, preserving transform and z-order. */
  swapSpineInstance(oldSpine: Spine, newSpine: Spine): void
  /** Live renderer / scene stats for the metrics overlay. */
  getPerformanceMetrics(): StagePerformanceSnapshot | null
  /** Placement anchor (Spine display origin) in **world** space — same units as the grid / axes. */
  getSpineWorldPosition(spine: Spine): { x: number; y: number } | null
  /** Map a viewport client position to world coordinates (see cursor readout). */
  clientToWorldXY(clientX: number, clientY: number): { x: number; y: number } | null
  /**
   * Move the skeleton so its placement origin is at world (x, y), snapped to the same 0.5 grid as canvas drag.
   * Works for direct children of `world` and for spines nested under placeholders.
   */
  setSpineWorldPlacementXY(spine: Spine, x: number, y: number): boolean
  /**
   * For a spine nested under a placeholder bone: directly set the bone-local offset (spine.position.x/y).
   * Snapped to 0.5. No-op for direct world children (use setSpineWorldPlacementXY instead).
   */
  setSpineBoneLocalOffset(spine: Spine, x: number, y: number): boolean
  /** Bone-local offset (spine.position.x/y) — meaningful only when the spine is nested under a placeholder. */
  getSpineBoneLocalOffset(spine: Spine): { x: number; y: number } | null

  // --- Sprite methods ---

  /** Load an image from an object URL, add it to the world container, and return the Sprite. */
  addSprite(objectUrl: string): Promise<Sprite>
  /** Remove a single sprite from the world and destroy it (also revokes objectUrl). */
  removeSprite(sprite: Sprite, objectUrl?: string): void
  /** Remove all sprites from the world and destroy them. */
  clearSprites(): void
  /** Sprite placement origin in **world** space. */
  getSpriteWorldPosition(sprite: Sprite): { x: number; y: number } | null
  /** Move sprite to world (x, y), snapped to 0.5 grid. */
  setSpriteWorldPosition(sprite: Sprite, x: number, y: number): boolean
  /**
   * Synchronise z-order for the full mixed-type layer list.
   * `order[0]` = front (top of hierarchy), last = back (background).
   */
  syncFullLayerOrder(order: Array<{ kind: 'spine' | 'sprite'; obj: Spine | Sprite }>): void
}

function bringOverlayToFront(world: Container, overlay: Graphics) {
  if (overlay.parent === world) {
    world.setChildIndex(overlay, world.children.length - 1)
  }
}

const OVERLAY_Z = 10_000

type StageScreenDim = { w: number; h: number }

/** Logical view size: prefer Pixi `screen`, fall back to host layout when still 0×0. */
function readStageViewSize(application: Application, host: HTMLElement): StageScreenDim | null {
  let w = application.screen.width
  let h = application.screen.height
  if (w <= 1 || h <= 1) {
    const cw = host.clientWidth
    const ch = host.clientHeight
    if (cw > 0 && ch > 0) {
      w = cw
      h = ch
    }
  }
  if (w <= 0 || h <= 0) {
    const c = application.canvas as HTMLCanvasElement
    if (c?.clientWidth > 0 && c?.clientHeight > 0) {
      w = c.clientWidth
      h = c.clientHeight
    }
  }
  if (w <= 0 || h <= 0) return null
  return { w, h }
}

/** Pointer (client) → renderer space → **world** local; mutates `out`. */
function mapClientToWorldXY(
  application: Application,
  world: Container,
  clientX: number,
  clientY: number,
  out: Point,
): void {
  application.renderer.events.mapPositionToPoint(out, clientX, clientY)
  world.toLocal(out, undefined, out)
}

/** Spine display origin → **world** local; mutates `out` (same basis as {@link getSpineWorldPosition}). */
function spineOriginToWorldXY(spine: Spine, world: Container, out: Point): void {
  spine.getGlobalPosition(out)
  world.toLocal(out, undefined, out)
}

/**
 * Positions `centerShell` so **world** local (0,0) appears at the **viewport center**.
 * `world` is a child of `centerShell`; pan/zoom stay on `world`.
 */
function syncViewportCenterShell(
  application: Application,
  host: HTMLElement,
  centerShell: Container,
  screenRef: { current: StageScreenDim },
): void {
  const sz = readStageViewSize(application, host)
  if (!sz) return
  const sw = sz.w
  const sh = sz.h
  const p = screenRef.current
  if (p.w <= 0 || p.h <= 0) {
    centerShell.position.set(sw / 2, sh / 2)
  } else {
    centerShell.x += (sw - p.w) / 2
    centerShell.y += (sh - p.h) / 2
  }
  screenRef.current = { w: sw, h: sh }
}

function maxSpineZIndex(world: Container): number {
  let m = -Infinity
  for (const c of world.children) {
    if (c instanceof Spine) m = Math.max(m, c.zIndex)
  }
  return Number.isFinite(m) ? m : 0
}

function minSpineZIndex(world: Container): number {
  let m = Infinity
  for (const c of world.children) {
    if (c instanceof Spine) m = Math.min(m, c.zIndex)
  }
  return Number.isFinite(m) ? m : 0
}

function applyBringSpineToDrawFront(world: Container, spine: Spine) {
  if (spine.parent !== world) return
  spine.zIndex = maxSpineZIndex(world) + 1
}

function applySendSpineToDrawBack(world: Container, spine: Spine) {
  if (spine.parent !== world) return
  spine.zIndex = minSpineZIndex(world) - 1
}

/** Every Spine stays hit-testable; cursor is driven from React (lock / unlock). */
function ensureAllSpinesInteractive(world: Container) {
  for (const c of world.children) {
    if (!(c instanceof Spine)) continue
    c.eventMode = 'dynamic'
  }
}

/** `order[0]` = top of hierarchy = highest zIndex (drawn in front). */
function applyHierarchyZOrder(world: Container, orderTopIsFront: Spine[]) {
  const n = orderTopIsFront.length
  for (let i = 0; i < n; i++) {
    const s = orderTopIsFront[i]
    if (s.parent !== world) continue
    s.zIndex = (n - 1 - i) * 10
  }
}

export const PixiStage = forwardRef<PixiStageHandle, PixiStageProps>(function PixiStage(
  {
    backdropMode = 'dark',
    showWorldGrid = true,
    onStageViewChange,
    safeFramePreset = 'off',
    spineSceneRevision = 0,
    atlasPreviewRevision = 0,
    onClearDragPointerTarget,
    onSpineCanvasPointerDown,
    getSpineDragEnabled,
    onSpineDragStart,
    onSpineDragEnd,
    onSpriteCanvasPointerDown,
    getSpriteDragEnabled,
    onSpriteDragStart,
    onSpriteDragEnd,
  },
  ref,
) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const worldRef = useRef<Container | null>(null)
  const centerShellRef = useRef<Container | null>(null)
  const backdropRef = useRef<Graphics | null>(null)
  const worldGridRef = useRef<Graphics | null>(null)
  const overlayRef = useRef<Graphics | null>(null)
  const safeFrameRef = useRef<Graphics | null>(null)
  const disposeNavRef = useRef<(() => void) | null>(null)
  const backdropModeRef = useRef(backdropMode)
  const showWorldGridRef = useRef(showWorldGrid)
  const onViewRef = useRef(onStageViewChange)
  const safeFramePresetRef = useRef(safeFramePreset)
  const drawMeterRef = useRef<WebGlDrawCallMeter | null>(null)
  /** Last known renderer logical size — keeps world origin pinned to viewport center on resize. */
  const stageScreenSizeRef = useRef<StageScreenDim>({ w: 0, h: 0 })
  const clearDragPointerTargetRef = useRef(onClearDragPointerTarget)
  const onSpineCanvasPointerDownRef = useRef(onSpineCanvasPointerDown)
  const getSpineDragEnabledRef = useRef(getSpineDragEnabled)
  const onSpineDragStartRef = useRef(onSpineDragStart)
  const onSpineDragEndRef = useRef(onSpineDragEnd)
  const placeholderDetachRef = useRef(new Map<string, () => void>())
  const draggingSpineRef = useRef<Spine | null>(null)
  const draggingSpriteRef = useRef<Sprite | null>(null)
  const onSpriteCanvasPointerDownRef = useRef(onSpriteCanvasPointerDown)
  const getSpriteDragEnabledRef = useRef(getSpriteDragEnabled)
  const onSpriteDragStartRef = useRef(onSpriteDragStart)
  const onSpriteDragEndRef = useRef(onSpriteDragEnd)
  const lastPointerClientRef = useRef({ cx: 0, cy: 0 })
  const tipApplyFromClientRef = useRef<(cx: number, cy: number) => void>(() => {})
  const [cursorWorldTip, setCursorWorldTip] = useState<{
    show: boolean
    localX: number
    localY: number
    wx: number
    wy: number
    mode: 'pointer' | 'placement'
  }>({ show: false, localX: 0, localY: 0, wx: 0, wy: 0, mode: 'pointer' })
  backdropModeRef.current = backdropMode
  showWorldGridRef.current = showWorldGrid
  onViewRef.current = onStageViewChange
  safeFramePresetRef.current = safeFramePreset
  clearDragPointerTargetRef.current = onClearDragPointerTarget
  onSpineCanvasPointerDownRef.current = onSpineCanvasPointerDown
  getSpineDragEnabledRef.current = getSpineDragEnabled
  onSpineDragStartRef.current = onSpineDragStart
  onSpineDragEndRef.current = onSpineDragEnd
  onSpriteCanvasPointerDownRef.current = onSpriteCanvasPointerDown
  getSpriteDragEnabledRef.current = getSpriteDragEnabled
  onSpriteDragStartRef.current = onSpriteDragStart
  onSpriteDragEndRef.current = onSpriteDragEnd

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const scratch = new Point()
    let raf = 0
    let pending: { cx: number; cy: number } | null = null

    const applyTipFromClient = (cx: number, cy: number) => {
      lastPointerClientRef.current = { cx, cy }
      const application = appRef.current
      const world = worldRef.current
      if (!application || !world) {
        setCursorWorldTip((t) => (t.show ? { ...t, show: false } : t))
        return
      }
      const rect = wrap.getBoundingClientRect()
      const inside = cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom
      if (!inside) {
        setCursorWorldTip((t) => ({ ...t, show: false }))
        return
      }

      const spineDrag = draggingSpineRef.current
      const spriteDrag = draggingSpriteRef.current
      const placementMode = Boolean(
        (spineDrag && !spineDrag.destroyed) ||
        (spriteDrag && !spriteDrag.destroyed),
      )
      if (placementMode && spineDrag && !spineDrag.destroyed) {
        spineOriginToWorldXY(spineDrag, world, scratch)
      } else if (placementMode && spriteDrag && !spriteDrag.destroyed) {
        const g = spriteDrag.getGlobalPosition(scratch)
        world.toLocal(g, undefined, scratch)
      } else {
        mapClientToWorldXY(application, world, cx, cy, scratch)
      }

      setCursorWorldTip({
        show: true,
        localX: cx - rect.left,
        localY: cy - rect.top,
        wx: scratch.x,
        wy: scratch.y,
        mode: placementMode ? 'placement' : 'pointer',
      })
    }

    tipApplyFromClientRef.current = applyTipFromClient

    const flush = () => {
      raf = 0
      if (!pending) return
      const { cx, cy } = pending
      pending = null
      applyTipFromClient(cx, cy)
    }

    const onWrapMove = (e: PointerEvent) => {
      pending = { cx: e.clientX, cy: e.clientY }
      if (!raf) raf = requestAnimationFrame(flush)
    }

    const onWinMove = (e: PointerEvent) => {
      if (!draggingSpineRef.current && !draggingSpriteRef.current) return
      pending = { cx: e.clientX, cy: e.clientY }
      if (!raf) raf = requestAnimationFrame(flush)
    }

    const onLeave = () => {
      if (draggingSpineRef.current || draggingSpriteRef.current) return
      pending = null
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      setCursorWorldTip((t) => ({ ...t, show: false }))
    }

    wrap.addEventListener('pointermove', onWrapMove)
    wrap.addEventListener('pointerleave', onLeave)
    window.addEventListener('pointermove', onWinMove, { passive: true })
    return () => {
      tipApplyFromClientRef.current = () => {}
      pending = null
      if (raf) cancelAnimationFrame(raf)
      wrap.removeEventListener('pointermove', onWrapMove)
      wrap.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('pointermove', onWinMove)
    }
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let app: Application | null = null
    let cancelled = false
    let disposeStageResize: (() => void) | null = null
    let hostResizeObserver: ResizeObserver | null = null

    const boot = async () => {
      const application = new Application()
      await application.init({
        resizeTo: host,
        backgroundColor: 0x1a1d26,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio ?? 1, 2),
        preference: 'webgl',
      })

      if (cancelled) {
        application.destroy(true, true)
        return
      }

      app = application
      appRef.current = application
      host.appendChild(application.canvas)

      application.stage.eventMode = 'static'

      const world = new Container()
      world.sortableChildren = true
      const centerShell = new Container()
      const backdrop = new Graphics()
      backdrop.eventMode = 'static'
      backdrop.cursor = 'default'

      const overlay = new Graphics()
      overlay.eventMode = 'none'
      overlay.zIndex = OVERLAY_Z

      const worldGrid = new Graphics()
      worldGrid.eventMode = 'none'
      worldGrid.zIndex = -500_000

      const safeFrameG = new Graphics()
      safeFrameG.eventMode = 'none'
      safeFrameG.zIndex = 50_000

      worldRef.current = world
      centerShellRef.current = centerShell
      backdropRef.current = backdrop
      worldGridRef.current = worldGrid
      overlayRef.current = overlay
      safeFrameRef.current = safeFrameG

      application.stage.addChildAt(backdrop, 0)
      application.stage.sortableChildren = true
      application.stage.addChild(centerShell)
      application.stage.addChild(safeFrameG)

      centerShell.addChild(world)

      world.addChild(worldGrid)
      world.addChild(overlay)

      stageScreenSizeRef.current = { w: 0, h: 0 }
      syncViewportCenterShell(application, host, centerShell, stageScreenSizeRef)

      const onStageResize = () => {
        syncViewportCenterShell(application, host, centerShell, stageScreenSizeRef)
      }
      application.renderer.on('resize', onStageResize)
      disposeStageResize = () => {
        application.renderer.off('resize', onStageResize)
      }

      paintBackdrop(
        backdrop,
        application.screen.width,
        application.screen.height,
        backdropModeRef.current,
      )

      disposeNavRef.current = attachStageNavigation(
        host,
        application,
        world,
        backdrop,
        {
          getBackdropMode: () => backdropModeRef.current,
          onViewChange: (s) => onViewRef.current?.(s),
          onBackdropLeftPointerDown: () => clearDragPointerTargetRef.current?.(),
        },
      )

      hostResizeObserver = new ResizeObserver(() => {
        if (cancelled) return
        syncViewportCenterShell(application, host, centerShell, stageScreenSizeRef)
      })
      hostResizeObserver.observe(host)

      const recenterWorldAfterLayout = () => {
        if (cancelled) return
        stageScreenSizeRef.current = { w: 0, h: 0 }
        syncViewportCenterShell(application, host, centerShell, stageScreenSizeRef)
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(recenterWorldAfterLayout)
      })

      const rendererUnknown = application.renderer as unknown as {
        gl?: WebGLRenderingContext | WebGL2RenderingContext
        runners?: {
          prerender: { add(v: { prerender(): void }): void; remove(v: { prerender(): void }): void }
          postrender: { add(v: { postrender(): void }): void; remove(v: { postrender(): void }): void }
        }
      }
      if (rendererUnknown.gl && rendererUnknown.runners) {
        const meter = createWebGlDrawCallMeter(rendererUnknown.gl)
        drawMeterRef.current = meter
        rendererUnknown.runners.prerender.add(meter.hook)
        rendererUnknown.runners.postrender.add(meter.hook)
      }

      application.ticker.add(() => {
        const sf = safeFrameRef.current
        if (sf) {
          paintSafeFrameOverlay(
            sf,
            application.screen.width,
            application.screen.height,
            safeFramePresetRef.current,
          )
        }

        const o = overlayRef.current
        if (o) o.clear()

        const wg = worldGridRef.current
        const wld = worldRef.current
        const appLive = appRef.current
        const hostLive = hostRef.current
        if (wg && wld && appLive && hostLive) {
          const spines: Spine[] = []
          for (const c of wld.children) {
            if (c instanceof Spine) spines.push(c)
          }
          const vs = readStageViewSize(appLive, hostLive)
          const gw = vs?.w ?? appLive.screen.width
          const gh = vs?.h ?? appLive.screen.height
          paintWorldGrid(wg, wld, gw, gh, {
            enabled: showWorldGridRef.current,
            spineAnchors: showWorldGridRef.current
              ? spineAnchorsInWorldSpace(wld, spines)
              : [],
          })
        }
      })

      ensureAllSpinesInteractive(world)
    }

    void boot()

    return () => {
      cancelled = true
      hostResizeObserver?.disconnect()
      hostResizeObserver = null
      disposeStageResize?.()
      disposeStageResize = null
      disposeNavRef.current?.()
      disposeNavRef.current = null
      if (app && drawMeterRef.current) {
        const rendererUnknown = app.renderer as unknown as {
          runners?: {
            prerender: { remove(v: { prerender(): void }): void }
            postrender: { remove(v: { postrender(): void }): void }
          }
        }
        const meter = drawMeterRef.current
        rendererUnknown.runners?.prerender.remove(meter.hook)
        rendererUnknown.runners?.postrender.remove(meter.hook)
        meter.dispose()
        drawMeterRef.current = null
      }
      appRef.current = null
      worldRef.current = null
      centerShellRef.current = null
      backdropRef.current = null
      worldGridRef.current = null
      overlayRef.current = null
      safeFrameRef.current = null
      if (app) {
        app.destroy(true, true)
        app = null
      }
    }
  }, [])

  useEffect(() => {
    safeFramePresetRef.current = safeFramePreset
  }, [safeFramePreset])

  useEffect(() => {
    const app = appRef.current
    const backdrop = backdropRef.current
    if (!app || !backdrop) return
    paintBackdrop(backdrop, app.screen.width, app.screen.height, backdropMode)
  }, [backdropMode])

  useEffect(() => {
    const world = worldRef.current
    if (!world) return
    ensureAllSpinesInteractive(world)
  }, [spineSceneRevision, atlasPreviewRevision])

  useImperativeHandle(ref, () => ({
    resetStageView() {
      const world = worldRef.current
      const centerShell = centerShellRef.current
      const application = appRef.current
      const hostEl = hostRef.current
      if (!world || !centerShell || !application || !hostEl) return
      world.scale.set(1)
      world.position.set(0, 0)
      stageScreenSizeRef.current = { w: 0, h: 0 }
      syncViewportCenterShell(application, hostEl, centerShell, stageScreenSizeRef)
      onViewRef.current?.(1)
    },

    bringSpineToDrawFront(spine: Spine) {
      const world = worldRef.current
      if (!world) return
      applyBringSpineToDrawFront(world, spine)
    },

    sendSpineToDrawBack(spine: Spine) {
      const world = worldRef.current
      if (!world) return
      applySendSpineToDrawBack(world, spine)
    },

    syncHierarchyDrawOrder(spinesTopIsFront: Spine[]) {
      const world = worldRef.current
      if (!world) return
      applyHierarchyZOrder(world, spinesTopIsFront)
    },

    reconcilePlaceholderAttachments(rows: PlaceholderReconcileRow[]) {
      const world = worldRef.current
      if (!world) return
      for (const fn of placeholderDetachRef.current.values()) fn()
      placeholderDetachRef.current.clear()
      const byId = new Map(rows.map((r) => [r.id, r.spine]))
      for (const row of rows) {
        for (const [bone, childId] of Object.entries(row.placeholderBindings)) {
          if (!childId) continue
          const child = byId.get(childId)
          if (!child) continue
          const { detach } = attachSpineToHostPlaceholder(row.spine, bone, child, world)
          placeholderDetachRef.current.set(`${row.id}::${bone}`, detach)
        }
      }
    },

    swapSpineInstance(oldSpine: Spine, newSpine: Spine) {
      const world = worldRef.current
      const application = appRef.current
      const overlay = overlayRef.current
      if (!world || !application) return
      // oldSpine may be a direct world child OR nested inside a placeholder wrapper Container.
      // A null parent means it was already orphaned/destroyed — skip.
      if (!oldSpine.parent) return
      if (newSpine.parent) return

      const parent = oldSpine.parent          // world or a wrapper Container
      const isWorldChild = parent === world

      const x = oldSpine.x                    // world-space OR bone-local — preserved as-is
      const y = oldSpine.y
      const sx = oldSpine.scale.x
      const sy = oldSpine.scale.y
      const z = oldSpine.zIndex
      const vis = oldSpine.visible

      detachSpineDrag(oldSpine)
      if (draggingSpineRef.current === oldSpine) draggingSpineRef.current = null

      parent.removeChild(oldSpine)
      // Use children:false so that any placeholder wrappers (and their nested children) that
      // are Pixi-children of this spine are NOT cascade-destroyed — they will be cleaned up
      // by the subsequent reconcilePlaceholderAttachments → detach() call.
      oldSpine.destroy({ children: false, texture: true, textureSource: true })

      newSpine.scale.set(sx, sy)
      applySpineOriginAtRootBone(newSpine)
      const snapped = snapWorldXY(x, y)
      newSpine.position.set(snapped.x, snapped.y)
      newSpine.zIndex = z
      newSpine.visible = vis
      newSpine.update(0)

      parent.addChild(newSpine)
      attachSpineDrag(newSpine, application, world, {
        onLeftPointerDown: () => onSpineCanvasPointerDownRef.current?.(newSpine),
        isDragEnabled: () => getSpineDragEnabledRef.current?.(newSpine) ?? true,
        onDragStart: (cx, cy) => {
          draggingSpineRef.current = newSpine
          tipApplyFromClientRef.current(cx, cy)
          onSpineDragStartRef.current?.()
        },
        onDragEnd: () => {
          draggingSpineRef.current = null
          onSpineDragEndRef.current?.()
          const last = lastPointerClientRef.current
          requestAnimationFrame(() => tipApplyFromClientRef.current(last.cx, last.cy))
        },
      })
      if (isWorldChild && overlay) bringOverlayToFront(world, overlay)
    },

    fitAllSpinesInView() {
      const application = appRef.current
      const world = worldRef.current
      const centerShell = centerShellRef.current
      const hostEl = hostRef.current
      if (!application || !world || !centerShell || !hostEl) return

      const spines: Spine[] = []
      for (const c of world.children) {
        if (c instanceof Spine) spines.push(c)
      }
      if (spines.length === 0) {
        world.scale.set(1)
        world.position.set(0, 0)
        stageScreenSizeRef.current = { w: 0, h: 0 }
        syncViewportCenterShell(application, hostEl, centerShell, stageScreenSizeRef)
        onViewRef.current?.(1)
        return
      }

      for (const s of spines) {
        s.update(0)
      }

      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const s of spines) {
        if (!s.visible) continue
        const b = s.getBounds()
        minX = Math.min(minX, b.x)
        minY = Math.min(minY, b.y)
        maxX = Math.max(maxX, b.x + b.width)
        maxY = Math.max(maxY, b.y + b.height)
      }

      if (!Number.isFinite(minX)) {
        world.scale.set(1)
        world.position.set(0, 0)
        stageScreenSizeRef.current = { w: 0, h: 0 }
        syncViewportCenterShell(application, hostEl, centerShell, stageScreenSizeRef)
        onViewRef.current?.(1)
        return
      }

      const pad = 48
      const sz = readStageViewSize(application, hostEl)
      const sw = sz?.w ?? application.screen.width
      const sh = sz?.h ?? application.screen.height
      const bw = Math.max(1, maxX - minX)
      const bh = Math.max(1, maxY - minY)
      let scale = Math.min((sw - 2 * pad) / bw, (sh - 2 * pad) / bh, 4)
      scale = Math.max(0.12, scale)
      const cx = (minX + maxX) / 2
      const cy = (minY + maxY) / 2
      world.scale.set(scale)
      world.position.set(-cx * scale, -cy * scale)
      stageScreenSizeRef.current = { w: 0, h: 0 }
      syncViewportCenterShell(application, hostEl, centerShell, stageScreenSizeRef)
      onViewRef.current?.(scale)
    },

    async loadLocalFiles(
      files: File[],
      options?: { groups?: SpineFileGroup[]; allowedPlaceholderBoneNames?: string[] },
    ) {
      const application = appRef.current
      const world = worldRef.current
      const overlay = overlayRef.current
      if (!application || !world) {
        return {
          loaded: [],
          errors: ['Preview is still starting — try again in a moment.'],
          notes: [],
          newInstances: [],
          loadValidationIssues: [],
        }
      }

      const grouped =
        options?.groups !== undefined
          ? { groups: options.groups, notes: [] as string[] }
          : groupSpineFiles(files)
      const { groups, notes } = grouped

      if (groups.length === 0) {
        return {
          loaded: [],
          errors: [],
          notes:
            notes.length > 0
              ? notes
              : options?.groups !== undefined
                ? []
                : [
                    'No skeleton + atlas pairs found. Use “name.skel” (or “name.json”) with “name.atlas” or “name@1x.atlas” / “name@2x.atlas”, plus the atlas images.',
                  ],
          newInstances: [],
          loadValidationIssues: [],
        }
      }

      const loaded: string[] = []
      const errors: string[] = []
      const newInstances: LoadedSpineInstance[] = []
      const loadValidationIssues: ValidationIssue[] = []
      const loadNotesExtra: string[] = []
      const allowed = (options?.allowedPlaceholderBoneNames ?? [])
        .map((s) => s.trim())
        .filter(Boolean)

      const byLower = filesByLowerName(files)

      for (const g of groups) {
        const result = await loadSpineFromFileGroup(g, files)
        if (result.ok) {
          result.spine.scale.set(1)
          /** World (0,0) = editor axes; set before root pivot so compensation isn’t overwritten. */
          result.spine.position.set(0, 0)
          applySpineOriginAtRootBone(result.spine)
          result.spine.zIndex = 0
          let placeholderPolicyFrozen = false
          if (allowed.length > 0) {
            const phIssues = validateLoadedSkeletonPlaceholders(
              result.displayName,
              result.spine,
              allowed,
            )
            if (phIssues.length > 0) {
              loadValidationIssues.push(...phIssues)
              placeholderPolicyFrozen = true
              result.spine.autoUpdate = false
              result.spine.state.timeScale = 0
              result.spine.update(0)
              loadNotesExtra.push(
                `${result.displayName}: loaded frozen (placeholder names) — see Bundle validation until fixed.`,
              )
            }
          }
          world.addChild(result.spine)
          attachSpineDrag(result.spine, application, world, {
            onLeftPointerDown: () =>
              onSpineCanvasPointerDownRef.current?.(result.spine),
            isDragEnabled: () =>
              getSpineDragEnabledRef.current?.(result.spine) ?? true,
            onDragStart: (cx, cy) => {
              draggingSpineRef.current = result.spine
              tipApplyFromClientRef.current(cx, cy)
              onSpineDragStartRef.current?.()
            },
            onDragEnd: () => {
              draggingSpineRef.current = null
              onSpineDragEndRef.current?.()
              const last = lastPointerClientRef.current
              requestAnimationFrame(() => tipApplyFromClientRef.current(last.cx, last.cy))
            },
          })
          loaded.push(result.displayName)
          const atlasAvailableTags = atlasTagsForStem(g.displayName, byLower)
          const activeAtlasTag = atlasTagForStemAndFile(g.displayName, g.atlas)
          newInstances.push({
            id: crypto.randomUUID(),
            displayName: result.displayName,
            spine: result.spine,
            skeletonSourceFile: g.skeleton,
            atlasAvailableTags,
            activeAtlasTag,
            placeholderPolicyFrozen,
          })
        } else {
          errors.push(result.message)
        }
      }

      if (overlay) bringOverlayToFront(world, overlay)

      return {
        loaded,
        errors,
        notes: [...notes, ...loadNotesExtra],
        newInstances,
        loadValidationIssues,
      }
    },

    clearSpines() {
      const world = worldRef.current
      const overlay = overlayRef.current
      if (!world) return
      draggingSpineRef.current = null
      for (const fn of placeholderDetachRef.current.values()) fn()
      placeholderDetachRef.current.clear()
      for (const child of [...world.children]) {
        if (child instanceof Spine) {
          detachSpineDrag(child)
          world.removeChild(child)
          child.destroy({ children: true, texture: true, textureSource: true })
        }
      }
      if (overlay) bringOverlayToFront(world, overlay)
    },

    clearSprites() {
      const world = worldRef.current
      const overlay = overlayRef.current
      if (!world) return
      draggingSpriteRef.current = null
      for (const child of [...world.children]) {
        if (child instanceof Sprite) {
          destroyPixiSprite(child)
        }
      }
      if (overlay) bringOverlayToFront(world, overlay)
    },

    async addSprite(objectUrl: string): Promise<Sprite> {
      const application = appRef.current
      const world = worldRef.current
      const overlay = overlayRef.current
      if (!application || !world) throw new Error('Stage not ready')
      const sprite = await createPixiSprite(objectUrl)
      sprite.position.set(0, 0)
      sprite.zIndex = 0
      addSpriteToWorld(world, sprite)
      attachSpriteDrag(sprite, application, world, {
        onLeftPointerDown: () => onSpriteCanvasPointerDownRef.current?.(sprite),
        isDragEnabled: () => getSpriteDragEnabledRef.current?.(sprite) ?? true,
        onDragStart: (cx, cy) => {
          draggingSpriteRef.current = sprite
          tipApplyFromClientRef.current(cx, cy)
          onSpriteDragStartRef.current?.()
        },
        onDragEnd: () => {
          draggingSpriteRef.current = null
          onSpriteDragEndRef.current?.()
          const last = lastPointerClientRef.current
          requestAnimationFrame(() => tipApplyFromClientRef.current(last.cx, last.cy))
        },
      })
      if (overlay) bringOverlayToFront(world, overlay)
      return sprite
    },

    removeSprite(sprite: Sprite, objectUrl?: string) {
      const world = worldRef.current
      const overlay = overlayRef.current
      if (!world) return
      if (sprite.destroyed) return
      if (draggingSpriteRef.current === sprite) draggingSpriteRef.current = null
      destroyPixiSprite(sprite, objectUrl)
      if (overlay) bringOverlayToFront(world, overlay)
    },

    getSpriteWorldPosition(sprite: Sprite): { x: number; y: number } | null {
      const world = worldRef.current
      if (!world || sprite.destroyed) return null
      const g = sprite.getGlobalPosition(new Point())
      world.toLocal(g, undefined, g)
      return { x: g.x, y: g.y }
    },

    setSpriteWorldPosition(sprite: Sprite, x: number, y: number): boolean {
      const world = worldRef.current
      if (!world || sprite.destroyed) return false
      const s = snapWorldXY(x, y)
      sprite.position.set(s.x, s.y)
      return true
    },

    syncFullLayerOrder(order: Array<{ kind: 'spine' | 'sprite'; obj: Spine | Sprite }>) {
      const n = order.length
      for (let i = 0; i < n; i++) {
        // order[0] = front = highest zIndex
        const z = (n - 1 - i) * 10
        order[i].obj.zIndex = z
      }
    },

    removeSpine(spine: Spine) {
      const world = worldRef.current
      const overlay = overlayRef.current
      if (!world) return
      if (spine.destroyed) return
      if (draggingSpineRef.current === spine) draggingSpineRef.current = null
      detachSpineDrag(spine)
      if (spine.parent) {
        spine.parent.removeChild(spine)
      }
      spine.destroy({ children: true, texture: true, textureSource: true })
      if (overlay) bringOverlayToFront(world, overlay)
    },

    getSpineWorldPosition(spine: Spine): { x: number; y: number } | null {
      const world = worldRef.current
      if (!world || spine.destroyed) return null
      const g = spine.getGlobalPosition(new Point())
      world.toLocal(g, undefined, g)
      return { x: g.x, y: g.y }
    },

    /** World-space point under the pointer (same units as grid / inspector position). */
    getSpineBoneLocalOffset(spine: Spine): { x: number; y: number } | null {
      if (spine.destroyed) return null
      return { x: spine.position.x, y: spine.position.y }
    },

    setSpineBoneLocalOffset(spine: Spine, x: number, y: number): boolean {
      if (spine.destroyed) return false
      const world = worldRef.current
      if (!world || spine.parent === world || !spine.parent) return false
      const s = snapWorldXY(x, y)
      spine.position.set(s.x, s.y)
      spine.update(0)
      return true
    },

    clientToWorldXY(clientX: number, clientY: number): { x: number; y: number } | null {
      const application = appRef.current
      const world = worldRef.current
      if (!application || !world) return null
      const p = new Point()
      mapClientToWorldXY(application, world, clientX, clientY, p)
      return { x: p.x, y: p.y }
    },

    setSpineWorldPlacementXY(spine: Spine, x: number, y: number): boolean {
      const world = worldRef.current
      if (!world || spine.destroyed) return false
      const s = snapWorldXY(x, y)
      const parent = spine.parent
      if (!parent) return false

      if (parent === world) {
        spine.position.set(s.x, s.y)
        spine.update(0)
        return true
      }

      const globalScratch = new Point()
      world.toGlobal(new Point(s.x, s.y), globalScratch)
      parent.toLocal(globalScratch, undefined, spine.position)
      spine.update(0)
      return true
    },

    getPerformanceMetrics(): StagePerformanceSnapshot | null {
      const application = appRef.current
      const world = worldRef.current
      if (!application || !world) return null
      const r = application.renderer
      let bonesTotal = 0
      let slotsTotal = 0
      let skinsTotal = 0
      let animationsTotal = 0
      let spineInstances = 0
      let visibleSpineInstances = 0
      for (const child of world.children) {
        if (!(child instanceof Spine)) continue
        spineInstances++
        if (child.visible) visibleSpineInstances++
        const sk = child.skeleton
        const data = sk.data
        bonesTotal += sk.bones.length
        slotsTotal += sk.slots.length
        skinsTotal += data.skins.length
        animationsTotal += data.animations.length
      }
      const mem =
        typeof performance !== 'undefined' &&
        'memory' in performance &&
        performance.memory &&
        typeof (performance.memory as { usedJSHeapSize?: number }).usedJSHeapSize === 'number'
          ? (performance.memory as { usedJSHeapSize: number; totalJSHeapSize: number })
          : null
      const meter = drawMeterRef.current
      const drawCalls = meter ? meter.getLastFrameDrawCalls() : null
      const canvas = application.canvas as HTMLCanvasElement
      return {
        fps: application.ticker.FPS,
        frameMs: application.ticker.deltaMS,
        drawCalls,
        rendererName: r.name ?? 'renderer',
        resolution: r.resolution,
        canvasPixelW: canvas.width,
        canvasPixelH: canvas.height,
        spineInstances,
        visibleSpineInstances,
        bonesTotal,
        slotsTotal,
        skinsTotal,
        animationsTotal,
        jsHeapUsedMb: mem != null ? (mem.usedJSHeapSize / (1024 * 1024)).toFixed(1) : null,
        jsHeapTotalMb: mem != null ? (mem.totalJSHeapSize / (1024 * 1024)).toFixed(1) : null,
      }
    },
  }))

  return (
    <div ref={wrapRef} className="pixi-stage-wrap">
      <div ref={hostRef} className="pixi-stage-host" aria-label="Preview canvas" />
      {cursorWorldTip.show ? (
        <div
          className={`pixi-cursor-world-tip${
            cursorWorldTip.mode === 'placement' ? ' pixi-cursor-world-tip--placement' : ''
          }`}
          style={{
            left: cursorWorldTip.localX,
            top: cursorWorldTip.localY,
            transform: 'translate(-50%, calc(-100% - 10px))',
          }}
          aria-hidden
        >
          {cursorWorldTip.mode === 'placement' ? (
            <>
              Object X {cursorWorldTip.wx.toFixed(1)} · Y {cursorWorldTip.wy.toFixed(1)} px
            </>
          ) : (
            <>
              X {cursorWorldTip.wx.toFixed(1)} · Y {cursorWorldTip.wy.toFixed(1)} px
            </>
          )}
        </div>
      ) : null}
    </div>
  )
})
