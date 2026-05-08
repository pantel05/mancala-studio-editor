import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react'
import { flushSync } from 'react-dom'
import {
  PixiStage,
  type PixiStageHandle,
  type StageBackdropMode,
} from './PixiStage'
import {
  SpineInstanceControls,
  type SpineControlRow,
  type SpineInstanceHandle,
} from './SpineInstanceControls'
import { SpriteInstanceControls } from './SpriteInstanceControls'
import type { NineSliceInsets, SpriteRow } from './SpriteRow'
import { isImageFile, type AnySprite } from './pixi/spriteLayer'
import {
  groupsLoadableFromReport,
  mergeSpineValidationIssues,
  validateSpineFiles,
  type SpineValidationReport,
  type ValidationIssue,
} from './spine/validateSpineSelection'
import { readCommonPlaceholderNames, writeCommonPlaceholderNames } from './spine/commonPlaceholdersStorage'
import { scanSkeletonPlaceholders } from './spine/scanSkeletonPlaceholders'
import {
  resolveInspectorPlaceholders,
  validateLoadedSkeletonPlaceholders,
} from './spine/validateLoadedSkeletonPlaceholders'

import { readCommonAnimationNames, writeCommonAnimationNames } from './spine/commonAnimationNamesStorage'
import { validateLoadedSkeletonAnimations } from './spine/validateLoadedSkeletonAnimations'
import { CommonPlaceholdersModal } from './CommonPlaceholdersModal'
import { CommonAnimationNamesModal } from './CommonAnimationNamesModal'
import {
  UnknownAnimationsPromptModal,
  type UnknownAnimEntry,
} from './UnknownAnimationsPromptModal'
import { saveProjectSaveAs, saveProjectToHandle, isMancalaFile } from './project/saveProject'
import {
  pickMancalaFile,
  readMancalaFile,
  applyProjectStateToRows,
  resolveProjectBindings,
  remapScenarioStateFromProject,
} from './project/openProject'
import { HelpModal } from './HelpModal'
import { ValidationPanel } from './ValidationPanel'
import { ScenarioTimelinePanel } from './scenario/ScenarioTimelinePanel'
import { applyScenarioAtCompositionTime } from './scenario/applyScenarioAtCompositionTime'
import {
  computeScenarioDurationSec,
  computeScenarioSoloPinnedChildIds,
  emptyScenarioTracksFromScene,
  orderTracksLikeLayerOrder,
  scenarioPlaceholderAttachSig,
} from './scenario/scenarioModel'
import type { ScenarioMarker, ScenarioTrack } from './scenario/scenarioTypes'
import { newScenarioMarkerId } from './scenario/scenarioTypes'
import type { Spine } from '@esotericsoftware/spine-pixi-v8'
import {
  applySceneSnapshot,
  captureSceneSnapshot,
  effectiveRootSpineScale,
  SCENE_HISTORY_MAX,
  snapshotsEqual,
  type SceneSnapshot,
} from './scene/sceneSnapshot'
import { effectiveLayerVisible } from './scene/layerVisibility'
import { spineRowsAfterRemoval } from './scene/spineRowsAfterRemoval'
// Metrics overlay (FPS / heap / spine counts) — disabled to avoid extra per-frame work; re-enable:
// 1) Uncomment this import
// 2) Uncomment the "Metrics" checkbox + `<ViewportMetricsOverlay ... />` block (search "ViewportMetricsOverlay")
// import { ViewportMetricsOverlay } from './ViewportMetricsOverlay'
import { applyPlaceholderBinding } from './spine/applyPlaceholderBindingState'
import { effectivePinnedBoneOffset } from './spine/pinnedBoneLayout'
import type { PlaceholderLayoutKey } from './spine/placeholderLayoutResolution'
import type { AnimationStateListener } from '@esotericsoftware/spine-core'
import { IsolateModePanel } from './IsolateModePanel'
import { IsolateAnimLabelsOverlay } from './IsolateAnimLabelsOverlay'
import {
  captureSpinePlaybackBackup,
  restoreSpinePlaybackBackup,
  type SpinePlaybackBackup,
} from './isolate/spinePlaybackBackup'
import {
  applySpineClipAtTimeZero,
  resetSpineToSetupPoseAndClearTracks,
} from './isolate/isolateSpineAnimationReset'

const VIEWPORT_LAYOUT_WATERMARK: Record<PlaceholderLayoutKey, string> = {
  main: 'Main view',
  pt: 'Portrait view',
  ls: 'Landscape view',
  tb: 'Tablet view',
}

const INSPECTOR_LAYOUT_BADGE: Record<PlaceholderLayoutKey, string> = {
  main: 'MAIN',
  pt: 'PT',
  ls: 'LS',
  tb: 'TB',
}
import { filesByLowerName, findAtlasFileForStemTag } from './spine/findAtlasForStem'
import { loadSpineFromFileGroup } from './spine/loadSpineFromFileGroup'
import { EDITOR_VERSION } from './editorVersion'
import { snapWorldScalar } from './pixi/snapWorldPosition'
import './App.css'

/** World-space spacing between isolated skeletons in a centered horizontal row (isolate preview only). */
const ISOLATE_ROW_STEP_WORLD = 220

type LoadOutcome = {
  loaded: string[]
  errors: string[]
  notes: string[]
}

function dedupeFiles(files: File[]): File[] {
  const seen = new Set<string>()
  const out: File[] = []
  for (const f of files) {
    const key = `${f.name}:${f.size}:${f.lastModified}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(f)
  }
  return out
}

/** Same basename (case-insensitive): later import wins so incremental drops keep one pool for @1x/@2x reloads. */
function mergeImportedFilePool(prev: File[], incoming: File[]): File[] {
  const map = new Map<string, File>()
  for (const f of prev) {
    map.set(f.name.toLowerCase(), f)
  }
  for (const f of dedupeFiles(incoming)) {
    map.set(f.name.toLowerCase(), f)
  }
  return [...map.values()]
}

const LAYOUT_STORAGE_KEY = 'mancala-gaming-studio-editor-layout-v1'

const LAYOUT_DEFAULTS = {
  sidebar: 256,
  inspector: 340,
  console: 200,
} as const

const LAYOUT_LIMITS = {
  sidebar: { min: 180, max: 520 },
  inspector: { min: 260, max: 640 },
  console: { min: 72 },
} as const

function clampLayout(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

type StoredLayout = { sidebar?: number; inspector?: number; console?: number }

function readLayoutFromStorage(): StoredLayout | null {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as Record<string, unknown>
    const out: StoredLayout = {}
    for (const k of ['sidebar', 'inspector', 'console'] as const) {
      const v = Number(o[k])
      if (Number.isFinite(v)) out[k] = v
    }
    return Object.keys(out).length ? out : null
  } catch {
    return null
  }
}

function maxConsoleHeightPx() {
  return Math.min(540, Math.floor(window.innerHeight * 0.72) - 96)
}

type LayoutDrag =
  | { kind: 'sidebar'; x0: number; w0: number }
  | { kind: 'inspector'; x0: number; w0: number }
  | { kind: 'console'; y0: number; h0: number }

function isTextInputEventTarget(t: EventTarget | null): boolean {
  const el = t instanceof HTMLElement ? t : null
  if (!el) return false
  if (el.isContentEditable || el.closest('[contenteditable="true"]')) return true
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function IconPadlockClosed() {
  return (
    <svg className="editor-hierarchy-lock-svg" viewBox="0 0 16 16" width="13" height="13" aria-hidden>
      <rect x="3.5" y="7.5" width="9" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <path fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" d="M5.5 7.5V5.5a2.5 2.5 0 015 0v2" />
    </svg>
  )
}

function IconPadlockOpen() {
  return (
    <svg className="editor-hierarchy-lock-svg" viewBox="0 0 16 16" width="13" height="13" aria-hidden>
      <rect x="3.5" y="7.5" width="9" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <path fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" d="M5.5 7.5V5.25a2.5 2.5 0 017.25 1.5" />
    </svg>
  )
}

/** Undo arrow from SVG Repo (undo-svgrepo-com); gray via CSS; redo is the same path flipped horizontally. */
const UNDO_SVGREPO_PATH =
  'M6,3.6V0L0,6l6,6V8c6-.27,7.53,3.76,7.88,5.77a.27.27,0,0,0,.53,0C17.08,2.86,6,3.6,6,3.6Z'

function IconUndo() {
  return (
    <svg
      className="transport-icon-svg transport-undo-redo-svgrepo"
      viewBox="0 0 16 16"
      width="15"
      height="15"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <path fill="currentColor" d={UNDO_SVGREPO_PATH} />
    </svg>
  )
}

function IconRedo() {
  return (
    <svg
      className="transport-icon-svg transport-undo-redo-svgrepo"
      viewBox="0 0 16 16"
      width="15"
      height="15"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="translate(16,0) scale(-1,1)">
        <path fill="currentColor" d={UNDO_SVGREPO_PATH} />
      </g>
    </svg>
  )
}

/** Trash can — paths from `src/assets/trash-can-svgrepo-com.svg` (SVG Repo). */
function IconTrash() {
  return (
    <svg
      className="editor-hierarchy-trash-svg"
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M4 6H20L18.4199 20.2209C18.3074 21.2337 17.4512 22 16.4321 22H7.56786C6.54876 22 5.69264 21.2337 5.5801 20.2209L4 6Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.34491 3.14716C7.67506 2.44685 8.37973 2 9.15396 2H14.846C15.6203 2 16.3249 2.44685 16.6551 3.14716L18 6H6L7.34491 3.14716Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 6H22"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 11V16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 11V16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

type IsolateModeBackup = {
  scene: SceneSnapshot
  layoutTarget: PlaceholderLayoutKey
  layerOrder: string[]
  selectedSpineId: string | null
  selectedSpriteId: string | null
  canvasDragSpineId: string | null
  spinePlayback: Record<string, SpinePlaybackBackup>
  spriteVisible: Record<string, boolean>
  backdropMode: StageBackdropMode
  showWorldGrid: boolean
  showMetricsOverlay: boolean
}

function App() {
  const stageRef = useRef<PixiStageHandle>(null)
  const importedFilesRef = useRef<File[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const titlebarMenusRef = useRef<HTMLDivElement>(null)
  const layoutDragRef = useRef<LayoutDrag | null>(null)
  const [openTitlebarMenu, setOpenTitlebarMenu] = useState<null | 'project' | 'settings'>(null)
  const [commonPlaceholderNames, setCommonPlaceholderNames] = useState<string[]>(() =>
    readCommonPlaceholderNames(),
  )
  const [commonPlaceholdersModalOpen, setCommonPlaceholdersModalOpen] = useState(false)
  const [commonAnimationNames, setCommonAnimationNames] = useState<string[]>(() =>
    readCommonAnimationNames(),
  )
  const [commonAnimationNamesModalOpen, setCommonAnimationNamesModalOpen] = useState(false)
  const [helpModalOpen, setHelpModalOpen] = useState(false)
  const [pendingUnknownAnims, setPendingUnknownAnims] = useState<UnknownAnimEntry[] | null>(null)
  const [pendingUnknownPlaceholders, setPendingUnknownPlaceholders] = useState<UnknownAnimEntry[] | null>(null)
  const [removeSpineDialog, setRemoveSpineDialog] = useState<null | { rowId: string; displayName: string }>(
    null,
  )
  const removeSpineDialogTitleId = useId()
  const removeSpineDialogNoRef = useRef<HTMLButtonElement>(null)
  const [clearSceneConfirmOpen, setClearSceneConfirmOpen] = useState(false)
  const clearSceneConfirmNoRef = useRef<HTMLButtonElement>(null)
  /** Shown on every fresh page load (empty scene) and again after Clear scene — not persisted across sessions. */
  const [welcomeScreenOpen, setWelcomeScreenOpen] = useState(true)
  const welcomeScreenContinueRef = useRef<HTMLButtonElement>(null)
  /** After Clear scene, show the welcome notice again even if the user dismissed it earlier. */
  const welcomeAfterClearRef = useRef(false)
  const [atlasPreviewRevision, setAtlasPreviewRevision] = useState(0)
  /** Session-wide atlas preview: which @tag is applied to every compatible skeleton. */
  const [atlasSessionTag, setAtlasSessionTag] = useState<null | '1x' | '2x'>(null)

  const [sidebarWidthPx, setSidebarWidthPx] = useState(() =>
    clampLayout(
      readLayoutFromStorage()?.sidebar ?? LAYOUT_DEFAULTS.sidebar,
      LAYOUT_LIMITS.sidebar.min,
      LAYOUT_LIMITS.sidebar.max,
    ),
  )
  const [inspectorWidthPx, setInspectorWidthPx] = useState(() =>
    clampLayout(
      readLayoutFromStorage()?.inspector ?? LAYOUT_DEFAULTS.inspector,
      LAYOUT_LIMITS.inspector.min,
      LAYOUT_LIMITS.inspector.max,
    ),
  )
  const [consoleHeightPx, setConsoleHeightPx] = useState(() =>
    clampLayout(
      readLayoutFromStorage()?.console ?? LAYOUT_DEFAULTS.console,
      LAYOUT_LIMITS.console.min,
      maxConsoleHeightPx(),
    ),
  )
  const [outcome, setOutcome] = useState<LoadOutcome | null>(null)
  const [validationReport, setValidationReport] = useState<SpineValidationReport | null>(null)
  const [validating, setValidating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [spineRows, setSpineRows] = useState<SpineControlRow[]>([])
  const spineRowsRef = useRef(spineRows)
  useEffect(() => {
    spineRowsRef.current = spineRows
  }, [spineRows])

  const [spriteRows, setSpriteRows] = useState<SpriteRow[]>([])
  const spriteRowsRef = useRef(spriteRows)
  useEffect(() => {
    spriteRowsRef.current = spriteRows
  }, [spriteRows])

  /** Ordered IDs (front-to-back) for the unified hierarchy and z-order. */
  const [layerOrder, setLayerOrder] = useState<string[]>([])
  const layerOrderRef = useRef(layerOrder)
  useEffect(() => {
    layerOrderRef.current = layerOrder
  }, [layerOrder])
  /** Selected sprite ID — mutually exclusive with the spine selection. */
  const [selectedSpriteId, setSelectedSpriteId] = useState<string | null>(null)
  const selectedSpriteIdRef = useRef(selectedSpriteId)
  useEffect(() => { selectedSpriteIdRef.current = selectedSpriteId }, [selectedSpriteId])

  /** Kept in sync with {@link placeholderLayoutTarget} for undo capture + drag end (declared before undo hooks). */
  const placeholderLayoutTargetRef = useRef<PlaceholderLayoutKey>('main')
  /**
   * Which layout target selects among paired placeholder bones on a rig (e.g. `_ls` vs `_pt` / `_pr`).
   * Matches `project.json` → `viewport.placeholderLayoutTarget`.
   */
  const [placeholderLayoutTarget, setPlaceholderLayoutTarget] = useState<PlaceholderLayoutKey>('main')
  useEffect(() => {
    placeholderLayoutTargetRef.current = placeholderLayoutTarget
  }, [placeholderLayoutTarget])

  const undoStackRef = useRef<SceneSnapshot[]>([])
  const redoStackRef = useRef<SceneSnapshot[]>([])
  const [historyTick, setHistoryTick] = useState(0)
  const dragHistoryBeforeRef = useRef<SceneSnapshot | null>(null)
  const worldPositionEditBeforeRef = useRef<SceneSnapshot | null>(null)

  const pushUndoSnapshotFrom = useCallback((pre: SceneSnapshot) => {
    undoStackRef.current = [...undoStackRef.current.slice(-(SCENE_HISTORY_MAX - 1)), pre]
    redoStackRef.current = []
    setHistoryTick((t) => t + 1)
  }, [])

  const pushUndoSnapshot = useCallback(() => {
    pushUndoSnapshotFrom(
      captureSceneSnapshot(spineRowsRef.current, placeholderLayoutTargetRef.current),
    )
  }, [pushUndoSnapshotFrom])

  const undo = useCallback(() => {
    const u = undoStackRef.current
    if (u.length === 0 || spineRowsRef.current.length === 0) return
    const restore = u[u.length - 1]
    undoStackRef.current = u.slice(0, -1)
    redoStackRef.current = [
      ...redoStackRef.current.slice(-(SCENE_HISTORY_MAX - 1)),
      captureSceneSnapshot(spineRowsRef.current, placeholderLayoutTargetRef.current),
    ]
    setSpineRows(
      applySceneSnapshot(spineRowsRef.current, restore, placeholderLayoutTargetRef.current),
    )
    setHistoryTick((t) => t + 1)
  }, [])

  const redo = useCallback(() => {
    const r = redoStackRef.current
    if (r.length === 0 || spineRowsRef.current.length === 0) return
    const restore = r[r.length - 1]
    redoStackRef.current = r.slice(0, -1)
    undoStackRef.current = [
      ...undoStackRef.current.slice(-(SCENE_HISTORY_MAX - 1)),
      captureSceneSnapshot(spineRowsRef.current, placeholderLayoutTargetRef.current),
    ]
    setSpineRows(
      applySceneSnapshot(spineRowsRef.current, restore, placeholderLayoutTargetRef.current),
    )
    setHistoryTick((t) => t + 1)
  }, [])

  const onSpineDragStartForHistory = useCallback(() => {
    dragHistoryBeforeRef.current = captureSceneSnapshot(
      spineRowsRef.current,
      placeholderLayoutTargetRef.current,
    )
  }, [])

  const onSpineDragEndForHistory = useCallback(() => {
    const before = dragHistoryBeforeRef.current
    dragHistoryBeforeRef.current = null
    if (!before) return
    const after = captureSceneSnapshot(spineRowsRef.current, placeholderLayoutTargetRef.current)
    if (!snapshotsEqual(before, after)) {
      pushUndoSnapshotFrom(before)
      const layout = placeholderLayoutTargetRef.current
      if (layout === 'main') {
        setSpineRows((prev) =>
          prev.map((r) => {
            const ap = after.positions[r.id]
            if (!ap) return r
            const bp = before.positions[r.id]
            if (bp && bp.x === ap.x && bp.y === ap.y) return r
            if (r.pinnedUnder) {
              return { ...r, pinnedBoneOffsetMain: { x: ap.x, y: ap.y } }
            }
            return { ...r, canonicalWorld: { x: ap.x, y: ap.y } }
          }),
        )
      } else if (layout === 'pt') {
        setSpineRows((prev) =>
          prev.map((r) => {
            const ap = after.positions[r.id]
            if (!ap) return r
            const bp = before.positions[r.id]
            if (bp && bp.x === ap.x && bp.y === ap.y) return r
            if (r.pinnedUnder) {
              const base = bp ?? ap
              const main = r.pinnedBoneOffsetMain ?? { x: base.x, y: base.y }
              const same = ap.x === main.x && ap.y === main.y
              return {
                ...r,
                pinnedBoneOffsetMain: r.pinnedBoneOffsetMain ?? main,
                pinnedBoneLayoutPt: same ? undefined : { x: ap.x, y: ap.y },
              }
            }
            return { ...r, layoutPt: { ...(r.layoutPt ?? {}), x: ap.x, y: ap.y } }
          }),
        )
      } else if (layout === 'ls') {
        setSpineRows((prev) =>
          prev.map((r) => {
            const ap = after.positions[r.id]
            if (!ap) return r
            const bp = before.positions[r.id]
            if (bp && bp.x === ap.x && bp.y === ap.y) return r
            if (r.pinnedUnder) {
              const base = bp ?? ap
              const main = r.pinnedBoneOffsetMain ?? { x: base.x, y: base.y }
              const same = ap.x === main.x && ap.y === main.y
              return {
                ...r,
                pinnedBoneOffsetMain: r.pinnedBoneOffsetMain ?? main,
                pinnedBoneLayoutLs: same ? undefined : { x: ap.x, y: ap.y },
              }
            }
            return { ...r, layoutLs: { ...(r.layoutLs ?? {}), x: ap.x, y: ap.y } }
          }),
        )
      } else if (layout === 'tb') {
        setSpineRows((prev) =>
          prev.map((r) => {
            const ap = after.positions[r.id]
            if (!ap) return r
            const bp = before.positions[r.id]
            if (bp && bp.x === ap.x && bp.y === ap.y) return r
            if (r.pinnedUnder) {
              const base = bp ?? ap
              const main = r.pinnedBoneOffsetMain ?? { x: base.x, y: base.y }
              const same = ap.x === main.x && ap.y === main.y
              return {
                ...r,
                pinnedBoneOffsetMain: r.pinnedBoneOffsetMain ?? main,
                pinnedBoneLayoutTb: same ? undefined : { x: ap.x, y: ap.y },
              }
            }
            return { ...r, layoutTb: { ...(r.layoutTb ?? {}), x: ap.x, y: ap.y } }
          }),
        )
      }
    }
  }, [pushUndoSnapshotFrom])

  /** Persist root world pose into canonical (Main) or portrait override after inspector / scrub. */
  const syncRootSpineLayoutStore = useCallback((rowId: string) => {
    const row = spineRowsRef.current.find((r) => r.id === rowId)
    const stage = stageRef.current
    if (!row || row.pinnedUnder || !stage) return
    const pos = stage.getSpineWorldPosition(row.spine)
    if (!pos) return
    const layout = placeholderLayoutTargetRef.current
    setSpineRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId || r.pinnedUnder) return r
        if (layout === 'main') return { ...r, canonicalWorld: { x: pos.x, y: pos.y } }
        if (layout === 'pt') return { ...r, layoutPt: { ...(r.layoutPt ?? {}), x: pos.x, y: pos.y } }
        if (layout === 'ls') return { ...r, layoutLs: { ...(r.layoutLs ?? {}), x: pos.x, y: pos.y } }
        if (layout === 'tb') return { ...r, layoutTb: { ...(r.layoutTb ?? {}), x: pos.x, y: pos.y } }
        return r
      }),
    )
  }, [])

  /** Persist nested bone-local offset for the active layout tab (inspector scrub / typed offset). */
  const syncPinnedBoneOffsetStore = useCallback((rowId: string) => {
    const row = spineRowsRef.current.find((r) => r.id === rowId)
    const stage = stageRef.current
    if (!row?.pinnedUnder || !stage) return
    const pos = stage.getSpineBoneLocalOffset(row.spine)
    if (!pos) return
    const layout = placeholderLayoutTargetRef.current
    setSpineRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId || !r.pinnedUnder) return r
        if (layout === 'main') {
          return { ...r, pinnedBoneOffsetMain: { x: pos.x, y: pos.y } }
        }
        const main = r.pinnedBoneOffsetMain
        if (!main) return r
        const sameAsMain = pos.x === main.x && pos.y === main.y
        if (layout === 'pt') {
          return { ...r, pinnedBoneLayoutPt: sameAsMain ? undefined : { x: pos.x, y: pos.y } }
        }
        if (layout === 'ls') {
          return { ...r, pinnedBoneLayoutLs: sameAsMain ? undefined : { x: pos.x, y: pos.y } }
        }
        if (layout === 'tb') {
          return { ...r, pinnedBoneLayoutTb: sameAsMain ? undefined : { x: pos.x, y: pos.y } }
        }
        return r
      }),
    )
  }, [])

  /** Apply per-layout world pose + display scale on the stage when switching layout or after row updates. */
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const layout = placeholderLayoutTarget
    /** Must use `spineRows` here — `spineRowsRef` updates in useEffect *after* layout, so the ref would be stale on this commit. */
    for (const row of spineRows) {
      if (!row.pinnedUnder) {
        const cw = row.canonicalWorld ?? { x: row.spine.x, y: row.spine.y }
        if (layout === 'main') {
          stage.setSpineWorldPlacementXY(row.spine, cw.x, cw.y)
        } else if (layout === 'pt') {
          const t = row.layoutPt ?? cw
          stage.setSpineWorldPlacementXY(row.spine, t.x, t.y)
        } else if (layout === 'ls') {
          const t = row.layoutLs ?? cw
          stage.setSpineWorldPlacementXY(row.spine, t.x, t.y)
        } else if (layout === 'tb') {
          const t = row.layoutTb ?? cw
          stage.setSpineWorldPlacementXY(row.spine, t.x, t.y)
        }
      }
      const sx = effectiveRootSpineScale(row, layout)
      row.spine.scale.set(sx, sx)
    }
  }, [placeholderLayoutTarget, spineRows])

  /** Persist root uniform display scale for the active layout tab (see inspector “Display scale”). */
  const onRootDisplayScaleChange = useCallback((rowId: string, scale: number) => {
    const layout = placeholderLayoutTargetRef.current
    setSpineRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId || r.pinnedUnder) return r
        if (layout === 'main') return { ...r, canonicalScale: scale }
        if (layout === 'pt') return { ...r, layoutPtScale: scale }
        if (layout === 'ls') return { ...r, layoutLsScale: scale }
        if (layout === 'tb') return { ...r, layoutTbScale: scale }
        return r
      }),
    )
  }, [])

  const onWorldPositionEditBegin = useCallback(() => {
    worldPositionEditBeforeRef.current = captureSceneSnapshot(
      spineRowsRef.current,
      placeholderLayoutTargetRef.current,
    )
  }, [])

  const onWorldPositionEditEnd = useCallback(
    (committed: boolean) => {
      const before = worldPositionEditBeforeRef.current
      worldPositionEditBeforeRef.current = null
      if (!committed || !before) return
      const after = captureSceneSnapshot(spineRowsRef.current, placeholderLayoutTargetRef.current)
      if (!snapshotsEqual(before, after)) {
        pushUndoSnapshotFrom(before)
      }
    },
    [pushUndoSnapshotFrom],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return
      if (isTextInputEventTarget(e.target)) return
      const k = e.key.toLowerCase()
      if (k === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (k === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const [backdropMode, setBackdropMode] = useState<StageBackdropMode>('dark')
  const [stageScale, setStageScale] = useState(1)
  const [showMetricsOverlay, setShowMetricsOverlay] = useState(false)
  const [showWorldGrid, setShowWorldGrid] = useState(true)
  /** Canvas pick highlight (inspector); synced with hierarchy or direct canvas click on a skeleton. */
  const [canvasDragSpineId, setCanvasDragSpineId] = useState<string | null>(null)

  const [isolateMode, setIsolateMode] = useState(false)
  const [isolateSpineOrder, setIsolateSpineOrder] = useState<string[]>([])
  const [isolateAnimQueues, setIsolateAnimQueues] = useState<Record<string, string[]>>({})
  const [isolatePlaying, setIsolatePlaying] = useState(false)
  const [isolateAnimLabels, setIsolateAnimLabels] = useState<Record<string, string>>({})
  /** Per isolated skeleton: Spine {@link AnimationState#timeScale} while in isolate mode (1 = normal). */
  const [isolateAnimSpeed, setIsolateAnimSpeed] = useState<Record<string, number>>({})
  /** Title-bar play toggle for normal (non-isolate) mode. */
  const [scenePlaying, setScenePlaying] = useState(false)

  const [consoleTab, setConsoleTab] = useState<'validation' | 'scenario'>('validation')
  const [scenarioMode, setScenarioMode] = useState(false)
  const [scenarioTracks, setScenarioTracks] = useState<ScenarioTrack[]>([])
  const [scenarioCompTime, setScenarioCompTime] = useState(0)
  const [scenarioTransportPlaying, setScenarioTransportPlaying] = useState(false)
  const [scenarioLoop, setScenarioLoop] = useState(false)
  const [scenarioFps, setScenarioFps] = useState(30)
  const [scenarioMarkers, setScenarioMarkers] = useState<ScenarioMarker[]>([])
  const scenarioGapHiddenRef = useRef(new Set<string>())
  const scenarioModeRef = useRef(false)
  const scenarioLoopRef = useRef(false)
  const scenarioTimeRef = useRef(0)
  const scenarioDurationRef = useRef(1)
  const scenarioTracksRef = useRef<ScenarioTrack[]>([])
  /** Scenario timeline lane order (spine row ids) — independent of hierarchy `layerOrder`. */
  const [scenarioLaneOrder, setScenarioLaneOrder] = useState<string[]>([])
  const scenarioLaneOrderRef = useRef<string[]>([])
  const scenarioTransportPlayingRef = useRef(false)
  /** Driven from {@link PixiStage}'s ticker — one composition step per rendered frame (see ref prop). */
  const scenarioCompositionTransportRef = useRef<((deltaSec: number) => void) | null>(null)
  const scenarioTransportUiThrottleRef = useRef(0)
  /** When exiting Scenario, restore the layout tab the user had before entering. */
  const scenarioLayoutBackupRef = useRef<PlaceholderLayoutKey | null>(null)
  /**
   * Last {@link scenarioPlaceholderAttachSig} for which we ran full placeholder reconcile during
   * scenario. `null` = must reconcile on next sync (seek, timeline edit, enter scenario, …).
   */
  const scenarioAttachReconcileSigRef = useRef<string | null>(null)

  const scenarioDuration = useMemo(
    () => computeScenarioDurationSec(scenarioTracks),
    [scenarioTracks],
  )
  useEffect(() => {
    scenarioDurationRef.current = Math.max(0.001, scenarioDuration)
  }, [scenarioDuration])

  useEffect(() => {
    scenarioAttachReconcileSigRef.current = null
  }, [scenarioTracks])

  useEffect(() => {
    if (scenarioMode) return
    const b = scenarioLayoutBackupRef.current
    if (b === null) return
    scenarioLayoutBackupRef.current = null
    setPlaceholderLayoutTarget(b)
  }, [scenarioMode])

  useEffect(() => {
    if (!scenarioMode) return
    const dur = computeScenarioDurationSec(scenarioTracks)
    if (!(dur > 0)) return
    setScenarioCompTime((t) => (t > dur ? dur : t))
    scenarioTimeRef.current = Math.min(scenarioTimeRef.current, dur)
  }, [scenarioMode, scenarioTracks])

  useEffect(() => {
    scenarioLaneOrderRef.current = scenarioLaneOrder
  }, [scenarioLaneOrder])

  useLayoutEffect(() => {
    scenarioTracksRef.current = scenarioTracks
    scenarioModeRef.current = scenarioMode
    scenarioLoopRef.current = scenarioLoop
    scenarioTransportPlayingRef.current = scenarioTransportPlaying
    if (!scenarioTransportPlaying) {
      scenarioTimeRef.current = scenarioCompTime
    }
  }, [
    scenarioTracks,
    scenarioMode,
    scenarioLoop,
    scenarioTransportPlaying,
    scenarioCompTime,
  ])

  const isolateAnimSpeedRef = useRef(isolateAnimSpeed)
  useEffect(() => {
    isolateAnimSpeedRef.current = isolateAnimSpeed
  }, [isolateAnimSpeed])
  const isolateBackupRef = useRef<IsolateModeBackup | null>(null)
  /** When isolate list changes, re-layout row at origin + refit camera (see isolate layout effect). */
  const isolateCamLayoutKeyRef = useRef<string>('')
  const pendingIsolateRestoreRef = useRef<IsolateModeBackup | null>(null)
  const isolateAnimQueuesRef = useRef(isolateAnimQueues)
  useEffect(() => {
    isolateAnimQueuesRef.current = isolateAnimQueues
  }, [isolateAnimQueues])
  const isolateSpineOrderRef = useRef(isolateSpineOrder)
  useEffect(() => {
    isolateSpineOrderRef.current = isolateSpineOrder
  }, [isolateSpineOrder])
  const isolateSeqRef = useRef<Array<{ spine: Spine; listener: AnimationStateListener }>>([])

  useEffect(() => {
    const liveIds = new Set(spineRows.map((r) => r.id))
    setIsolateSpineOrder((prev) => {
      const next = prev.filter((id) => liveIds.has(id))
      return next.length === prev.length ? prev : next
    })
    setIsolateAnimQueues((prev) => {
      let changed = false
      const next: Record<string, string[]> = {}
      for (const [id, q] of Object.entries(prev)) {
        if (!liveIds.has(id)) {
          changed = true
          continue
        }
        next[id] = q
      }
      return changed ? next : prev
    })
    setIsolateAnimSpeed((prev) => {
      let changed = false
      const next: Record<string, number> = {}
      for (const [id, speed] of Object.entries(prev)) {
        if (!liveIds.has(id)) {
          changed = true
          continue
        }
        next[id] = speed
      }
      return changed ? next : prev
    })
  }, [spineRows])

  useEffect(() => {
    if (!canvasDragSpineId) return
    if (!spineRows.some((r) => r.id === canvasDragSpineId)) setCanvasDragSpineId(null)
  }, [canvasDragSpineId, spineRows])

  const toggleCanvasDragPickForRow = useCallback((id: string) => {
    setCanvasDragSpineId((prev) => (prev === id ? null : id))
  }, [])

  /** Hierarchy click: inspector selection + canvas pick so the object can be dragged on the stage immediately. */
  const selectFromHierarchy = useCallback((id: string) => {
    const isSpine = spineRowsRef.current.some((r) => r.id === id)
    if (isSpine) {
      setSelectedSpineId(id)
      setSelectedSpriteId(null)
      setCanvasDragSpineId(id)
    } else {
      setSelectedSpriteId(id)
      setSelectedSpineId(null)
      setCanvasDragSpineId(null)
    }
  }, [])

  const selectSpineFromCanvas = useCallback(
    (spine: Spine) => {
      const row = spineRows.find((r) => r.spine === spine)
      if (!row) return
      setSelectedSpineId(row.id)
      setSelectedSpriteId(null)
      setCanvasDragSpineId(row.id)
    },
    [spineRows],
  )

  const selectSpriteFromCanvas = useCallback(
    (sprite: AnySprite) => {
      const row = spriteRowsRef.current.find((r) => r.sprite === sprite)
      if (!row) return
      setSelectedSpriteId(row.id)
      setSelectedSpineId(null)
      setCanvasDragSpineId(null)
    },
    [],
  )

  const getSpineDragEnabled = useCallback((spine: Spine) => {
    const row = spineRows.find((r) => r.spine === spine)
    return row ? !row.locked && (!row.placeholderPolicyFrozen || row.placeholderPolicyIgnored) : true
  }, [spineRows])

  const getSpriteDragEnabled = useCallback((sprite: AnySprite) => {
    if (isolateMode) return false
    const row = spriteRowsRef.current.find((r) => r.sprite === sprite)
    return row ? !row.locked : true
  }, [isolateMode])

  const dragSpriteBeforeRef = useRef<number>(0)

  const onSpriteDragStartForHistory = useCallback(() => {
    dragSpriteBeforeRef.current = historyTick
  }, [historyTick])

  const onSpriteDragEndForHistory = useCallback(() => {
    setHistoryTick((t) => t + 1)
  }, [])

  /** Imperative scenario pose + spine visibility (refs) — safe to call from the scenario RAF loop. */
  const syncScenarioSpineWorld = useCallback((t: number) => {
    if (!scenarioModeRef.current) return
    const rows = spineRowsRef.current
    const tracks = scenarioTracksRef.current
    const layout = placeholderLayoutTargetRef.current
    applyScenarioAtCompositionTime(tracks, rows, t, scenarioGapHiddenRef.current)
    const gap = scenarioGapHiddenRef.current
    for (const row of rows) {
      let vis = effectiveLayerVisible(row, layout)
      if (gap.has(row.id)) vis = false
      row.spine.visible = vis
      const effectivelyFrozen = row.placeholderPolicyFrozen && !row.placeholderPolicyIgnored
      row.spine.cursor = row.locked || effectivelyFrozen ? 'default' : 'grab'
    }

    const stage = stageRef.current
    if (!stage) return
    const want = computeScenarioSoloPinnedChildIds(rows, gap)
    const attachSig = scenarioPlaceholderAttachSig(layout, gap, want)
    if (attachSig !== scenarioAttachReconcileSigRef.current) {
      scenarioAttachReconcileSigRef.current = attachSig
      stage.reconcilePlaceholderAttachments(
        rows.map((r) => ({
          id: r.id,
          spine: r.spine,
          placeholderBindings: r.placeholderPolicyFrozen && !r.placeholderPolicyIgnored ? {} : r.placeholderBindings,
        })),
        layout,
        want.size > 0 ? { scenarioSoloChildIds: want } : undefined,
      )
    }
  }, [])

  const seekScenarioMarker = useCallback(
    (t: number) => {
      if (scenarioTransportPlayingRef.current) {
        setScenarioCompTime(scenarioTimeRef.current)
      }
      setScenarioTransportPlaying(false)
      const dur = computeScenarioDurationSec(scenarioTracksRef.current, 0)
      const maxT = dur > 0 ? dur : Number.POSITIVE_INFINITY
      const clamped = Math.min(Math.max(0, t), maxT)
      scenarioTimeRef.current = clamped
      setScenarioCompTime(clamped)
      scenarioAttachReconcileSigRef.current = null
      syncScenarioSpineWorld(clamped)
    },
    [syncScenarioSpineWorld],
  )

  const addScenarioMarker = useCallback(
    (label: string, timeSec: number) => {
      const name = label.trim()
      if (!name) return
      pushUndoSnapshot()
      setScenarioMarkers((prev) =>
        [...prev, { id: newScenarioMarkerId(), timeSec, label: name }].sort((a, b) => a.timeSec - b.timeSec),
      )
    },
    [pushUndoSnapshot],
  )

  const removeScenarioMarker = useCallback(
    (id: string) => {
      pushUndoSnapshot()
      setScenarioMarkers((prev) => prev.filter((m) => m.id !== id))
    },
    [pushUndoSnapshot],
  )

  const beginScenarioMarkerDragUndo = useCallback(() => {
    pushUndoSnapshot()
  }, [pushUndoSnapshot])

  const setScenarioMarkerTime = useCallback((id: string, timeSec: number) => {
    const dur = computeScenarioDurationSec(scenarioTracksRef.current, 0)
    const maxT = dur > 0 ? dur : Number.POSITIVE_INFINITY
    const clamped = Math.min(Math.max(0, timeSec), maxT)
    setScenarioMarkers((prev) =>
      [...prev.map((m) => (m.id === id ? { ...m, timeSec: clamped } : m))].sort((a, b) => a.timeSec - b.timeSec),
    )
  }, [])

  // Normal mode only — do not depend on scenario timeline state (that caused redundant
  // reconcilePlaceholderAttachments + spine visibility passes when Scenario was off).
  // Skip while Isolate is on: useLayoutEffect already reconciles with isolateRootChildIds; a second
  // reconcile here (without isolate options) was undoing floated nested symbols — e.g. after @1x/@2x.
  useEffect(() => {
    if (scenarioMode) return
    if (isolateMode) return
    scenarioGapHiddenRef.current.clear()
    stageRef.current?.reconcilePlaceholderAttachments(
      spineRows.map((r) => ({
        id: r.id,
        spine: r.spine,
        placeholderBindings: (r.placeholderPolicyFrozen && !r.placeholderPolicyIgnored) ? {} : r.placeholderBindings,
      })),
      placeholderLayoutTarget,
    )
    for (const row of spineRows) {
      row.spine.visible = effectiveLayerVisible(row, placeholderLayoutTarget)
      const effectivelyFrozen = row.placeholderPolicyFrozen && !row.placeholderPolicyIgnored
      row.spine.cursor = row.locked || effectivelyFrozen ? 'default' : 'grab'
    }
  }, [scenarioMode, isolateMode, spineRows, placeholderLayoutTarget])

  // Scenario pose when not playing — RAF loop handles updates while transport is running.
  useEffect(() => {
    if (!scenarioMode || scenarioTransportPlaying) return
    syncScenarioSpineWorld(scenarioCompTime)
  }, [scenarioMode, scenarioTransportPlaying, scenarioCompTime, scenarioTracks, syncScenarioSpineWorld])

  useEffect(() => {
    for (const row of spriteRows) {
      row.sprite.visible = effectiveLayerVisible(row, placeholderLayoutTarget)
      row.sprite.cursor = row.locked ? 'default' : 'grab'
    }
  }, [spriteRows, placeholderLayoutTarget])

  const toggleRowLocked = useCallback(
    (id: string) => {
      pushUndoSnapshot()
      setSpineRows((rows) => rows.map((r) => (r.id === id ? { ...r, locked: !r.locked } : r)))
      setSpriteRows((rows) => rows.map((r) => (r.id === id ? { ...r, locked: !r.locked } : r)))
    },
    [pushUndoSnapshot],
  )

  const toggleRowLayerVisible = useCallback(
    (id: string) => {
      if (placeholderLayoutTarget === 'main') return
      pushUndoSnapshot()
      const L = placeholderLayoutTarget
      setSpineRows((rows) =>
        rows.map((r) => {
          if (r.id !== id) return r
          const eff = effectiveLayerVisible(r, L)
          if (L === 'pt') {
            if (eff) return { ...r, layoutPtLayerVisible: false }
            return { ...r, layoutPtLayerVisible: r.layerVisible ? undefined : true }
          }
          if (L === 'ls') {
            if (eff) return { ...r, layoutLsLayerVisible: false }
            return { ...r, layoutLsLayerVisible: r.layerVisible ? undefined : true }
          }
          if (L === 'tb') {
            if (eff) return { ...r, layoutTbLayerVisible: false }
            return { ...r, layoutTbLayerVisible: r.layerVisible ? undefined : true }
          }
          return r
        }),
      )
      setSpriteRows((rows) =>
        rows.map((r) => {
          if (r.id !== id) return r
          const eff = effectiveLayerVisible(r, L)
          if (L === 'pt') {
            if (eff) return { ...r, layoutPtLayerVisible: false }
            return { ...r, layoutPtLayerVisible: r.layerVisible ? undefined : true }
          }
          if (L === 'ls') {
            if (eff) return { ...r, layoutLsLayerVisible: false }
            return { ...r, layoutLsLayerVisible: r.layerVisible ? undefined : true }
          }
          if (L === 'tb') {
            if (eff) return { ...r, layoutTbLayerVisible: false }
            return { ...r, layoutTbLayerVisible: r.layerVisible ? undefined : true }
          }
          return r
        }),
      )
    },
    [placeholderLayoutTarget, pushUndoSnapshot],
  )

  const [selectedSpineId, setSelectedSpineId] = useState<string | null>(null)

  useEffect(() => {
    if (spineRows.length === 0) {
      setSelectedSpineId(null)
      return
    }
    setSelectedSpineId((prev) =>
      prev !== null && spineRows.some((r) => r.id === prev) ? prev : null,
    )
  }, [spineRows])

  useEffect(() => {
    if (!selectedSpriteId) return
    if (!spriteRows.some((r) => r.id === selectedSpriteId)) setSelectedSpriteId(null)
  }, [selectedSpriteId, spriteRows])

  const selectedRow = useMemo(
    () => spineRows.find((r) => r.id === selectedSpineId) ?? null,
    [spineRows, selectedSpineId],
  )

  const selectedSpriteRow = useMemo(
    () => spriteRows.find((r) => r.id === selectedSpriteId) ?? null,
    [spriteRows, selectedSpriteId],
  )

  const isolateEnterUiRef = useRef({
    selectedSpineId: null as string | null,
    selectedSpriteId: null as string | null,
    canvasDragSpineId: null as string | null,
    backdropMode: 'dark' as StageBackdropMode,
    showWorldGrid: true,
    showMetricsOverlay: false,
  })
  isolateEnterUiRef.current = {
    selectedSpineId,
    selectedSpriteId,
    canvasDragSpineId,
    backdropMode,
    showWorldGrid,
    showMetricsOverlay,
  }

  // ── 9-slice guide callbacks (stable wrappers referencing refs) ─────────────
  const guideInsetChangeRef = useRef<((newInsets: NineSliceInsets) => void) | null>(null)
  const guideDragStartRef   = useRef<(() => void) | null>(null)
  const guideDragEndRef     = useRef<(() => void) | null>(null)

  guideInsetChangeRef.current = (newInsets: NineSliceInsets) => {
    const row = spriteRowsRef.current.find((r) => r.id === selectedSpriteIdRef.current)
    if (!row?.nineSlice) return
    row.nineSliceInsets = newInsets
    stageRef.current?.updateNineSliceInsets(row, newInsets)
  }

  guideDragStartRef.current = () => {
    setHistoryTick((t) => t + 1)
  }

  guideDragEndRef.current = () => {
    const row = spriteRowsRef.current.find((r) => r.id === selectedSpriteIdRef.current)
    if (!row) return
    // Push a copy with updated insets so the inspector re-renders
    setSpriteRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, nineSliceInsets: { ...row.nineSliceInsets } } : r)),
    )
    setHistoryTick((t) => t + 1)
  }

  // Show/hide guides whenever the selected sprite changes
  useEffect(() => {
    if (!selectedSpriteId) {
      stageRef.current?.hideNineSliceGuides()
      return
    }
    const row = spriteRowsRef.current.find((r) => r.id === selectedSpriteId)
    if (row?.nineSlice) {
      stageRef.current?.showNineSliceGuides(
        row,
        row.nineSliceInsets,
        (ins) => guideInsetChangeRef.current?.(ins),
        () => guideDragStartRef.current?.(),
        () => guideDragEndRef.current?.(),
      )
    } else {
      stageRef.current?.hideNineSliceGuides()
    }
  }, [selectedSpriteId])

  const handleNineSliceToggle = useCallback(
    (enabled: boolean, row: SpriteRow) => {
      if (enabled) {
        stageRef.current?.showNineSliceGuides(
          row,
          row.nineSliceInsets,
          (ins) => guideInsetChangeRef.current?.(ins),
          () => guideDragStartRef.current?.(),
          () => guideDragEndRef.current?.(),
        )
      } else {
        stageRef.current?.hideNineSliceGuides()
      }
    },
    [],
  )

  const atlas1xAvailable = useMemo(
    () =>
      spineRows.some(
        (r) =>
          (r.atlasAvailableTags ?? []).includes('1x') || (r.activeAtlasTag ?? '') === '1x',
      ),
    [spineRows],
  )
  const atlas2xAvailable = useMemo(
    () =>
      spineRows.some(
        (r) =>
          (r.atlasAvailableTags ?? []).includes('2x') || (r.activeAtlasTag ?? '') === '2x',
      ),
    [spineRows],
  )
  const atlasStemPreviewVisible = atlas1xAvailable || atlas2xAvailable

  /** Grid axes / spine anchors: normal layout authoring (Main, Portrait, Landscape, Tablet) only. */
  const showWorldGridOnStage = showWorldGrid && !isolateMode && !scenarioMode

  /** Toolbar highlight: match loader preference (@2x first) so @2x is active when unset. */
  useEffect(() => {
    if (atlasSessionTag != null) return
    if (atlas2xAvailable) setAtlasSessionTag('2x')
    else if (atlas1xAvailable) setAtlasSessionTag('1x')
  }, [atlasSessionTag, atlas1xAvailable, atlas2xAvailable])

  const [hierarchyDragId, setHierarchyDragId] = useState<string | null>(null)
  const [hierarchyDragOverId, setHierarchyDragOverId] = useState<string | null>(null)

  /** Run before placeholder reconcile on the same frame so scene poses / playback apply first (exit isolate). */
  useLayoutEffect(() => {
    if (isolateMode) return
    const b = pendingIsolateRestoreRef.current
    if (!b) return
    pendingIsolateRestoreRef.current = null
    const next = applySceneSnapshot(spineRowsRef.current, b.scene, b.layoutTarget)
    for (const r of next) {
      const pb = b.spinePlayback[r.id]
      if (pb) restoreSpinePlaybackBackup(r.spine, pb)
      else if (!r.spine.destroyed) resetSpineToSetupPoseAndClearTracks(r.spine)
    }
    for (const r of spriteRowsRef.current) {
      if (typeof b.spriteVisible[r.id] === 'boolean') {
        r.sprite.visible = b.spriteVisible[r.id]!
      }
    }
    setLayerOrder(b.layerOrder)
    setSpineRows(next)
    setPlaceholderLayoutTarget(b.layoutTarget)
    setSelectedSpineId(b.selectedSpineId)
    setSelectedSpriteId(b.selectedSpriteId)
    setCanvasDragSpineId(b.canvasDragSpineId)
    setBackdropMode(b.backdropMode)
    setShowWorldGrid(b.showWorldGrid)
    setShowMetricsOverlay(b.showMetricsOverlay)
  }, [isolateMode])

  // Sync z-order for all objects (spines + sprites) based on unified layerOrder.
  useEffect(() => {
    const order: Array<{ kind: 'spine' | 'sprite'; obj: never }> = []
    for (const id of layerOrder) {
      const spine = spineRows.find((r) => r.id === id)
      if (spine) { order.push({ kind: 'spine', obj: spine.spine as never }); continue }
      const spriteRow = spriteRows.find((r) => r.id === id)
      if (spriteRow) { order.push({ kind: 'sprite', obj: spriteRow.sprite as never }); continue }
    }
    if (order.length > 0) stageRef.current?.syncFullLayerOrder(order)
  }, [layerOrder, spineRows, spriteRows])

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const isolateRootChildIds =
      isolateMode
        ? (() => {
            const isolated = new Set(isolateSpineOrder)
            return new Set(
              isolateSpineOrder.filter((id) => {
                const row = spineRows.find((r) => r.id === id)
                if (!row?.pinnedUnder) return false
                // Float only when host is hidden in isolate; if host is visible, keep child nested.
                return !isolated.has(row.pinnedUnder.hostRowId)
              }),
            )
          })()
        : null
    stage.reconcilePlaceholderAttachments(
      spineRows.map((r) => ({
        id: r.id,
        spine: r.spine,
        placeholderBindings: (r.placeholderPolicyFrozen && !r.placeholderPolicyIgnored) ? {} : r.placeholderBindings,
      })),
      placeholderLayoutTarget,
      isolateRootChildIds && isolateRootChildIds.size > 0
        ? { isolateRootChildIds }
        : undefined,
    )
    if (isolateMode) return
    const mainInits: Array<{ id: string; x: number; y: number }> = []
    for (const row of spineRows) {
      if (!row.pinnedUnder) continue
      if (
        row.pinnedBoneOffsetMain == null &&
        row.pinnedBoneLayoutPt == null &&
        row.pinnedBoneLayoutLs == null &&
        row.pinnedBoneLayoutTb == null
      ) {
        const pos = stage.getSpineBoneLocalOffset(row.spine)
        if (pos) mainInits.push({ id: row.id, x: pos.x, y: pos.y })
      }
    }
    const rowsForApply =
      mainInits.length === 0
        ? spineRows
        : spineRows.map((row) => {
            const it = mainInits.find((m) => m.id === row.id)
            if (!it) return row
            return { ...row, pinnedBoneOffsetMain: { x: it.x, y: it.y } }
          })
    for (const row of rowsForApply) {
      if (!row.pinnedUnder) continue
      const o = effectivePinnedBoneOffset(row, placeholderLayoutTarget)
      stage.setSpineBoneLocalOffset(row.spine, o.x, o.y)
    }
    if (mainInits.length > 0) {
      const snapshot = mainInits.slice()
      queueMicrotask(() => {
        setSpineRows((prev) => {
          let changed = false
          const next = prev.map((row) => {
            const it = snapshot.find((m) => m.id === row.id)
            if (!it || row.pinnedBoneOffsetMain != null) return row
            changed = true
            return { ...row, pinnedBoneOffsetMain: { x: it.x, y: it.y } }
          })
          return changed ? next : prev
        })
      })
    }
  }, [spineRows, placeholderLayoutTarget, isolateMode, isolateSpineOrder])

  const onPlaceholderBind = useCallback(
    (
      hostRowId: string,
      boneName: string,
      childRowId: string | null,
      op: 'replace' | 'add' | 'remove' = 'replace',
    ) => {
      if (scenarioModeRef.current) scenarioAttachReconcileSigRef.current = null
      setSpineRows((prev) => applyPlaceholderBinding(prev, hostRowId, boneName, childRowId, op))
    },
    [],
  )

  const moveHierarchyRowBeforeTarget = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) return
    pushUndoSnapshot()
    setLayerOrder((order) => {
      const from = order.indexOf(sourceId)
      const to = order.indexOf(targetId)
      if (from < 0 || to < 0) return order
      const next = [...order]
      const [item] = next.splice(from, 1)
      let insertAt = to
      if (from < to) insertAt = to - 1
      next.splice(insertAt, 0, item)
      return next
    })
  }, [pushUndoSnapshot])

  const moveScenarioLaneBeforeTarget = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) return
    pushUndoSnapshot()
    const order = scenarioLaneOrderRef.current
    const from = order.indexOf(sourceId)
    const to = order.indexOf(targetId)
    if (from < 0 || to < 0) return
    const next = [...order]
    const [item] = next.splice(from, 1)
    let insertAt = to
    if (from < to) insertAt = to - 1
    next.splice(insertAt, 0, item)
    setScenarioLaneOrder(next)
    setScenarioTracks((prev) => {
      const spineIds = new Set(spineRowsRef.current.map((r) => r.id))
      return orderTracksLikeLayerOrder(prev, next, spineIds)
    })
  }, [pushUndoSnapshot])

  const onHierarchyDragStart = useCallback((e: DragEvent<HTMLButtonElement>, id: string) => {
    setHierarchyDragId(id)
    e.dataTransfer.setData('text/plain', id)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const onHierarchyDragEnd = useCallback(() => {
    setHierarchyDragId(null)
    setHierarchyDragOverId(null)
  }, [])

  const onHierarchyDropOnItem = useCallback(
    (e: DragEvent<HTMLDivElement>, targetId: string) => {
      e.preventDefault()
      const sourceId = e.dataTransfer.getData('text/plain')
      setHierarchyDragOverId(null)
      setHierarchyDragId(null)
      if (!sourceId || sourceId === targetId) return
      moveHierarchyRowBeforeTarget(sourceId, targetId)
    },
    [moveHierarchyRowBeforeTarget],
  )

  const spineHandleById = useRef(new Map<string, SpineInstanceHandle | null>())

  const registerSpineHandle = useCallback(
    (id: string, handle: SpineInstanceHandle | null) => {
      if (handle) spineHandleById.current.set(id, handle)
      else spineHandleById.current.delete(id)
    },
    [],
  )

  const playAll = useCallback(() => {
    setScenePlaying(true)
    for (const row of spineRows) {
      if (row.placeholderPolicyFrozen && !row.placeholderPolicyIgnored) continue
      spineHandleById.current.get(row.id)?.prepareSyncStart()
    }
    requestAnimationFrame(() => {
      for (const row of spineRows) {
        if (row.placeholderPolicyFrozen && !row.placeholderPolicyIgnored) continue
        spineHandleById.current.get(row.id)?.beginPlayback()
      }
    })
  }, [spineRows])

  const pauseAll = useCallback(() => {
    setScenePlaying(false)
    for (const row of spineRows) {
      if (row.placeholderPolicyFrozen && !row.placeholderPolicyIgnored) continue
      spineHandleById.current.get(row.id)?.pausePlayback()
    }
  }, [spineRows])

  const restartAll = useCallback(() => {
    for (const row of spineRows) {
      if (row.placeholderPolicyFrozen && !row.placeholderPolicyIgnored) continue
      spineHandleById.current.get(row.id)?.rewindKeepTransport()
    }
  }, [spineRows])

  /** Stop sequence listeners and pause auto-update — skeletons stay on the current frame (use Reset for bind pose). */
  const stopIsolatePlayback = useCallback(() => {
    for (const { spine, listener } of isolateSeqRef.current) {
      if (!spine.destroyed) {
        spine.state.removeListener(listener)
        spine.autoUpdate = false
      }
    }
    isolateSeqRef.current = []
    setIsolatePlaying(false)
  }, [])

  /** Full clear: no listeners; bind pose then first frame of each queue’s first clip (or bind only if queue empty). */
  const resetIsolateAnimations = useCallback(() => {
    for (const { spine, listener } of isolateSeqRef.current) {
      if (!spine.destroyed) {
        spine.state.removeListener(listener)
      }
    }
    isolateSeqRef.current = []
    setIsolatePlaying(false)
    const labels: Record<string, string> = {}
    for (const id of isolateSpineOrderRef.current) {
      const row = spineRowsRef.current.find((r) => r.id === id)
      const q = isolateAnimQueuesRef.current[id] ?? []
      if (row) {
        resetSpineToSetupPoseAndClearTracks(row.spine)
        if (!row.spine.destroyed && q.length > 0) {
          applySpineClipAtTimeZero(row.spine, q[0]!, isolateAnimSpeedRef.current[id] ?? 1)
        }
        if (!row.spine.destroyed) row.spine.autoUpdate = false
      }
      labels[id] = q.length > 0 ? q[0]! : '—'
    }
    setIsolateAnimLabels(labels)
  }, [])

  const startIsolatePlayback = useCallback(() => {
    stopIsolatePlayback()
    setIsolatePlaying(true)
    const labels: Record<string, string> = {}
    for (const id of isolateSpineOrder) {
      const row = spineRows.find((r) => r.id === id)
      if (!row) continue
      const q = isolateAnimQueuesRef.current[id] ?? []
      if (q.length === 0) {
        labels[id] = '—'
        continue
      }
      const spine = row.spine
      resetSpineToSetupPoseAndClearTracks(spine)
      spine.autoUpdate = true
      const progress = { index: 0 }
      labels[id] = q[0]!
      applySpineClipAtTimeZero(spine, q[0]!, isolateAnimSpeedRef.current[id] ?? 1)
      const listener: AnimationStateListener = {
        complete: (e) => {
          if (e.loop) return
          const queue = isolateAnimQueuesRef.current[id] ?? []
          progress.index++
          if (progress.index < queue.length) {
            const name = queue[progress.index]!
            const te = spine.state.setAnimation(0, name, false)
            if (te) {
              te.mixDuration = 0
              te.trackTime = 0
            }
            setIsolateAnimLabels((prev) => ({ ...prev, [id]: name }))
          } else {
            const last = queue.length > 0 ? queue[queue.length - 1]! : '—'
            setIsolateAnimLabels((prev) => ({ ...prev, [id]: last }))
          }
        },
      }
      spine.state.addListener(listener)
      isolateSeqRef.current.push({ spine, listener })
    }
    setIsolateAnimLabels(labels)
  }, [isolateSpineOrder, spineRows, stopIsolatePlayback])

  /** Title bar ▶ / ⏸ / ↺: scene transport in normal mode; isolate queue play / stop / reset in isolate mode. */
  const transportPlay = useCallback(() => {
    if (isolateMode) {
      if (isolateSpineOrder.length === 0) return
      startIsolatePlayback()
      return
    }
    if (scenarioMode) {
      if (spineRows.length === 0) return
      syncScenarioSpineWorld(scenarioTimeRef.current)
      setScenarioTransportPlaying(true)
      return
    }
    playAll()
  }, [
    isolateMode,
    isolateSpineOrder.length,
    playAll,
    startIsolatePlayback,
    scenarioMode,
    spineRows.length,
    syncScenarioSpineWorld,
  ])

  const transportPause = useCallback(() => {
    if (isolateMode) {
      stopIsolatePlayback()
      return
    }
    if (scenarioMode) {
      setScenarioCompTime(scenarioTimeRef.current)
      setScenarioTransportPlaying(false)
      return
    }
    pauseAll()
  }, [isolateMode, pauseAll, stopIsolatePlayback, scenarioMode])

  const transportRestart = useCallback(() => {
    if (isolateMode) {
      resetIsolateAnimations()
      return
    }
    if (scenarioMode) {
      setScenarioCompTime(0)
      scenarioTimeRef.current = 0
      return
    }
    restartAll()
  }, [isolateMode, resetIsolateAnimations, restartAll, scenarioMode])

  useEffect(() => {
    if (isolateMode) return
    if (spineRows.length === 0) setScenePlaying(false)
  }, [isolateMode, spineRows.length])

  useEffect(() => {
    if (scenarioMode) setScenePlaying(false)
  }, [scenarioMode])

  useEffect(() => {
    if (spineRows.length > 0 || !scenarioMode) return
    setScenarioMode(false)
    setScenarioTransportPlaying(false)
    scenarioGapHiddenRef.current.clear()
    setScenarioLaneOrder([])
    setScenarioMarkers([])
    setScenarioTracks([])
    setConsoleTab('validation')
  }, [spineRows.length, scenarioMode])

  useLayoutEffect(() => {
    if (!scenarioMode || !scenarioTransportPlaying) {
      scenarioCompositionTransportRef.current = null
      return
    }
    scenarioCompositionTransportRef.current = (dt) => {
      if (!scenarioModeRef.current || !scenarioTransportPlayingRef.current) return
      const dur = scenarioDurationRef.current
      let t = scenarioTimeRef.current + dt
      if (t >= dur) {
        if (scenarioLoopRef.current) {
          t = t % dur
        } else {
          t = dur
          scenarioTimeRef.current = t
          syncScenarioSpineWorld(t)
          setScenarioCompTime(t)
          setScenarioTransportPlaying(false)
          scenarioCompositionTransportRef.current = null
          return
        }
      }
      scenarioTimeRef.current = t
      syncScenarioSpineWorld(t)
      const now = performance.now()
      if (now - scenarioTransportUiThrottleRef.current >= 50) {
        scenarioTransportUiThrottleRef.current = now
        setScenarioCompTime(t)
      }
    }
    return () => {
      scenarioCompositionTransportRef.current = null
    }
  }, [scenarioMode, scenarioTransportPlaying, syncScenarioSpineWorld])

  const enableScenarioMode = useCallback(() => {
    pauseAll()
    setScenarioTransportPlaying(false)
    setScenarioCompTime(0)
    scenarioTimeRef.current = 0
    scenarioAttachReconcileSigRef.current = null
    scenarioLayoutBackupRef.current = placeholderLayoutTargetRef.current
    setPlaceholderLayoutTarget('main')
    setScenarioMode(true)
    setConsoleTab('scenario')
    const spineIds = new Set(spineRowsRef.current.map((r) => r.id))
    let lo = layerOrderRef.current.filter((id) => spineIds.has(id))
    for (const r of spineRowsRef.current) {
      if (!lo.includes(r.id)) lo.push(r.id)
    }
    setScenarioLaneOrder(lo)
    setScenarioTracks((cur) => {
      if (cur.length === 0 && spineRowsRef.current.length > 0) {
        return emptyScenarioTracksFromScene(lo, spineRowsRef.current)
      }
      return orderTracksLikeLayerOrder(cur, lo, spineIds)
    })
  }, [pauseAll])

  const disableScenarioMode = useCallback(() => {
    setScenarioMode(false)
    setScenarioTransportPlaying(false)
    scenarioAttachReconcileSigRef.current = null
    scenarioGapHiddenRef.current.clear()
    // Keep lane order, markers, and tracks — they still serialize in .mancala and reload correctly.
    // Clearing them here made "save after turning Scenario off" drop markers from the file.
    setConsoleTab('validation')
    pauseAll()
  }, [pauseAll])

  useEffect(() => {
    if (!scenarioMode) return
    const spineIds = new Set(spineRows.map((r) => r.id))
    setScenarioLaneOrder((prevLo) => {
      let lo = prevLo.filter((id) => spineIds.has(id))
      const seen = new Set(lo)
      for (const r of spineRows) {
        if (!seen.has(r.id)) {
          lo.push(r.id)
          seen.add(r.id)
        }
      }
      setScenarioTracks((prev) => {
        let next = prev.filter((t) => spineIds.has(t.spineRowId))
        const have = new Set(next.map((t) => t.spineRowId))
        for (const id of lo) {
          if (have.has(id)) continue
          const row = spineRows.find((r) => r.id === id)
          if (!row) continue
          const seeded = emptyScenarioTracksFromScene([id], [row])
          if (seeded[0]) {
            next.push(seeded[0])
            have.add(id)
          }
        }
        return orderTracksLikeLayerOrder(next, lo, spineIds)
      })
      return lo
    })
  }, [scenarioMode, spineRows])

  const enterIsolateMode = useCallback(() => {
    if (spineRowsRef.current.length === 0) return
    if (scenarioModeRef.current) {
      setScenarioMode(false)
      setScenarioTransportPlaying(false)
      scenarioGapHiddenRef.current.clear()
    }
    pauseAll()
    const scene = captureSceneSnapshot(spineRowsRef.current, placeholderLayoutTargetRef.current)
    const spinePlayback: Record<string, SpinePlaybackBackup> = {}
    for (const r of spineRowsRef.current) {
      spinePlayback[r.id] = captureSpinePlaybackBackup(r.spine)
    }
    const spriteVisible: Record<string, boolean> = {}
    for (const r of spriteRowsRef.current) {
      spriteVisible[r.id] = r.sprite.visible
    }
    const ui = isolateEnterUiRef.current
    isolateBackupRef.current = {
      scene,
      layoutTarget: placeholderLayoutTargetRef.current,
      layerOrder: [...layerOrderRef.current],
      selectedSpineId: ui.selectedSpineId,
      selectedSpriteId: ui.selectedSpriteId,
      canvasDragSpineId: ui.canvasDragSpineId,
      spinePlayback,
      spriteVisible,
      backdropMode: ui.backdropMode,
      showWorldGrid: ui.showWorldGrid,
      showMetricsOverlay: ui.showMetricsOverlay,
    }
    setIsolateSpineOrder([])
    setIsolateAnimQueues({})
    setIsolateAnimLabels({})
    setIsolateAnimSpeed({})
    setIsolatePlaying(false)
    // Isolate runs on a neutral canvas scene; preserve prior layout in backup and switch to Main.
    setPlaceholderLayoutTarget('main')
    setIsolateMode(true)
  }, [pauseAll])

  const exitIsolateMode = useCallback(() => {
    stopIsolatePlayback()
    const b = isolateBackupRef.current
    isolateBackupRef.current = null
    if (b) pendingIsolateRestoreRef.current = b
    setIsolateMode(false)
    // Hard isolate teardown: clear all isolate-only runtime/UI state so nothing is retained after exit.
    isolateSeqRef.current = []
    isolateSpineOrderRef.current = []
    isolateAnimQueuesRef.current = {}
    isolateAnimSpeedRef.current = {}
    setIsolateSpineOrder([])
    setIsolateAnimQueues({})
    setIsolateAnimSpeed({})
    setIsolateAnimLabels({})
    setIsolatePlaying(false)
    isolateCamLayoutKeyRef.current = ''
  }, [stopIsolatePlayback])

  useEffect(() => {
    if (!isolateMode) return
    const show = new Set(isolateSpineOrder)
    for (const r of spineRows) {
      r.spine.visible = show.has(r.id)
      if (show.has(r.id)) {
        r.spine.state.timeScale = isolateAnimSpeed[r.id] ?? 1
        if (r.placeholderPolicyFrozen && !r.placeholderPolicyIgnored) {
          r.spine.autoUpdate = true
        }
      }
    }
    for (const r of spriteRows) {
      r.sprite.visible = false
    }
  }, [isolateMode, isolateSpineOrder, spineRows, spriteRows, isolateAnimSpeed])

  useEffect(() => {
    if (!isolateMode) return
    const spines = isolateSpineOrder
      .map((id) => spineRows.find((r) => r.id === id)?.spine)
      .filter((s): s is Spine => Boolean(s))
    if (spines.length > 0) stageRef.current?.syncHierarchyDrawOrder(spines)
  }, [isolateMode, isolateSpineOrder, spineRows])

  useEffect(() => {
    if (!isolateMode) return
    stopIsolatePlayback()
  }, [isolateSpineOrder, isolateAnimQueues, isolateMode, stopIsolatePlayback])

  /**
   * Isolate preview uses a **neutral world layout** (centered row on Y = 0), not main-scene coordinates.
   * Runs after the visibility effect so bounds are valid. Camera resets then fits visible spines.
   */
  useEffect(() => {
    if (!isolateMode) {
      isolateCamLayoutKeyRef.current = ''
      return
    }
    if (isolateSpineOrder.length === 0) {
      if (isolateCamLayoutKeyRef.current !== '__empty__') {
        isolateCamLayoutKeyRef.current = '__empty__'
        requestAnimationFrame(() => stageRef.current?.resetStageView())
      }
      return
    }
    const key = isolateSpineOrder.join('|')
    if (key === isolateCamLayoutKeyRef.current) return
    isolateCamLayoutKeyRef.current = key

    const stage = stageRef.current
    if (!stage) return
    const n = isolateSpineOrder.length
    for (let i = 0; i < n; i++) {
      const id = isolateSpineOrder[i]!
      const row = spineRowsRef.current.find((r) => r.id === id)
      if (!row) continue
      const x = snapWorldScalar((i - (n - 1) / 2) * ISOLATE_ROW_STEP_WORLD)
      stage.setSpineWorldPlacementXY(row.spine, x, 0)
    }
    requestAnimationFrame(() => {
      const s = stageRef.current
      if (!s) return
      s.resetStageView()
      s.fitAllSpinesInView()
    })
  }, [isolateMode, isolateSpineOrder])

  const runLoad = useCallback(async (files: File[]) => {
    if (files.length === 0) return

    // Split: standalone images (not consumed by atlas grouping) → sprites; rest → spine pipeline.
    // We first run groupSpineFiles logic to claim texture pages, then treat leftover images as sprites.
    // For now, any image file that is NOT part of a spine atlas group is treated as a sprite.
    // The simplest heuristic: image files are potential sprites; we pass ALL files to the spine
    // pipeline (which ignores images it doesn't need) and ALSO create sprites for pure image drops.
    const imageFiles = files.filter(isImageFile)
    const nonImageFiles = files.filter((f) => !isImageFile(f))

    // Create sprite objects from standalone image files dropped directly.
    // (Images that are spine texture pages will also be in importedFilesRef but won't create sprites
    // because they have corresponding atlas files in the same drop.)
    const hasSpineFiles = nonImageFiles.some(
      (f) => f.name.toLowerCase().endsWith('.skel') || f.name.toLowerCase().endsWith('.json') || f.name.toLowerCase().endsWith('.atlas'),
    )

    // If ONLY images were dropped (no spine files), treat them as sprite imports.
    if (imageFiles.length > 0 && nonImageFiles.length === 0) {
      for (const imgFile of imageFiles) {
        const objectUrl = URL.createObjectURL(imgFile)
        try {
          const sprite = await stageRef.current?.addSprite(objectUrl)
          if (!sprite) { URL.revokeObjectURL(objectUrl); continue }
          const id = crypto.randomUUID()
          const row: SpriteRow = {
            id,
            kind: 'sprite',
            displayName: imgFile.name.replace(/\.[^.]+$/, ''),
            sourceFile: imgFile,
            objectUrl,
            sprite,
            locked: false,
            layerVisible: true,
            nineSlice: false,
            nineSliceInsets: { left: 10, top: 10, right: 10, bottom: 10 },
          }
          setSpriteRows((prev) => [...prev, row])
          setLayerOrder((prev) => [id, ...prev])
          setHistoryTick((t) => t + 1)
        } catch {
          URL.revokeObjectURL(objectUrl)
        }
      }
      return
    }

    // Mixed drop (spine files + possibly images): add images as sprites, pass all files to spine pipeline.
    if (imageFiles.length > 0 && hasSpineFiles) {
      for (const imgFile of imageFiles) {
        // Only create a sprite if this image file doesn't share a basename with an atlas file in the same drop
        // (i.e. it's not a texture page). We check by seeing if any .atlas file in the drop references this name.
        const isTexturePageCandidate = nonImageFiles.some(
          (f) => f.name.toLowerCase().endsWith('.atlas'),
        )
        if (isTexturePageCandidate) continue // Let the spine pipeline consume texture pages
        const objectUrl = URL.createObjectURL(imgFile)
        try {
          const sprite = await stageRef.current?.addSprite(objectUrl)
          if (!sprite) { URL.revokeObjectURL(objectUrl); continue }
          const id = crypto.randomUUID()
          const row: SpriteRow = {
            id,
            kind: 'sprite',
            displayName: imgFile.name.replace(/\.[^.]+$/, ''),
            sourceFile: imgFile,
            objectUrl,
            sprite,
            locked: false,
            layerVisible: true,
            nineSlice: false,
            nineSliceInsets: { left: 10, top: 10, right: 10, bottom: 10 },
          }
          setSpriteRows((prev) => [...prev, row])
          setLayerOrder((prev) => [id, ...prev])
          setHistoryTick((t) => t + 1)
        } catch {
          URL.revokeObjectURL(objectUrl)
        }
      }
    }

    // If only images and no spine files, we already returned above.
    if (nonImageFiles.length === 0) return

    importedFilesRef.current = mergeImportedFilePool(importedFilesRef.current, files)
    setBusy(true)
    setOutcome(null)
    setValidationReport(null)
    setValidating(true)
    let report: SpineValidationReport
    try {
      report = await validateSpineFiles(files)
      setValidationReport(report)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      report = {
        issues: [{ severity: 'error', message: `Validation step failed: ${msg}` }],
        groups: [],
        stats: {
          totalFiles: files.length,
          skeletonFiles: 0,
          atlasFiles: 0,
          rasterFiles: 0,
          pairedGroups: 0,
        },
      }
      setValidationReport(report)
    } finally {
      setValidating(false)
    }

    const { loadable, skippedDisplayNames } =
      report.groups.length > 0
        ? groupsLoadableFromReport(report)
        : { loadable: report.groups, skippedDisplayNames: [] as string[] }

    const loadOptions =
      report.groups.length > 0
        ? ({ groups: loadable, allowedPlaceholderBoneNames: commonPlaceholderNames } as const)
        : ({ allowedPlaceholderBoneNames: commonPlaceholderNames } as const)

    try {
      const res = await stageRef.current?.loadLocalFiles(files, loadOptions)
      const payload = res ?? {
        loaded: [],
        errors: ['Preview is not ready.'],
        notes: [],
        newInstances: [],
        loadValidationIssues: [],
      }
      const { newInstances, loadValidationIssues = [], ...feedback } = payload
      if (loadValidationIssues.length > 0) {
        setValidationReport((prev) =>
          prev ? mergeSpineValidationIssues(prev, loadValidationIssues) : prev,
        )
      }
      const skipNote =
        skippedDisplayNames.length > 0
          ? [
              `Did not load preview for: ${skippedDisplayNames.join(', ')} — fix errors listed above for those Spine objects.`,
            ]
          : []
      setOutcome({ ...feedback, notes: [...skipNote, ...feedback.notes] })
      if (newInstances.length > 0) {
        setAtlasSessionTag(null)
        const allowed = commonPlaceholderNames.map((t) => t.trim()).filter(Boolean)
        const knownAnims = commonAnimationNames.map((t) => t.trim()).filter(Boolean)
        const knownSet = new Set(knownAnims)
        const animIssues: ValidationIssue[] = []
        const promptEntries: UnknownAnimEntry[] = []
        const newRows = newInstances.map((inst) => {
          // Validation issues (Inspector banner + validation panel) — only when the list is active.
          const { issues, unknownNames } =
            knownAnims.length > 0
              ? validateLoadedSkeletonAnimations(inst.displayName, inst.spine, knownAnims)
              : { issues: [], unknownNames: [] }
          animIssues.push(...issues)

          // Prompt entries: always show animation names not already in the list,
          // even when the list is empty — so the user can build it from scratch.
          const allAnimNames = inst.spine.skeleton.data.animations.map((a) => a.name)
          const newToList = allAnimNames.filter((n) => !knownSet.has(n))
          if (newToList.length > 0) {
            promptEntries.push({ displayName: inst.displayName, names: newToList })
          }

          return {
            ...inst,
            locked: false,
            layerVisible: true,
            placeholderPolicyFrozen: inst.placeholderPolicyFrozen ?? false,
            placeholderPolicyIgnored: false,
            placeholders: resolveInspectorPlaceholders(inst.spine, commonPlaceholderNames),
            placeholderBindings: {},
            pinnedUnder: null,
            unknownAnimationNames: unknownNames,
            canonicalWorld: { x: inst.spine.x, y: inst.spine.y },
            canonicalScale: inst.spine.scale.x,
          }
        })
        if (animIssues.length > 0) {
          setValidationReport((prev) =>
            prev ? mergeSpineValidationIssues(prev, animIssues) : prev,
          )
        }
        setSpineRows((prev) => [...prev, ...newRows])
        setLayerOrder((prev) => [...newRows.map((r) => r.id), ...prev])
        if (promptEntries.length > 0) {
          setPendingUnknownAnims(promptEntries)
        }
        // Placeholder prompt: frozen + mismatched names when the bible is non-empty; when empty,
        // same pattern as animations — offer to seed Common placeholders from convention-detected bones.
        const phPromptEntries: UnknownAnimEntry[] = []
        if (allowed.length > 0) {
          for (const inst of newInstances) {
            if (!inst.placeholderPolicyFrozen || !(inst.unknownPlaceholderNames?.length ?? 0)) continue
            phPromptEntries.push({
              displayName: inst.displayName,
              names: inst.unknownPlaceholderNames!,
            })
          }
        } else {
          for (const inst of newInstances) {
            const names = [
              ...new Set(scanSkeletonPlaceholders(inst.spine).map((p) => p.boneName)),
            ].sort((a, b) => a.localeCompare(b))
            if (names.length > 0) {
              phPromptEntries.push({ displayName: inst.displayName, names })
            }
          }
        }
        if (phPromptEntries.length > 0) {
          setPendingUnknownPlaceholders(phPromptEntries)
        }
      }
    } finally {
      setBusy(false)
      setOpenTitlebarMenu(null)
    }
  }, [commonPlaceholderNames, commonAnimationNames])

  useEffect(() => {
    localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({
        sidebar: sidebarWidthPx,
        inspector: inspectorWidthPx,
        console: consoleHeightPx,
      }),
    )
  }, [sidebarWidthPx, inspectorWidthPx, consoleHeightPx])

  useEffect(() => {
    const onResize = () => {
      setConsoleHeightPx((h) =>
        clampLayout(h, LAYOUT_LIMITS.console.min, maxConsoleHeightPx()),
      )
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!openTitlebarMenu) return
    const onDocMouseDown = (e: MouseEvent) => {
      const el = titlebarMenusRef.current
      if (el && !el.contains(e.target as Node)) setOpenTitlebarMenu(null)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenTitlebarMenu(null)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [openTitlebarMenu])

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files
      if (!list?.length) return
      void runLoad([...list])
      e.target.value = ''
    },
    [runLoad],
  )

  // Stable ref so onDrop can call loadMancalaFile without a forward-reference error
  // (loadMancalaFile is defined later in this component but used in the drop handler)
  const loadMancalaFileRef = useRef<((file: File) => Promise<void>) | null>(null)

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const { files } = e.dataTransfer
      if (!files?.length) return
      const allFiles = [...files]
      // If a .mancala project file is dropped, open it and ignore other files in the drop
      const mancalaFile = allFiles.find(isMancalaFile)
      if (mancalaFile) {
        void loadMancalaFileRef.current?.(mancalaFile)
        return
      }
      void runLoad(dedupeFiles(allFiles))
    },
    [runLoad],
  )

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const openPicker = useCallback(() => inputRef.current?.click(), [])

  const persistCommonPlaceholderNames = useCallback((next: string[]) => {
    writeCommonPlaceholderNames(next)
    setCommonPlaceholderNames(readCommonPlaceholderNames())
  }, [])

  const persistCommonAnimationNames = useCallback((next: string[]) => {
    writeCommonAnimationNames(next)
    setCommonAnimationNames(readCommonAnimationNames())
  }, [])

  useEffect(() => {
    const allowed = commonPlaceholderNames.map((t) => t.trim()).filter(Boolean)
    const unfrozenNames: string[] = []
    setSpineRows((prev) => {
      let changed = false
      const next = prev.map((row) => {
        if (!row.placeholderPolicyFrozen) return row
        if (allowed.length === 0) {
          changed = true
          unfrozenNames.push(row.displayName)
          return {
            ...row,
            placeholderPolicyFrozen: false,
            placeholderPolicyIgnored: false,
            placeholders: resolveInspectorPlaceholders(row.spine, []),
          }
        }
        const issues = validateLoadedSkeletonPlaceholders(row.displayName, row.spine, allowed)
        if (issues.length === 0) {
          changed = true
          unfrozenNames.push(row.displayName)
          return {
            ...row,
            placeholderPolicyFrozen: false,
            placeholderPolicyIgnored: false,
            placeholders: resolveInspectorPlaceholders(row.spine, allowed),
          }
        }
        return row
      })
      return changed ? next : prev
    })
    if (unfrozenNames.length === 0) return
    setValidationReport((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        issues: prev.issues.filter(
          (i) =>
            !(
              i.issueKind === 'placeholder-policy' &&
              i.context &&
              unfrozenNames.includes(i.context)
            ),
        ),
      }
    })
  }, [commonPlaceholderNames])

  const onCommonPlaceholders = useCallback(() => {
    setOpenTitlebarMenu(null)
    setCommonPlaceholdersModalOpen(true)
  }, [])

  const onCommonAnimationNames = useCallback(() => {
    setOpenTitlebarMenu(null)
    setCommonAnimationNamesModalOpen(true)
  }, [])

  // Per-row unknown animation list whenever the common list or loaded spines change.
  useEffect(() => {
    const known = commonAnimationNames.map((t) => t.trim()).filter(Boolean)
    setSpineRows((prev) => {
      let changed = false
      const next = prev.map((row) => {
        if (known.length === 0) {
          if (row.unknownAnimationNames.length === 0) return row
          changed = true
          return { ...row, unknownAnimationNames: [] }
        }
        const { unknownNames } = validateLoadedSkeletonAnimations(
          row.displayName,
          row.spine,
          known,
        )
        const prevUnknown = row.unknownAnimationNames
        if (
          prevUnknown.length === unknownNames.length &&
          prevUnknown.every((n, i) => n === unknownNames[i])
        ) {
          return row
        }
        changed = true
        return { ...row, unknownAnimationNames: unknownNames }
      })
      return changed ? next : prev
    })
  }, [commonAnimationNames])

  // Merge placeholder-policy + animation-name-policy issues into Bundle validation whenever
  // spines or common lists change. Fixes project reopen where report existed but policy lines were missing,
  // and covers prev===null in older animation-only logic.
  useEffect(() => {
    if (spineRows.length === 0) {
      setValidationReport((prev) => {
        if (!prev) return prev
        const nextIssues = prev.issues.filter(
          (i) =>
            i.issueKind !== 'placeholder-policy' && i.issueKind !== 'animation-name-policy',
        )
        if (nextIssues.length === prev.issues.length) return prev
        return { ...prev, issues: nextIssues }
      })
      return
    }
    const allowed = commonPlaceholderNames.map((t) => t.trim()).filter(Boolean)
    const known = commonAnimationNames.map((t) => t.trim()).filter(Boolean)
    const policyIssues: ValidationIssue[] = []
    for (const row of spineRows) {
      policyIssues.push(...validateLoadedSkeletonPlaceholders(row.displayName, row.spine, allowed))
      if (known.length > 0) {
        policyIssues.push(...validateLoadedSkeletonAnimations(row.displayName, row.spine, known).issues)
      }
    }
    setValidationReport((prev) => {
      const base: SpineValidationReport =
        prev ?? {
          issues: [],
          groups: [],
          stats: {
            totalFiles: importedFilesRef.current.length,
            skeletonFiles: 0,
            atlasFiles: 0,
            rasterFiles: 0,
            pairedGroups: 0,
          },
        }
      const stripped = {
        ...base,
        issues: base.issues.filter(
          (i) =>
            i.issueKind !== 'placeholder-policy' && i.issueKind !== 'animation-name-policy',
        ),
      }
      return policyIssues.length > 0 ? mergeSpineValidationIssues(stripped, policyIssues) : stripped
    })
  }, [spineRows, commonPlaceholderNames, commonAnimationNames])

  const addToCommonAnimationNames = useCallback((names: string[]) => {
    persistCommonAnimationNames([
      ...new Set([...commonAnimationNames, ...names]),
    ])
  }, [commonAnimationNames, persistCommonAnimationNames])

  const onConfirmUnknownAnims = useCallback((toAdd: string[]) => {
    setPendingUnknownAnims(null)
    if (toAdd.length > 0) {
      persistCommonAnimationNames([...new Set([...commonAnimationNames, ...toAdd])])
    }
  }, [commonAnimationNames, persistCommonAnimationNames])

  const onDismissUnknownAnims = useCallback(() => {
    setPendingUnknownAnims(null)
  }, [])

  const onConfirmUnknownPlaceholders = useCallback((toAdd: string[]) => {
    setPendingUnknownPlaceholders(null)
    if (toAdd.length > 0) {
      persistCommonPlaceholderNames([...new Set([...commonPlaceholderNames, ...toAdd])])
    }
  }, [commonPlaceholderNames, persistCommonPlaceholderNames])

  const onDismissUnknownPlaceholders = useCallback(() => {
    setPendingUnknownPlaceholders(null)
  }, [])

  const ignoreSpinePlaceholderPolicy = useCallback((rowId: string) => {
    setSpineRows((prev) =>
      prev.map((r) =>
        r.id === rowId && r.placeholderPolicyFrozen
          ? { ...r, placeholderPolicyIgnored: true }
          : r,
      ),
    )
  }, [])

  const onAtlasPreviewTag = useCallback(
    async (tag: '1x' | '2x') => {
      const files = importedFilesRef.current
      if (files.length === 0 || busy) return
      setAtlasSessionTag(tag)

      const targets = spineRowsRef.current.filter(
        (r) =>
          r.skeletonSourceFile &&
          (r.atlasAvailableTags ?? []).includes(tag) &&
          (r.activeAtlasTag ?? '') !== tag,
      )
      if (targets.length === 0) return

      setBusy(true)
      try {
        const allowed = commonPlaceholderNames.map((t) => t.trim()).filter(Boolean)
        const byLower = filesByLowerName(files)

        type Patch = {
          rowId: string
          oldSpine: Spine
          newSpine: Spine
          oldSkinName: string | null
          displayName: string
          placeholderPolicyFrozen: boolean
          /** Carry the row's existing ignored flag so a texture-only swap doesn't un-ignore it. */
          placeholderPolicyIgnored: boolean
          /** Carry existing bindings — a texture swap doesn't change skeleton structure. */
          placeholderBindings: Record<string, string | string[]>
          placeholders: ReturnType<typeof resolveInspectorPlaceholders>
          phIssues: ValidationIssue[]
          animIssues: ValidationIssue[]
          unknownAnimationNames: string[]
        }
        const patches: Patch[] = []

        for (const row of targets) {
          const skel = row.skeletonSourceFile
          if (!skel) continue
          const atlas = findAtlasFileForStemTag(row.displayName, tag, byLower)
          if (!atlas) continue
          const res = await loadSpineFromFileGroup(
            { displayName: row.displayName, skeleton: skel, atlas },
            files,
          )
          if (!res.ok) {
            setOutcome((o) => ({
              loaded: o?.loaded ?? [],
              errors: [...(o?.errors ?? []), `${row.displayName}: ${res.message}`],
              notes: o?.notes ?? [],
            }))
            continue
          }

          const phIssues = validateLoadedSkeletonPlaceholders(row.displayName, res.spine, allowed)
          let placeholderPolicyFrozen = false
          if (phIssues.some((i) => i.severity === 'error')) {
            placeholderPolicyFrozen = true
            res.spine.autoUpdate = false
            res.spine.state.timeScale = 0
            res.spine.update(0)
          }

          const knownAnims = commonAnimationNames.map((t) => t.trim()).filter(Boolean)
          const { issues: animIssues, unknownNames } =
            knownAnims.length > 0
              ? validateLoadedSkeletonAnimations(row.displayName, res.spine, knownAnims)
              : { issues: [], unknownNames: [] }

          patches.push({
            rowId: row.id,
            oldSpine: row.spine,
            newSpine: res.spine,
            oldSkinName: row.spine.skeleton.skin?.name ?? null,
            displayName: row.displayName,
            placeholderPolicyFrozen,
            // Preserve the user's "Ignore" choice across atlas-tag swaps — swapping
            // @1x↔@2x only changes textures, not the skeleton/bone structure.
            placeholderPolicyIgnored: row.placeholderPolicyIgnored,
            // Keep existing placeholder bindings; the skeleton structure is unchanged.
            placeholderBindings: row.placeholderBindings,
            placeholders: resolveInspectorPlaceholders(res.spine, commonPlaceholderNames),
            phIssues,
            animIssues,
            unknownAnimationNames: unknownNames,
          })
        }

        if (patches.length === 0) return

        const contexts = new Set(patches.map((p) => p.displayName))
        const mergedPh = patches.flatMap((p) => p.phIssues)
        const mergedAnim = patches.flatMap((p) => p.animIssues)
        setValidationReport((prev) => {
          if (!prev) return prev
          const base: SpineValidationReport = {
            ...prev,
            issues: prev.issues.filter(
              (i) =>
                !(
                  (i.issueKind === 'placeholder-policy' || i.issueKind === 'animation-name-policy') &&
                  i.context &&
                  contexts.has(i.context)
                ),
            ),
          }
          const withPh = mergedPh.length > 0 ? mergeSpineValidationIssues(base, mergedPh) : base
          return mergedAnim.length > 0 ? mergeSpineValidationIssues(withPh, mergedAnim) : withPh
        })

        if (isolateMode) {
          stopIsolatePlayback()
        }

        for (const p of patches) {
          if (p.oldSkinName) {
            try {
              p.newSpine.skeleton.setSkinByName(p.oldSkinName)
              p.newSpine.skeleton.setSlotsToSetupPose()
              p.newSpine.update(0)
            } catch {
              // Missing skin on the swapped atlas variant: keep runtime default skin.
            }
          }
          stageRef.current?.swapSpineInstance(p.oldSpine, p.newSpine)
        }

        if (isolateMode) {
          const isolated = new Set(isolateSpineOrderRef.current)
          for (const p of patches) {
            if (!isolated.has(p.rowId)) continue
            resetSpineToSetupPoseAndClearTracks(p.newSpine)
            const q = isolateAnimQueuesRef.current[p.rowId] ?? []
            if (q.length > 0) {
              applySpineClipAtTimeZero(p.newSpine, q[0]!, isolateAnimSpeedRef.current[p.rowId] ?? 1)
            }
            p.newSpine.autoUpdate = false
          }
        }

        setSpineRows((prev) =>
          prev.map((r) => {
            const p = patches.find((x) => x.rowId === r.id)
            if (!p) return r
            return {
              ...r,
              spine: p.newSpine,
              activeAtlasTag: tag,
              placeholderPolicyFrozen: p.placeholderPolicyFrozen,
              // Keep ignored flag unless the policy now passes (frozen cleared).
              placeholderPolicyIgnored: p.placeholderPolicyFrozen ? p.placeholderPolicyIgnored : false,
              // Keep existing placeholder bindings — atlas swap doesn't change skeleton.
              placeholderBindings: p.placeholderBindings,
              placeholders: p.placeholders,
              unknownAnimationNames: p.unknownAnimationNames,
            }
          }),
        )
        setAtlasPreviewRevision((n) => n + 1)
      } finally {
        setBusy(false)
      }
    },
    [busy, commonAnimationNames, commonPlaceholderNames, isolateMode, stopIsolatePlayback],
  )

  const removeSpineFromProject = useCallback(
    (rowId: string) => {
      if (busy) return
      const rows = spineRowsRef.current
      const row = rows.find((r) => r.id === rowId)
      if (!row) return
      if (isolateSeqRef.current.some((e) => e.spine === row.spine)) {
        stopIsolatePlayback()
      }
      const nextRows = spineRowsAfterRemoval(rows, rowId)
      stageRef.current?.reconcilePlaceholderAttachments(
        nextRows.map((r) => ({
          id: r.id,
          spine: r.spine,
          placeholderBindings: (r.placeholderPolicyFrozen && !r.placeholderPolicyIgnored) ? {} : r.placeholderBindings,
        })),
        placeholderLayoutTarget,
      )
      stageRef.current?.removeSpine(row.spine)
      spineHandleById.current.delete(rowId)
      setSpineRows(nextRows)
      setLayerOrder((prev) => prev.filter((id) => id !== rowId))
      setSelectedSpineId((sel) => (sel === rowId ? null : sel))
      setCanvasDragSpineId((id) => (id === rowId ? null : id))
    },
    [busy, placeholderLayoutTarget, stopIsolatePlayback],
  )

  const removeSpriteFromProject = useCallback(
    (rowId: string) => {
      if (busy) return
      const row = spriteRowsRef.current.find((r) => r.id === rowId)
      if (!row) return
      stageRef.current?.removeSprite(row.sprite, row.objectUrl)
      setSpriteRows((prev) => prev.filter((r) => r.id !== rowId))
      setLayerOrder((prev) => prev.filter((id) => id !== rowId))
      setSelectedSpriteId((sel) => (sel === rowId ? null : sel))
      pushUndoSnapshot()
    },
    [busy, pushUndoSnapshot],
  )

  const closeRemoveSpineDialog = useCallback(() => {
    setRemoveSpineDialog(null)
  }, [])

  useEffect(() => {
    if (!removeSpineDialog) return
    removeSpineDialogNoRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRemoveSpineDialog()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [removeSpineDialog, closeRemoveSpineDialog])

  useEffect(() => {
    if (!clearSceneConfirmOpen) return
    clearSceneConfirmNoRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setClearSceneConfirmOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [clearSceneConfirmOpen])

  useEffect(() => {
    const hasObjects = spineRows.length > 0 || spriteRows.length > 0
    if (hasObjects) {
      setWelcomeScreenOpen(false)
      return
    }
    if (welcomeAfterClearRef.current) {
      setWelcomeScreenOpen(true)
      welcomeAfterClearRef.current = false
    }
  }, [spineRows.length, spriteRows.length])

  const dismissWelcomeScreen = useCallback(() => {
    setWelcomeScreenOpen(false)
  }, [])

  useEffect(() => {
    if (!welcomeScreenOpen) return
    welcomeScreenContinueRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissWelcomeScreen()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [welcomeScreenOpen, dismissWelcomeScreen])

  const clearScene = useCallback(() => {
    welcomeAfterClearRef.current = true
    scenarioAttachReconcileSigRef.current = null
    // Tear down playback and Spine listeners while instances are still alive — avoids retaining
    // AnimationState / RAF work after Pixi destroy (reduces ghost heap growth after Clear scene).
    stopIsolatePlayback()
    setScenePlaying(false)
    setScenarioTransportPlaying(false)
    setIsolatePlaying(false)
    for (const row of spineRowsRef.current) {
      if (row.placeholderPolicyFrozen && !row.placeholderPolicyIgnored) continue
      spineHandleById.current.get(row.id)?.pausePlayback()
    }
    setIsolateMode(false)
    setIsolateSpineOrder([])
    setIsolateAnimQueues({})
    setIsolateAnimLabels({})
    setIsolateAnimSpeed({})
    isolateSeqRef.current = []
    isolateAnimQueuesRef.current = {}
    isolateAnimSpeedRef.current = {}
    isolateSpineOrderRef.current = []
    isolateBackupRef.current = null
    pendingIsolateRestoreRef.current = null

    importedFilesRef.current = []
    const spritesToClear = [...spriteRowsRef.current]
    // Drop inspector / hierarchy rows from React *before* destroying Pixi spines, so effects
    // (e.g. SpineInstanceControls syncing scale) do not run against destroyed instances.
    flushSync(() => {
      setAtlasSessionTag(null)
      setOutcome(null)
      setValidationReport(null)
      setSpineRows([])
      setSpriteRows([])
      setLayerOrder([])
      setStageScale(1)
      setCanvasDragSpineId(null)
      setSelectedSpineId(null)
      setSelectedSpriteId(null)
      setPlaceholderLayoutTarget('main')
      setOpenTitlebarMenu(null)
      projectFileHandleRef.current = null
      undoStackRef.current = []
      redoStackRef.current = []
      dragHistoryBeforeRef.current = null
      worldPositionEditBeforeRef.current = null
      setHistoryTick((t) => t + 1)
    })
    stageRef.current?.clearSpines()
    for (const row of spritesToClear) {
      stageRef.current?.removeSprite(row.sprite, row.objectUrl)
      URL.revokeObjectURL(row.objectUrl)
    }
    stageRef.current?.resetStageView()
    spineHandleById.current.clear()
  }, [stopIsolatePlayback])

  const resetCanvasView = useCallback(() => {
    stageRef.current?.resetStageView()
    setStageScale(1)
  }, [])

  const [projectBusy, setProjectBusy] = useState(false)
  const [projectError, setProjectError] = useState<string | null>(null)
  // Stored file handle so "Save" can overwrite without a dialog
  const projectFileHandleRef = useRef<FileSystemFileHandle | null>(null)
  // The historyTick value at the point of the last save / open / clear.
  // isDirty is derived: scene is dirty when the tick has moved on and there's content.
  const [lastSavedTick, setLastSavedTick] = useState(0)
  const isDirty = (spineRows.length > 0 || spriteRows.length > 0) && historyTick !== lastSavedTick

  const buildSaveInput = useCallback(
    () => ({
      rows: spineRows,
      spriteRows,
      importedFiles: importedFilesRef.current,
      backdropMode,
      placeholderLayoutTarget,
      layerOrder,
      scenario: {
        scenarioMode,
        tracks: scenarioTracks,
        markers: scenarioMarkers,
        laneOrder: scenarioLaneOrder,
        loop: scenarioLoop,
        fps: scenarioFps,
        compositionTimeSec: scenarioCompTime,
      },
    }),
    [
      spineRows,
      spriteRows,
      layerOrder,
      backdropMode,
      placeholderLayoutTarget,
      scenarioMode,
      scenarioTracks,
      scenarioMarkers,
      scenarioLaneOrder,
      scenarioLoop,
      scenarioFps,
      scenarioCompTime,
    ],
  )

  const onSaveProject = useCallback(async () => {
    if (spineRows.length === 0 && spriteRows.length === 0) {
      setProjectError('Nothing to save — add some objects to the scene first.')
      return
    }
    setOpenTitlebarMenu(null)
    setProjectBusy(true)
    setProjectError(null)
    const input = buildSaveInput()
    // If we already have a handle, overwrite silently. Otherwise show Save-As dialog.
    const result = projectFileHandleRef.current
      ? await saveProjectToHandle(projectFileHandleRef.current, input)
      : await saveProjectSaveAs(input)
    if (result.ok && result.handle) projectFileHandleRef.current = result.handle
    setProjectBusy(false)
    if (result.ok) setLastSavedTick(historyTick)
    else setProjectError(result.error)
  }, [spineRows, buildSaveInput, historyTick])

  const onSaveProjectAs = useCallback(async () => {
    if (spineRows.length === 0 && spriteRows.length === 0) {
      setProjectError('Nothing to save — add some objects to the scene first.')
      return
    }
    setOpenTitlebarMenu(null)
    setProjectBusy(true)
    setProjectError(null)
    const result = await saveProjectSaveAs(buildSaveInput())
    if (result.ok && result.handle) projectFileHandleRef.current = result.handle
    setProjectBusy(false)
    if (result.ok) setLastSavedTick(historyTick)
    else setProjectError(result.error)
  }, [spineRows, buildSaveInput, historyTick])

  // ⌘S / Ctrl+S — Save   ⌘⇧S / Ctrl+Shift+S — Save As
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return
      if (e.key.toLowerCase() !== 's') return
      e.preventDefault()
      if (e.shiftKey) onSaveProjectAs()
      else onSaveProject()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSaveProject, onSaveProjectAs])

  /**
   * Single entry-point for loading a .mancala file regardless of how it arrived
   * (drag-drop, open dialog, or future recent-files list).
   * Optionally accepts a FileSystemFileHandle so "Save" can overwrite without a dialog.
   */
  const loadMancalaFile = useCallback(async (
    file: File,
    handle: FileSystemFileHandle | null = null,
  ) => {
    setProjectBusy(true)
    setProjectError(null)
    setOpenTitlebarMenu(null)

    const result = await readMancalaFile(file)
    if (!result.ok) {
      setProjectBusy(false)
      setProjectError(result.error)
      return
    }
    const { project, assetFiles } = result
    const openLayoutTarget: PlaceholderLayoutKey = (() => {
      const plt = project.viewport.placeholderLayoutTarget
      return plt === 'main' || plt === 'pt' || plt === 'ls' || plt === 'tb' ? plt : 'main'
    })()

    // Apply viewport settings
    setBackdropMode(project.viewport.backdropMode as Parameters<typeof setBackdropMode>[0])
    setPlaceholderLayoutTarget(openLayoutTarget)

    // clearScene() resets projectFileHandleRef to null, so restore the handle afterwards
    clearScene()
    projectFileHandleRef.current = handle
    await new Promise<void>((r) => setTimeout(r, 50))

    setPendingUnknownAnims(null)
    setPendingUnknownPlaceholders(null)

    importedFilesRef.current = assetFiles
    setBusy(true)

    // Same as drag-drop import: rebuild Bundle validation from ZIP assets, then merge runtime policy issues.
    setValidating(true)
    let baseReport: SpineValidationReport
    try {
      baseReport = await validateSpineFiles(assetFiles)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      baseReport = {
        issues: [{ severity: 'error', message: `Validation step failed: ${msg}` }],
        groups: [],
        stats: {
          totalFiles: assetFiles.length,
          skeletonFiles: 0,
          atlasFiles: 0,
          rasterFiles: 0,
          pairedGroups: 0,
        },
      }
    } finally {
      setValidating(false)
    }

    // Bundle file/atlas pairing — policy rows are merged in useEffect when spineRows update.
    setValidationReport(baseReport)

    const loadResult = await stageRef.current?.loadLocalFiles(assetFiles, {
      allowedPlaceholderBoneNames: commonPlaceholderNames,
    })
    if (!loadResult) {
      setBusy(false)
      setProjectBusy(false)
      setProjectError('Scene is not ready.')
      return
    }

    const { newInstances = [] } = loadResult
    const knownAnims = commonAnimationNames.map((t) => t.trim()).filter(Boolean)

    const knownAnimSet = new Set(knownAnims)
    const animPromptEntries: UnknownAnimEntry[] = []
    for (const inst of newInstances) {
      const allAnimNames = inst.spine.skeleton.data.animations.map((a) => a.name)
      const newToList = allAnimNames.filter((n) => !knownAnimSet.has(n))
      if (newToList.length > 0) {
        animPromptEntries.push({ displayName: inst.displayName, names: newToList })
      }
    }
    if (animPromptEntries.length > 0) {
      setPendingUnknownAnims(animPromptEntries)
    }

    const phPromptEntries: UnknownAnimEntry[] = []
    const allowedPh = commonPlaceholderNames.map((t) => t.trim()).filter(Boolean)
    if (allowedPh.length > 0) {
      for (const inst of newInstances) {
        if (!inst.placeholderPolicyFrozen || !(inst.unknownPlaceholderNames?.length)) continue
        const savedObj = project.objects.find((o) => o.displayName === inst.displayName)
        if (savedObj?.placeholderPolicyIgnored) continue
        phPromptEntries.push({
          displayName: inst.displayName,
          names: inst.unknownPlaceholderNames!,
        })
      }
    } else {
      for (const inst of newInstances) {
        const savedObj = project.objects.find((o) => o.displayName === inst.displayName)
        if (savedObj?.placeholderPolicyIgnored) continue
        const names = [
          ...new Set(scanSkeletonPlaceholders(inst.spine).map((p) => p.boneName)),
        ].sort((a, b) => a.localeCompare(b))
        if (names.length > 0) {
          phPromptEntries.push({ displayName: inst.displayName, names })
        }
      }
    }
    if (phPromptEntries.length > 0) {
      setPendingUnknownPlaceholders(phPromptEntries)
    }
    const newRows = newInstances.map((inst) => ({
      ...inst,
      locked: false,
      layerVisible: true,
      placeholderPolicyFrozen: inst.placeholderPolicyFrozen ?? false,
      placeholderPolicyIgnored: false,
      placeholders: resolveInspectorPlaceholders(inst.spine, commonPlaceholderNames),
      placeholderBindings: {},
      pinnedUnder: null,
      unknownAnimationNames: [] as string[],
      canonicalWorld: { x: inst.spine.x, y: inst.spine.y },
      canonicalScale: inst.spine.scale.x,
    }))
    setSpineRows(newRows)
    // Initialise layerOrder with spine rows — will be overwritten when sprites are restored below
    setLayerOrder(newRows.map((r) => r.id))

    const projectIdToRowId = applyProjectStateToRows(project, newRows)

    setSpineRows((prev) =>
      prev.map((row) => {
        const saved = project.objects.find((o) => o.displayName === row.displayName)
        if (!saved) return row
        const resolvedBindings = resolveProjectBindings(saved, projectIdToRowId)
        return {
          ...row,
          layerVisible: saved.layerVisible,
          locked: saved.locked,
          placeholderPolicyIgnored: saved.placeholderPolicyIgnored,
          placeholderBindings: resolvedBindings,
          pinnedUnder: saved.pinnedUnder
            ? {
                hostRowId: projectIdToRowId.get(saved.pinnedUnder.hostId) ?? '',
                boneName: saved.pinnedUnder.boneName,
              }
            : null,
          unknownAnimationNames:
            knownAnims.length > 0
              ? row.spine.skeleton.data.animations
                  .map((a) => a.name)
                  .filter((n) => !knownAnims.includes(n))
              : [],
          canonicalWorld: saved.pinnedUnder
            ? undefined
            : { x: saved.position.x, y: saved.position.y },
          layoutPt:
            saved.pinnedUnder || !saved.layoutPt?.position
              ? undefined
              : { x: saved.layoutPt.position.x, y: saved.layoutPt.position.y },
          layoutLs:
            saved.pinnedUnder || !saved.layoutLs?.position
              ? undefined
              : { x: saved.layoutLs.position.x, y: saved.layoutLs.position.y },
          layoutTb:
            saved.pinnedUnder || !saved.layoutTb?.position
              ? undefined
              : { x: saved.layoutTb.position.x, y: saved.layoutTb.position.y },
          canonicalScale: saved.pinnedUnder ? undefined : saved.scale,
          layoutPtScale: saved.pinnedUnder ? undefined : saved.layoutPtScale,
          layoutLsScale: saved.pinnedUnder ? undefined : saved.layoutLsScale,
          layoutTbScale: saved.pinnedUnder ? undefined : saved.layoutTbScale,
          pinnedBoneOffsetMain:
            saved.pinnedUnder && saved.boneOffset
              ? { x: saved.boneOffset.x, y: saved.boneOffset.y }
              : undefined,
          pinnedBoneLayoutPt:
            saved.pinnedUnder && saved.boneLayoutPt
              ? { x: saved.boneLayoutPt.x, y: saved.boneLayoutPt.y }
              : undefined,
          pinnedBoneLayoutLs:
            saved.pinnedUnder && saved.boneLayoutLs
              ? { x: saved.boneLayoutLs.x, y: saved.boneLayoutLs.y }
              : undefined,
          pinnedBoneLayoutTb:
            saved.pinnedUnder && saved.boneLayoutTb
              ? { x: saved.boneLayoutTb.x, y: saved.boneLayoutTb.y }
              : undefined,
          layoutPtLayerVisible: saved.layoutPtLayerVisible,
          layoutLsLayerVisible: saved.layoutLsLayerVisible,
          layoutTbLayerVisible: saved.layoutTbLayerVisible,
        }
      }),
    )

    // Restore sprites
    const restoredSpriteRows: SpriteRow[] = []
    const imageFileByName = new Map(assetFiles.map((f) => [f.name.toLowerCase(), f]))
    for (const saved of project.sprites ?? []) {
      const srcFile = imageFileByName.get(saved.imageFile.toLowerCase())
      if (!srcFile) continue
      const objectUrl = URL.createObjectURL(srcFile)
      try {
        const sprite = await stageRef.current?.addSprite(objectUrl)
        if (!sprite) { URL.revokeObjectURL(objectUrl); continue }
        sprite.position.set(saved.position.x, saved.position.y)
        sprite.scale.set(saved.scaleX, saved.scaleY)
        sprite.rotation = saved.rotation
        sprite.alpha = saved.alpha
        const visRow = {
          layerVisible: saved.layerVisible,
          layoutPtLayerVisible: saved.layoutPtLayerVisible,
          layoutLsLayerVisible: saved.layoutLsLayerVisible,
          layoutTbLayerVisible: saved.layoutTbLayerVisible,
        }
        sprite.visible = effectiveLayerVisible(visRow, openLayoutTarget)

        const insets = saved.nineSliceInsets ?? { left: 10, top: 10, right: 10, bottom: 10 }
        const row: SpriteRow = {
          id: saved.id,
          kind: 'sprite',
          displayName: saved.displayName,
          sourceFile: srcFile,
          objectUrl,
          sprite,
          locked: saved.locked,
          layerVisible: saved.layerVisible,
          layoutPtLayerVisible: saved.layoutPtLayerVisible,
          layoutLsLayerVisible: saved.layoutLsLayerVisible,
          layoutTbLayerVisible: saved.layoutTbLayerVisible,
          nineSlice: false,
          nineSliceInsets: insets,
        }

        if (saved.nineSlice) {
          stageRef.current?.enableNineSlice(row, insets)
          if (saved.nineSliceWidth != null && saved.nineSliceHeight != null) {
            row.sprite.width = saved.nineSliceWidth
            row.sprite.height = saved.nineSliceHeight
          }
          row.nineSlice = true
        }

        restoredSpriteRows.push(row)
      } catch {
        URL.revokeObjectURL(objectUrl)
      }
    }
    setSpriteRows(restoredSpriteRows)

    // Restore unified layer order — map saved IDs to current row IDs
    // Spine rows use their own IDs (set by applyProjectStateToRows via projectIdToRowId)
    // Sprite rows use saved IDs directly (we preserved them above)
    const savedLayerOrder: string[] = project.layerOrder ?? [
      ...project.objects.map((o) => o.id),
      ...(project.sprites ?? []).map((s) => s.id),
    ]
    const resolvedLayerOrder: string[] = savedLayerOrder.flatMap((savedId) => {
      // Try spine: projectIdToRowId maps saved id → live row id
      const liveSpineId = projectIdToRowId.get(savedId)
      if (liveSpineId) return [liveSpineId]
      // Try sprite: we kept the saved id
      if (restoredSpriteRows.some((r) => r.id === savedId)) return [savedId]
      return []
    })
    setLayerOrder(resolvedLayerOrder)

    // Restore composition scenario (spine ids in file → live row ids via projectIdToRowId)
    const spineIdsInOrder = newRows.map((r) => r.id)
    const remapped = remapScenarioStateFromProject(project.scenario, projectIdToRowId, spineIdsInOrder)
    const spineIds = new Set(spineIdsInOrder)
    let restoredTracks = remapped.tracks
    const restoredLaneOrder = remapped.laneOrder
    const byTrackId = new Map(restoredTracks.map((t) => [t.spineRowId, t]))
    for (const id of restoredLaneOrder) {
      if (byTrackId.has(id)) continue
      const row = newRows.find((r) => r.id === id)
      if (!row) continue
      const seeded = emptyScenarioTracksFromScene([id], [row])
      if (seeded[0]) {
        restoredTracks.push(seeded[0])
        byTrackId.set(id, seeded[0])
      }
    }
    restoredTracks = orderTracksLikeLayerOrder(restoredTracks, restoredLaneOrder, spineIds)

    setScenarioMarkers(remapped.markers)
    setScenarioLaneOrder(restoredLaneOrder)
    setScenarioTracks(restoredTracks)
    setScenarioLoop(remapped.loop ?? false)
    setScenarioFps(remapped.fps ?? 30)
    const restoredComp = remapped.compositionTimeSec ?? 0
    setScenarioCompTime(restoredComp)
    scenarioTimeRef.current = restoredComp
    setScenarioTransportPlaying(false)
    scenarioGapHiddenRef.current.clear()
    const restoredScenarioMode = remapped.scenarioMode ?? false
    setScenarioMode(restoredScenarioMode)
    setConsoleTab(restoredScenarioMode ? 'scenario' : 'validation')

    setBusy(false)
    setProjectBusy(false)
    // Sync the saved-tick so the opened file is not considered dirty
    setLastSavedTick(historyTick)
  }, [clearScene, commonPlaceholderNames, commonAnimationNames, historyTick])
  // Keep ref current so onDrop (defined earlier) can reach the latest version
  loadMancalaFileRef.current = loadMancalaFile

  const onOpenProject = useCallback(async () => {
    setOpenTitlebarMenu(null)
    setProjectError(null)
    try {
      const picked = await pickMancalaFile()
      if (!picked) return // user cancelled
      if ('ok' in picked && !picked.ok) { setProjectError(picked.error); return }
      const { file, handle } = picked as { file: File; handle: FileSystemFileHandle | null }
      await loadMancalaFile(file, handle)
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'Failed to open project.')
    }
  }, [loadMancalaFile])

  const bodyGridTemplate = useMemo(
    () =>
      isolateMode
        ? 'minmax(240px, 288px) minmax(200px, 1fr)'
        : `${sidebarWidthPx}px 6px minmax(200px, 1fr) 6px ${inspectorWidthPx}px`,
    [isolateMode, sidebarWidthPx, inspectorWidthPx],
  )

  const onColGutterPointerDown = useCallback(
    (which: 'sidebar' | 'inspector') => (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      if (which === 'sidebar') {
        layoutDragRef.current = { kind: 'sidebar', x0: e.clientX, w0: sidebarWidthPx }
      } else {
        layoutDragRef.current = { kind: 'inspector', x0: e.clientX, w0: inspectorWidthPx }
      }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [sidebarWidthPx, inspectorWidthPx],
  )

  const onColGutterPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = layoutDragRef.current
    if (!d || (d.kind !== 'sidebar' && d.kind !== 'inspector')) return
    e.preventDefault()
    if (d.kind === 'sidebar') {
      setSidebarWidthPx(
        clampLayout(d.w0 + e.clientX - d.x0, LAYOUT_LIMITS.sidebar.min, LAYOUT_LIMITS.sidebar.max),
      )
    } else {
      // Inspector grip is on its LEFT edge — dragging left widens it, so direction is inverted.
      setInspectorWidthPx(
        clampLayout(d.w0 - (e.clientX - d.x0), LAYOUT_LIMITS.inspector.min, LAYOUT_LIMITS.inspector.max),
      )
    }
  }, [])

  const onLayoutResizePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!layoutDragRef.current) return
    layoutDragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
  }, [])

  const onConsoleGutterPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      layoutDragRef.current = { kind: 'console', y0: e.clientY, h0: consoleHeightPx }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [consoleHeightPx],
  )

  const onConsoleGutterPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = layoutDragRef.current
    if (!d || d.kind !== 'console') return
    e.preventDefault()
    setConsoleHeightPx(
      clampLayout(d.h0 - (e.clientY - d.y0), LAYOUT_LIMITS.console.min, maxConsoleHeightPx()),
    )
  }, [])

  const hasSceneObjects = spineRows.length > 0 || spriteRows.length > 0
  const canUndo = hasSceneObjects && undoStackRef.current.length > 0
  const canRedo = hasSceneObjects && redoStackRef.current.length > 0

  return (
    <div className={`editor-root${isolateMode ? ' editor-root--isolate' : ''}`}>
      <input
        ref={inputRef}
        type="file"
        className="visually-hidden"
        multiple
        accept=".json,.skel,.atlas,.png,.webp,.jpg,.jpeg,.avif"
        onChange={onPick}
        aria-hidden
        tabIndex={-1}
      />

      <header
        className="editor-titlebar"
        aria-label={`MANCALA GAMING STUDIO EDITOR, version ${EDITOR_VERSION}`}
      >
        <div className="editor-titlebar-left">
          <img
            className="editor-app-logo"
            src={`${import.meta.env.BASE_URL}mancala-gaming-logo.png`}
            alt=""
            decoding="async"
          />
          <div className="editor-menubar-cluster" ref={titlebarMenusRef}>
            <div className="editor-menubar">
              <button
                type="button"
                className={`editor-menu-bar-item${openTitlebarMenu === 'project' ? ' is-open' : ''}`}
                aria-expanded={openTitlebarMenu === 'project'}
                aria-haspopup="true"
                onClick={() => setOpenTitlebarMenu((m) => (m === 'project' ? null : 'project'))}
                title={isDirty ? 'Unsaved changes — press ⌘S to save' : undefined}
              >
                Project{isDirty && <span className="editor-dirty-dot" aria-label="unsaved changes" />}
              </button>
              {openTitlebarMenu === 'project' && (
                <div className="editor-menu-dropdown" role="menu">
                  <p className="editor-menu-desc">
                    Import Spine exports into the scene. Pair each skeleton (<strong>.json</strong> or{' '}
                    <strong>.skel</strong>) with its <strong>.atlas</strong> (<strong>@1x</strong> /{' '}
                    <strong>@2x</strong>) and images in one selection or drop.
                  </p>
                  <div className="editor-menu-toolbar">
                    <button type="button" className="btn btn-primary" onClick={openPicker} disabled={busy}>
                      Import…
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => isDirty ? setClearSceneConfirmOpen(true) : clearScene()}
                      disabled={busy}
                    >
                      Clear scene
                    </button>
                  </div>
                  <div
                    className="editor-drop-target editor-drop-target--menu"
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    role="presentation"
                  >
                    {busy ? 'Importing…' : 'Drop files here to add to the scene'}
                  </div>
                  <p className="editor-menu-hint">
                    On the canvas, drag to reposition. If one skeleton covers another, choose it in the Inspector
                    (outside fields) or clear pick with a backdrop click.
                  </p>
                  <div className="editor-menu-divider" role="separator" />
                  {projectError && (
                    <p className="editor-menu-project-error" role="alert">{projectError}</p>
                  )}
                  <div className="editor-menu-toolbar">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={onSaveProject}
                      disabled={busy || projectBusy || (spineRows.length === 0 && spriteRows.length === 0)}
                      title={projectFileHandleRef.current ? 'Overwrite the current project file (no dialog)' : 'Save to a .mancala file — choose location'}
                    >
                      {projectBusy ? 'Saving…' : (projectFileHandleRef.current ? 'Save' : 'Save…')}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={onSaveProjectAs}
                      disabled={busy || projectBusy || (spineRows.length === 0 && spriteRows.length === 0)}
                      title="Save to a new .mancala file — always shows the Save dialog"
                    >
                      Save As…
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={onOpenProject}
                      disabled={busy || projectBusy}
                      title="Open a previously saved .mancala project file"
                    >
                      Open…
                    </button>
                  </div>
                  <p className="editor-menu-hint">
                    You can also drag a <strong>.mancala</strong> file onto the canvas to open it.
                  </p>
                </div>
              )}
            </div>
            <div className="editor-menubar">
              <button
                type="button"
                className={`editor-menu-bar-item${openTitlebarMenu === 'settings' ? ' is-open' : ''}`}
                aria-expanded={openTitlebarMenu === 'settings'}
                aria-haspopup="true"
                onClick={() => setOpenTitlebarMenu((m) => (m === 'settings' ? null : 'settings'))}
              >
                Settings
              </button>
              {openTitlebarMenu === 'settings' && (
                <div
                  className="editor-menu-dropdown editor-menu-dropdown--settings"
                  role="menu"
                  aria-label="Settings"
                >
                  <button
                    type="button"
                    className="editor-menu-action-btn"
                    role="menuitem"
                    onClick={onCommonPlaceholders}
                  >
                    Common placeholders
                  </button>
                  <button
                    type="button"
                    className="editor-menu-action-btn"
                    role="menuitem"
                    onClick={onCommonAnimationNames}
                  >
                    Common Animation States
                  </button>
                </div>
              )}
            </div>
            <div className="editor-menubar">
              <button
                type="button"
                className="editor-menu-bar-item"
                onClick={() => { setOpenTitlebarMenu(null); setHelpModalOpen(true) }}
                title="Open Help"
              >
                Help
              </button>
            </div>
          </div>
          <div className="editor-transport editor-history-near-project" role="group" aria-label="Undo and redo">
            <button
              type="button"
              className="transport-btn transport-undo"
              onClick={undo}
              disabled={!canUndo}
              title="Undo (⌘Z / Ctrl+Z)"
              aria-label="Undo"
            >
              <IconUndo />
            </button>
            <button
              type="button"
              className="transport-btn transport-redo"
              onClick={redo}
              disabled={!canRedo}
              title="Redo (⌘⇧Z / Ctrl+Shift+Z or Ctrl+Y)"
              aria-label="Redo"
            >
              <IconRedo />
            </button>
          </div>
        </div>
        <div className="editor-titlebar-center">
          {(spineRows.length > 0 || spriteRows.length > 0 || isolateMode || scenarioMode) && (
            <div
              className="editor-transport"
              role="group"
              aria-label={
                isolateMode
                  ? 'Isolate mode transport'
                  : scenarioMode
                    ? 'Scenario composition transport'
                    : 'Scene transport'
              }
            >
              <button
                type="button"
                className={`transport-btn transport-play${
                  (isolateMode
                    ? isolatePlaying
                    : scenarioMode
                      ? scenarioTransportPlaying
                      : scenePlaying)
                    ? ' is-toggled'
                    : ''
                }`}
                onClick={transportPlay}
                disabled={
                  (isolateMode && (isolatePlaying || isolateSpineOrder.length === 0)) ||
                  (scenarioMode && spineRows.length === 0)
                }
                title={
                  isolateMode
                    ? 'Play isolate animation queues (parallel)'
                    : scenarioMode
                      ? 'Play composition'
                      : 'Play all'
                }
                aria-label={
                  isolateMode ? 'Play isolate queues' : scenarioMode ? 'Play composition' : 'Play all'
                }
                aria-pressed={
                  isolateMode ? isolatePlaying : scenarioMode ? scenarioTransportPlaying : scenePlaying
                }
              >
                <span className="transport-icon" aria-hidden="true">
                  ▶
                </span>
              </button>
              <button
                type="button"
                className={`transport-btn transport-pause${
                  isolateMode && !isolatePlaying && isolateSpineOrder.length > 0 ? ' is-toggled' : ''
                }`}
                onClick={transportPause}
                disabled={isolateMode && !isolatePlaying}
                title={
                  isolateMode
                    ? 'Stop isolate playback (pause on current frame)'
                    : scenarioMode
                      ? 'Pause composition'
                      : 'Pause all'
                }
                aria-label={
                  isolateMode ? 'Stop isolate playback' : scenarioMode ? 'Pause composition' : 'Pause all'
                }
                aria-pressed={
                  isolateMode ? (!isolatePlaying && isolateSpineOrder.length > 0) : undefined
                }
              >
                <span className="transport-icon transport-pause-icon" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="transport-btn transport-restart"
                onClick={transportRestart}
                disabled={
                  (isolateMode && isolateSpineOrder.length === 0) ||
                  (scenarioMode && spineRows.length === 0)
                }
                title={
                  isolateMode
                    ? 'Reset isolate queues (first frame of first clip per skeleton)'
                    : scenarioMode
                      ? 'Restart composition (time 0)'
                      : 'Restart all'
                }
                aria-label={
                  isolateMode ? 'Reset isolate queues' : scenarioMode ? 'Restart composition' : 'Restart all'
                }
              >
                <span className="transport-icon" aria-hidden="true">
                  ↺
                </span>
              </button>
            </div>
          )}
        </div>
        <div className="editor-titlebar-hints">
          <h1 className="editor-app-name editor-app-name--titlebar-end">
            MANCALA GAMING STUDIO EDITOR{' '}
            <span className="editor-app-name-version">(ver. {EDITOR_VERSION})</span>
          </h1>
        </div>
      </header>

      <div className={`editor-workspace${isolateMode ? ' editor-workspace--isolate' : ''}`}>
      <div className="editor-body" style={{ gridTemplateColumns: bodyGridTemplate }}>
        {isolateMode ? (
          <aside className="isolate-sidebar" aria-label="Isolate mode">
            <IsolateModePanel
              spineRows={spineRows}
              isolateSpineOrder={isolateSpineOrder}
              onIsolateSpineOrderChange={setIsolateSpineOrder}
              isolateAnimQueues={isolateAnimQueues}
              onIsolateAnimQueuesChange={setIsolateAnimQueues}
              isolateAnimSpeed={isolateAnimSpeed}
              onIsolateAnimSpeedChange={(id, speed) => {
                setIsolateAnimSpeed((s) => ({ ...s, [id]: speed }))
              }}
              onIsolateSpineMetaRemove={(id) => {
                setIsolateAnimSpeed((s) => {
                  const { [id]: _, ...rest } = s
                  return rest
                })
              }}
            />
          </aside>
        ) : (
          <aside className="editor-sidebar" aria-label="Hierarchy">
          <div className="editor-sidebar-inner">
            {layerOrder.length > 0 ? (
              <div className="editor-panel-section editor-panel-section--hierarchy-grow">
                <div className="editor-panel-title">Hierarchy</div>
                <div className="editor-panel-content editor-panel-content--hierarchy">
                  <p className="editor-hierarchy-help">
                    Top = drawn in front. Drag a row onto another to reorder. Dot = visibility for the{' '}
                    <strong>current layout tab</strong> (Main always shows every object); padlock = lock position;
                    trash removes from scene.
                  </p>
                  <div className="editor-hierarchy-scroll">
                    <div className="editor-hierarchy" role="tree" aria-label="Objects in scene">
                      {layerOrder.map((id) => {
                        const spineRow = spineRows.find((r) => r.id === id)
                        const spriteRow = spriteRows.find((r) => r.id === id)
                        const row = spineRow ?? spriteRow
                        if (!row) return null
                        const isSelected = id === selectedSpineId || id === selectedSpriteId
                        const effLayerVis = effectiveLayerVisible(row, placeholderLayoutTarget)
                        const visToggleDisabled = placeholderLayoutTarget === 'main'
                        return (
                          <div
                            key={id}
                            role="treeitem"
                            aria-selected={isSelected}
                            aria-grabbed={hierarchyDragId === id}
                            className={`editor-hierarchy-row${isSelected ? ' is-selected' : ''}${id === hierarchyDragId ? ' is-hierarchy-dragging' : ''}${id === hierarchyDragOverId ? ' is-hierarchy-drop-target' : ''}`}
                            onDragOver={(e) => {
                              e.preventDefault()
                              e.dataTransfer.dropEffect = 'move'
                              setHierarchyDragOverId(id)
                            }}
                            onDrop={(e) => onHierarchyDropOnItem(e, id)}
                          >
                            <button
                              type="button"
                              className="editor-hierarchy-visibility"
                              disabled={visToggleDisabled}
                              title={
                                visToggleDisabled
                                  ? 'Main layout always shows all objects — switch to PT / LS / TB to hide per layout'
                                  : effLayerVis
                                    ? `Visible in ${placeholderLayoutTarget.toUpperCase()} preview (click to hide)`
                                    : `Hidden in ${placeholderLayoutTarget.toUpperCase()} preview (click to show)`
                              }
                              aria-label={
                                visToggleDisabled
                                  ? 'Visibility is always on for Main layout'
                                  : effLayerVis
                                    ? 'Hide in preview for this layout'
                                    : 'Show in preview for this layout'
                              }
                              aria-pressed={effLayerVis}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (!visToggleDisabled) toggleRowLayerVisible(id)
                              }}
                            >
                              <span className={`editor-hierarchy-dot${effLayerVis ? ' is-on' : ''}`} aria-hidden />
                            </button>
                            <button
                              type="button"
                              className={`editor-hierarchy-lockbtn${row.locked ? ' is-locked' : ''}`}
                              title={row.locked ? 'Locked — click to unlock moves' : 'Unlocked — click to lock position'}
                              aria-label={row.locked ? 'Unlock canvas moves for this object' : 'Lock canvas moves'}
                              aria-pressed={row.locked}
                              onClick={(e) => { e.stopPropagation(); toggleRowLocked(id) }}
                            >
                              {row.locked ? <IconPadlockClosed /> : <IconPadlockOpen />}
                            </button>
                            <button
                              type="button"
                              draggable
                              className="editor-hierarchy-main"
                              onClick={() => selectFromHierarchy(id)}
                              onDragStart={(e) => onHierarchyDragStart(e, id)}
                              onDragEnd={onHierarchyDragEnd}
                            >
                              <span className="editor-hierarchy-grip" aria-hidden="true" title="Drag to reorder">⋮⋮</span>
                              <span className="editor-hierarchy-chevron" aria-hidden="true">▾</span>
                              <span className="editor-hierarchy-label">
                                {spineRow ? (
                                  <span className="editor-hierarchy-badge editor-hierarchy-badge--spine">SKL</span>
                                ) : spriteRow ? (
                                  <span className="editor-hierarchy-badge editor-hierarchy-badge--sprite">IMG</span>
                                ) : null}
                                <span
                                  className={
                                    spineRow?.placeholderPolicyFrozen
                                      ? 'editor-hierarchy-name editor-hierarchy-name--frozen-placeholder'
                                      : 'editor-hierarchy-name'
                                  }
                                >
                                  {row.displayName}
                                </span>
                                {spineRow?.pinnedUnder ? (
                                  <span
                                    className="editor-hierarchy-pinned"
                                    title={`Nested under ${spineRows.find((h) => h.id === spineRow.pinnedUnder?.hostRowId)?.displayName ?? 'host'} · ${spineRow.pinnedUnder.boneName}`}
                                  >
                                    {' '}↳
                                  </span>
                                ) : null}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="editor-hierarchy-remove"
                              title="Remove from scene"
                              aria-label={`Remove ${row.displayName} from scene`}
                              disabled={busy}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (spineRow) setRemoveSpineDialog({ rowId: id, displayName: row.displayName })
                                else removeSpriteFromProject(id)
                              }}
                            >
                              <IconTrash />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="editor-panel-section">
                <div className="editor-panel-title">Hierarchy</div>
                <div className="editor-panel-content">
                  <p className="editor-sidebar-empty-hint">
                    No objects in the scene. Use <strong className="editor-kbd-label">Project</strong> in the
                    title bar to import Spine skeletons or drop image files onto the canvas.
                  </p>
                </div>
              </div>
            )}
          </div>
        </aside>
        )}

        {!isolateMode && (
        <div
          className="editor-resize-grip editor-resize-grip--col"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize hierarchy column"
          onPointerDown={onColGutterPointerDown('sidebar')}
          onPointerMove={onColGutterPointerMove}
          onPointerUp={onLayoutResizePointerUp}
          onPointerCancel={onLayoutResizePointerUp}
        />
        )}

        <main className={`editor-viewport-column${isolateMode ? ' editor-viewport-column--isolate' : ''}`} aria-label="Preview viewport">
          <div className="editor-viewport-chrome">
            <div className="editor-viewport-tabs" role="tablist" aria-label="Viewport mode">
              <span
                className={`editor-viewport-tab${!scenarioMode ? ' is-active' : ''}`}
                role="tab"
                aria-selected={!scenarioMode}
              >
                Game
              </span>
              {scenarioMode ? (
                <span className="editor-viewport-tab is-active" role="tab" aria-selected={true}>
                  Composition
                </span>
              ) : null}
            </div>
            <div className="editor-viewport-toolbar">
              <label className="editor-field-inline">
                <span className="editor-field-label">Backdrop</span>
                <select
                  className="editor-select"
                  value={backdropMode}
                  onChange={(e) => setBackdropMode(e.target.value as StageBackdropMode)}
                >
                  <option value="dark">Solid</option>
                  <option value="checker">Checker</option>
                </select>
              </label>
              <label className="editor-field-inline">
                <span
                  className="editor-field-label"
                  title="Main: open canvas, no device frame; nested symbols use unsuffixed / main placeholder bones. Portrait / Landscape / Tablet: 1440p / QHD–class world frames (1440×2560, 2560×1440, 2560×1920 tablet 4:3) + paired placeholder bones (e.g. name_ls vs name_pt). Watermark top-left."
                >
                  Layouts
                </span>
                <select
                  className="editor-select"
                  value={placeholderLayoutTarget}
                  disabled={scenarioMode || isolateMode}
                  title={
                    isolateMode
                      ? 'Layouts are disabled in Isolate mode. Exit Isolate to change layout.'
                      : scenarioMode
                        ? 'Layouts are fixed to Main while Scenario is on (independent composition view). Exit Scenario to change layout.'
                        : undefined
                  }
                  onChange={(e) =>
                    setPlaceholderLayoutTarget(e.target.value as PlaceholderLayoutKey)
                  }
                  aria-label="Layouts: paired placeholder bone for nested symbols"
                >
                  <option value="main">Main View</option>
                  <option value="pt">Portrait (pt / pr)</option>
                  <option value="ls">Landscape (ls)</option>
                  <option value="tb">Tablet (tb)</option>
                </select>
              </label>
              <button type="button" className="btn btn-compact" onClick={resetCanvasView}>
                Reset view
              </button>
              <button
                type="button"
                className="btn btn-compact"
                onClick={() => stageRef.current?.fitAllSpinesInView()}
                disabled={layerOrder.length === 0}
              >
                Fit all
              </button>
              <button
                type="button"
                className="btn btn-compact"
                onClick={enterIsolateMode}
                disabled={spineRows.length === 0 || isolateMode || scenarioMode}
                title="Preview skeletons (root or nested) with ordered animation queues"
              >
                Isolate mode
              </button>
              <button
                type="button"
                className={`btn btn-compact scenario-mode-btn${scenarioMode ? ' is-active' : ''}`}
                onClick={() => (scenarioMode ? disableScenarioMode() : enableScenarioMode())}
                disabled={spineRows.length === 0 || isolateMode}
                title="Scene-wide composition timeline (global clock, one row per Spine)"
              >
                Scenario Mode
              </button>
              <label className="editor-field-inline editor-checkbox">
                <input
                  type="checkbox"
                  checked={showWorldGrid}
                  disabled={isolateMode || scenarioMode}
                  onChange={(e) => setShowWorldGrid(e.target.checked)}
                />
                <span
                  className="editor-field-label"
                  title={
                    isolateMode || scenarioMode
                      ? 'World grid is off during Isolate or Scenario. Turn that mode off to use the grid on Main / Portrait / Landscape / Tablet.'
                      : 'World (0,0) at viewport center after Reset view. +X right, +Y down. Cyan = skeleton root bone (Spine placement origin).'
                  }
                >
                  World grid
                </span>
              </label>
              {/* Metrics — re-enable with `ViewportMetricsOverlay` import above
              <label className="editor-field-inline editor-checkbox">
                <input
                  type="checkbox"
                  checked={showMetricsOverlay}
                  onChange={(e) => setShowMetricsOverlay(e.target.checked)}
                />
                <span className="editor-field-label">Metrics</span>
              </label>
              */}
              {atlasStemPreviewVisible && (
                <div
                  className="editor-atlas-stem"
                  role="group"
                  aria-label="Atlas export preview (all compatible skeletons)"
                >
                  <span className="editor-field-label">Atlas</span>
                  <button
                    type="button"
                    className={`btn btn-compact${atlasSessionTag === '1x' ? ' is-active' : ''}`}
                    disabled={busy || !atlas1xAvailable}
                    aria-pressed={atlasSessionTag === '1x'}
                    onClick={() => void onAtlasPreviewTag('1x')}
                  >
                    @1x
                  </button>
                  <button
                    type="button"
                    className={`btn btn-compact${atlasSessionTag === '2x' ? ' is-active' : ''}`}
                    disabled={busy || !atlas2xAvailable}
                    aria-pressed={atlasSessionTag === '2x'}
                    onClick={() => void onAtlasPreviewTag('2x')}
                  >
                    @2x
                  </button>
                </div>
              )}
              <span className="editor-zoom-badge" aria-live="polite">
                {(stageScale * 100).toFixed(0)}%
              </span>
            </div>
          </div>
          <div
            className={`editor-viewport-surface${scenarioMode ? ' editor-viewport-surface--scenario-split' : ''}`}
          >
            {scenarioMode ? (
              <aside className="editor-scenario-game-panel" aria-label="Main game view">
                <div className="editor-scenario-game-panel-title">Game</div>
                <p className="editor-scenario-game-panel-copy">
                  The live renderer is in <strong>Composition</strong> while Scenario is on. Turn Scenario off to
                  use the full Game canvas here again.
                </p>
              </aside>
            ) : null}
            <div
              className={scenarioMode ? 'editor-scenario-composition-stack' : undefined}
              style={scenarioMode ? undefined : { display: 'contents' }}
            >
              {scenarioMode ? (
                <div className="editor-scenario-composition-heading" role="status">
                  <span className="editor-scenario-composition-title">Composition preview</span>
                  <span className="editor-scenario-composition-sub">
                    Same scene — dedicated panel for timeline-driven playback
                  </span>
                </div>
              ) : null}
              <div className="editor-viewport-stage-stack">
                <PixiStage
                  ref={stageRef}
                  scenarioCompositionTransportRef={scenarioCompositionTransportRef}
                  backdropMode={backdropMode}
                  showWorldGrid={showWorldGridOnStage}
                  onStageViewChange={(s) => {
                    if (typeof s !== 'number' || !Number.isFinite(s)) return
                    setStageScale((prev) => (Math.abs(prev - s) > 1e-6 ? s : prev))
                  }}
                  viewportLayoutTarget={placeholderLayoutTarget}
                  spineSceneRevision={spineRows.length}
                  atlasPreviewRevision={atlasPreviewRevision}
                  onClearDragPointerTarget={() => { setCanvasDragSpineId(null) }}
                  onSpineCanvasPointerDown={selectSpineFromCanvas}
                  getSpineDragEnabled={getSpineDragEnabled}
                  onSpineDragStart={onSpineDragStartForHistory}
                  onSpineDragEnd={onSpineDragEndForHistory}
                  onSpriteCanvasPointerDown={selectSpriteFromCanvas}
                  getSpriteDragEnabled={getSpriteDragEnabled}
                  onSpriteDragStart={onSpriteDragStartForHistory}
                  onSpriteDragEnd={onSpriteDragEndForHistory}
                />
                {welcomeScreenOpen ? (
                  <div
                    className="editor-viewport-renderer-message"
                    role="region"
                    aria-labelledby="editor-renderer-message-title"
                  >
                    <div className="editor-viewport-renderer-message-card">
                      <h2 id="editor-renderer-message-title" className="editor-viewport-renderer-message-title">
                        Message
                      </h2>
                      <p className="editor-viewport-renderer-message-body">
                        <span className="editor-viewport-renderer-message-scenario">Scenario mode</span> is still
                        under active development. While the composition
                        timeline is playing, you may notice <strong>higher CPU usage</strong> and{' '}
                        <strong>lower responsiveness</strong> than in the rest of the editor. If you do not need
                        the timeline, turn{' '}
                        <span className="editor-viewport-renderer-message-scenario">Scenario mode</span> off for the
                        best experience.
                      </p>
                      <div className="editor-viewport-renderer-message-actions">
                        <button
                          ref={welcomeScreenContinueRef}
                          type="button"
                          className="btn btn-primary"
                          onClick={dismissWelcomeScreen}
                        >
                          Continue
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
                {!welcomeScreenOpen ? (
                <div
                  className={
                    placeholderLayoutTarget === 'main'
                      ? 'editor-viewport-layout-watermark'
                      : `editor-viewport-layout-watermark editor-viewport-layout-watermark--${placeholderLayoutTarget}`
                  }
                  aria-hidden="true"
                >
                  {scenarioMode
                    ? placeholderLayoutTarget === 'main'
                      ? 'Composition preview'
                      : `${VIEWPORT_LAYOUT_WATERMARK[placeholderLayoutTarget]} · composition`
                    : VIEWPORT_LAYOUT_WATERMARK[placeholderLayoutTarget]}
                </div>
                ) : null}
                {/* Metrics overlay — re-enable with import + toolbar checkbox above
                {showMetricsOverlay ? (
                  <ViewportMetricsOverlay
                    stageRef={stageRef}
                    spineRows={spineRows}
                    selectedSpineId={selectedSpineId}
                  />
                ) : null}
                */}
                <IsolateAnimLabelsOverlay
                  active={isolateMode}
                  isolateSpineOrder={isolateSpineOrder}
                  spineRows={spineRows}
                  isolateAnimLabels={isolateAnimLabels}
                />
                {isolateMode ? (
                  <div className="isolate-exit-wrap">
                    <button type="button" className="btn isolate-exit-btn" onClick={exitIsolateMode}>
                      EXIT ISOLATE MODE
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </main>

        {!isolateMode && (
        <>
        <div
          className="editor-resize-grip editor-resize-grip--col"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize inspector column"
          onPointerDown={onColGutterPointerDown('inspector')}
          onPointerMove={onColGutterPointerMove}
          onPointerUp={onLayoutResizePointerUp}
          onPointerCancel={onLayoutResizePointerUp}
        />

        <aside className="editor-inspector" aria-label="Inspector">
          <div
            className={`editor-inspector-header editor-inspector-header--layout-${placeholderLayoutTarget}`}
          >
            <div className="editor-inspector-header-top">
              <span className="editor-inspector-title">Inspector</span>
              <span
                className={`editor-inspector-layout-badge editor-inspector-layout-badge--${placeholderLayoutTarget}`}
                title="Active layout target (same as Layouts in the viewport toolbar). Affects placeholder bones and per-layout pose / scale for root spines."
              >
                {INSPECTOR_LAYOUT_BADGE[placeholderLayoutTarget]}
              </span>
            </div>
            {(selectedRow ?? selectedSpriteRow) && (
              <span className="editor-inspector-subtitle" title={(selectedRow ?? selectedSpriteRow)!.displayName}>
                {(selectedRow ?? selectedSpriteRow)!.displayName}
              </span>
            )}
          </div>
          <div className="editor-inspector-body">
            {layerOrder.length === 0 ? (
              <p className="editor-inspector-empty">Import objects to edit their properties.</p>
            ) : (
              <>
                {spineRows.map((row) => (
                  <div
                    key={row.id}
                    className="editor-inspector-pane"
                    hidden={row.id !== selectedSpineId}
                  >
                    <SpineInstanceControls
                      row={row}
                      ref={(h) => registerSpineHandle(row.id, h)}
                      viewportStageRef={stageRef}
                      inspectorActive={row.id === selectedSpineId}
                      canvasDragPickActive={canvasDragSpineId === row.id}
                      onToggleCanvasDragPick={() => toggleCanvasDragPickForRow(row.id)}
                      allRows={spineRows}
                      onPlaceholderBind={onPlaceholderBind}
                      placeholderLayoutTarget={placeholderLayoutTarget}
                      onWorldPositionEditBegin={onWorldPositionEditBegin}
                      onWorldPositionEditEnd={onWorldPositionEditEnd}
                      onAfterRootWorldPositionChange={syncRootSpineLayoutStore}
                      onAfterPinnedBoneOffsetChange={syncPinnedBoneOffsetStore}
                      onRootDisplayScaleChange={onRootDisplayScaleChange}
                      onIgnorePlaceholderPolicy={() => ignoreSpinePlaceholderPolicy(row.id)}
                      onAddToCommonAnimations={addToCommonAnimationNames}
                      scenarioLocksInspectorTransport={scenarioMode}
                    />
                  </div>
                ))}
                {spriteRows.map((row) => (
                  <div
                    key={row.id}
                    className="editor-inspector-pane"
                    hidden={row.id !== selectedSpriteId}
                  >
                    <SpriteInstanceControls
                      row={row}
                      viewportStageRef={stageRef}
                      inspectorActive={row.id === selectedSpriteId}
                      canvasDragPickActive={row.id === selectedSpriteId}
                      onToggleCanvasDragPick={() => { setSelectedSpriteId(row.id) }}
                      onEditBegin={() => { setHistoryTick((t) => t + 1) }}
                      onEditEnd={() => { setHistoryTick((t) => t + 1) }}
                      onNineSliceToggle={handleNineSliceToggle}
                    />
                  </div>
                ))}
              </>
            )}
          </div>
        </aside>
        </>
        )}
      </div>

      {!isolateMode && (
      <>
      <div
        className="editor-resize-grip editor-resize-grip--row"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize validation panel height"
        onPointerDown={onConsoleGutterPointerDown}
        onPointerMove={onConsoleGutterPointerMove}
        onPointerUp={onLayoutResizePointerUp}
        onPointerCancel={onLayoutResizePointerUp}
      />

      <section
        className="editor-console"
        aria-label="Validation, scenario timeline, and import log"
        style={{ height: consoleHeightPx }}
      >
        <header className="editor-console-header">
          <div className="editor-console-tabs" role="tablist" aria-label="Bottom panel">
            <button
              type="button"
              className={`editor-console-tab${consoleTab === 'validation' ? ' is-active' : ''}`}
              role="tab"
              aria-selected={consoleTab === 'validation'}
              onClick={() => setConsoleTab('validation')}
            >
              Validation
            </button>
            <button
              type="button"
              className={`editor-console-tab${consoleTab === 'scenario' ? ' is-active' : ''}`}
              role="tab"
              aria-selected={consoleTab === 'scenario'}
              onClick={() => setConsoleTab('scenario')}
            >
              Scenario
            </button>
          </div>
        </header>
        <div className="editor-console-body">
          {consoleTab === 'validation' ? (
            <div className="editor-console-tab-pane editor-console-tab-pane--scroll">
              <ValidationPanel report={validationReport} validating={validating} />
              {outcome && (
                <div className="editor-load-log editor-load-log--console" role="status">
                  {outcome.loaded.length > 0 && (
                    <p className="feedback-ok">Loaded: {outcome.loaded.join(', ')}</p>
                  )}
                  {outcome.notes.map((n, i) => (
                    <p key={`n-${i}`} className="feedback-note">
                      {n}
                    </p>
                  ))}
                  {outcome.errors.map((err, i) => (
                    <p key={`e-${i}`} className="feedback-err">
                      {err}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="editor-console-tab-pane editor-console-tab-pane--scenario">
              {!scenarioMode && (
                <p className="feedback-note" role="status">
                  Turn on <strong>Scenario</strong> in the viewport toolbar to drive the scene with this timeline.
                </p>
              )}
              <ScenarioTimelinePanel
                tracks={scenarioTracks}
                onTracksChange={setScenarioTracks}
                spineRows={spineRows}
                scenarioLaneOrder={scenarioLaneOrder}
                moveScenarioLaneBeforeTarget={moveScenarioLaneBeforeTarget}
                compositionTime={scenarioCompTime}
                onCompositionTimeChange={setScenarioCompTime}
                onUserScrub={() => {
                  if (scenarioTransportPlayingRef.current) {
                    setScenarioCompTime(scenarioTimeRef.current)
                  }
                  setScenarioTransportPlaying(false)
                }}
                transportPlaying={scenarioTransportPlaying}
                onTransportPlayingChange={(playing) => {
                  if (!playing) setScenarioCompTime(scenarioTimeRef.current)
                  else syncScenarioSpineWorld(scenarioTimeRef.current)
                  setScenarioTransportPlaying(playing)
                }}
                loop={scenarioLoop}
                onLoopChange={setScenarioLoop}
                fps={scenarioFps}
                onFpsChange={setScenarioFps}
                scenarioActive={scenarioMode}
                markers={scenarioMarkers}
                onAddMarker={addScenarioMarker}
                onRemoveMarker={removeScenarioMarker}
                onMarkerSeek={seekScenarioMarker}
                onBeginMarkerDragUndo={beginScenarioMarkerDragUndo}
                onMarkerTimeChange={setScenarioMarkerTime}
              />
            </div>
          )}
        </div>
      </section>
      </>
      )}

      </div>

      <footer className="editor-statusbar">
        <span className="editor-statusbar-item">
          {layerOrder.length === 0
            ? 'No objects in scene'
            : [
                spineRows.length > 0 && `${spineRows.length} Spine`,
                spriteRows.length > 0 && `${spriteRows.length} sprite${spriteRows.length === 1 ? '' : 's'}`,
              ]
                .filter(Boolean)
                .join(' · ')}
        </span>
        <span className="editor-statusbar-sep" aria-hidden="true" />
        <span className="editor-statusbar-item editor-statusbar-dim">
          Drag splitters to resize (widths saved in this browser) · Drag hierarchy rows for draw order (top = front)
        </span>
        <span
          className="editor-statusbar-shortcuts editor-statusbar-dim"
          title="Canvas and edit shortcuts"
        >
          Wheel zoom · Middle-drag pan · Shift+drag backdrop pan · ⌘Z / Ctrl+Z undo · ⌘⇧Z / Ctrl+Y redo
        </span>
      </footer>

      <CommonPlaceholdersModal
        open={commonPlaceholdersModalOpen}
        onClose={() => setCommonPlaceholdersModalOpen(false)}
        names={commonPlaceholderNames}
        onNamesChange={persistCommonPlaceholderNames}
      />

      <CommonAnimationNamesModal
        open={commonAnimationNamesModalOpen}
        onClose={() => setCommonAnimationNamesModalOpen(false)}
        names={commonAnimationNames}
        onNamesChange={persistCommonAnimationNames}
      />

      <UnknownAnimationsPromptModal
        open={pendingUnknownAnims !== null && pendingUnknownAnims.length > 0}
        entries={pendingUnknownAnims ?? []}
        onConfirm={onConfirmUnknownAnims}
        onDismiss={onDismissUnknownAnims}
      />

      <UnknownAnimationsPromptModal
        open={pendingUnknownPlaceholders !== null && pendingUnknownPlaceholders.length > 0}
        entries={pendingUnknownPlaceholders ?? []}
        onConfirm={onConfirmUnknownPlaceholders}
        onDismiss={onDismissUnknownPlaceholders}
        title={
          commonPlaceholderNames.some((s) => s.trim())
            ? 'Unknown placeholder bones detected'
            : 'Placeholder bones detected'
        }
        description={
          commonPlaceholderNames.some((s) => s.trim()) ? (
            <>
              The following placeholder bones were found that are <strong>not</strong> in your{' '}
              <strong>Common Placeholders</strong> list. The affected{' '}
              {(pendingUnknownPlaceholders?.length ?? 0) === 1 ? 'object is' : 'objects are'} currently{' '}
              <strong>frozen</strong>. Add the correct names to unfreeze, or dismiss to keep them
              frozen and fix via <em>Settings → Common placeholders</em>.
            </>
          ) : (
            <>
              The following bones match the editor&apos;s placeholder naming convention while your{' '}
              <strong>Common Placeholders</strong> list is still empty. Add the ones you want as your
              standard, or dismiss and fill the list later under <em>Settings → Common placeholders</em>.
            </>
          )
        }
        listLabel="Common Placeholders"
      />

      <HelpModal
        open={helpModalOpen}
        onClose={() => setHelpModalOpen(false)}
      />

      {clearSceneConfirmOpen && (
        <div
          className="editor-modal-overlay"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setClearSceneConfirmOpen(false) }}
        >
          <div
            className="editor-modal editor-modal--confirm"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="editor-modal-head">
              <h2 className="editor-modal-title">Discard unsaved changes?</h2>
              <button
                type="button"
                className="editor-modal-close"
                onClick={() => setClearSceneConfirmOpen(false)}
                aria-label="Close"
              >×</button>
            </div>
            <div className="editor-modal-body">
              <p className="editor-modal-desc editor-modal-desc--confirm">
                The scene has unsaved changes. What would you like to do?
              </p>
            </div>
            <div className="editor-modal-foot editor-modal-foot--confirm">
              <button
                ref={clearSceneConfirmNoRef}
                type="button"
                className="btn btn-primary"
                onClick={async () => { setClearSceneConfirmOpen(false); await onSaveProject(); clearScene() }}
              >
                Save
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => { setClearSceneConfirmOpen(false); clearScene() }}
              >
                Discard &amp; Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {removeSpineDialog ? (
        <div
          className="editor-modal-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeRemoveSpineDialog()
          }}
        >
          <div
            className="editor-modal editor-modal--confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby={removeSpineDialogTitleId}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="editor-modal-head">
              <h2 id={removeSpineDialogTitleId} className="editor-modal-title">
                Remove from scene?
              </h2>
              <button
                type="button"
                className="editor-modal-close"
                onClick={closeRemoveSpineDialog}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="editor-modal-body">
              <p className="editor-modal-desc editor-modal-desc--confirm">
                Remove <strong>{removeSpineDialog.displayName}</strong> from the scene? This cannot be undone from the
                edit history.
              </p>
            </div>
            <div className="editor-modal-foot editor-modal-foot--confirm">
              <button
                ref={removeSpineDialogNoRef}
                type="button"
                className="btn"
                onClick={closeRemoveSpineDialog}
              >
                No
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => {
                  const id = removeSpineDialog.rowId
                  closeRemoveSpineDialog()
                  removeSpineFromProject(id)
                }}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
