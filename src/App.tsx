import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react'
import {
  PixiStage,
  type PixiStageHandle,
  type SafeFramePreset,
  type StageBackdropMode,
} from './PixiStage'
import {
  SpineInstanceControls,
  type SpineControlRow,
  type SpineInstanceHandle,
} from './SpineInstanceControls'
import { SpriteInstanceControls } from './SpriteInstanceControls'
import type { SpriteRow } from './SpriteRow'
import { isImageFile } from './pixi/spriteLayer'
import {
  groupsLoadableFromReport,
  mergeSpineValidationIssues,
  validateSpineFiles,
  type SpineValidationReport,
  type ValidationIssue,
} from './spine/validateSpineSelection'
import { readCommonPlaceholderNames, writeCommonPlaceholderNames } from './spine/commonPlaceholdersStorage'
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
import { pickMancalaFile, readMancalaFile, applyProjectStateToRows, resolveProjectBindings } from './project/openProject'
import { HelpModal } from './HelpModal'
import { ValidationPanel } from './ValidationPanel'
import type { Spine } from '@esotericsoftware/spine-pixi-v8'
import {
  applySceneSnapshot,
  captureSceneSnapshot,
  SCENE_HISTORY_MAX,
  snapshotsEqual,
  type SceneSnapshot,
} from './scene/sceneSnapshot'
import { spineRowsAfterRemoval } from './scene/spineRowsAfterRemoval'
import { ViewportMetricsOverlay } from './ViewportMetricsOverlay'
import { applyPlaceholderBinding } from './spine/applyPlaceholderBindingState'
import { filesByLowerName, findAtlasFileForStemTag } from './spine/findAtlasForStem'
import { loadSpineFromFileGroup } from './spine/loadSpineFromFileGroup'
import './App.css'

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
  const [removeSpineDialog, setRemoveSpineDialog] = useState<null | { rowId: string; displayName: string }>(
    null,
  )
  const removeSpineDialogTitleId = useId()
  const removeSpineDialogNoRef = useRef<HTMLButtonElement>(null)
  const [clearSceneConfirmOpen, setClearSceneConfirmOpen] = useState(false)
  const clearSceneConfirmNoRef = useRef<HTMLButtonElement>(null)
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
  /** Selected sprite ID — mutually exclusive with the spine selection. */
  const [selectedSpriteId, setSelectedSpriteId] = useState<string | null>(null)

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
    pushUndoSnapshotFrom(captureSceneSnapshot(spineRowsRef.current))
  }, [pushUndoSnapshotFrom])

  const undo = useCallback(() => {
    const u = undoStackRef.current
    if (u.length === 0 || spineRowsRef.current.length === 0) return
    const restore = u[u.length - 1]
    undoStackRef.current = u.slice(0, -1)
    redoStackRef.current = [
      ...redoStackRef.current.slice(-(SCENE_HISTORY_MAX - 1)),
      captureSceneSnapshot(spineRowsRef.current),
    ]
    setSpineRows(applySceneSnapshot(spineRowsRef.current, restore))
    setHistoryTick((t) => t + 1)
  }, [])

  const redo = useCallback(() => {
    const r = redoStackRef.current
    if (r.length === 0 || spineRowsRef.current.length === 0) return
    const restore = r[r.length - 1]
    redoStackRef.current = r.slice(0, -1)
    undoStackRef.current = [
      ...undoStackRef.current.slice(-(SCENE_HISTORY_MAX - 1)),
      captureSceneSnapshot(spineRowsRef.current),
    ]
    setSpineRows(applySceneSnapshot(spineRowsRef.current, restore))
    setHistoryTick((t) => t + 1)
  }, [])

  const onSpineDragStartForHistory = useCallback(() => {
    dragHistoryBeforeRef.current = captureSceneSnapshot(spineRowsRef.current)
  }, [])

  const onSpineDragEndForHistory = useCallback(() => {
    const before = dragHistoryBeforeRef.current
    dragHistoryBeforeRef.current = null
    if (!before) return
    const after = captureSceneSnapshot(spineRowsRef.current)
    if (!snapshotsEqual(before, after)) {
      pushUndoSnapshotFrom(before)
    }
  }, [pushUndoSnapshotFrom])

  const onWorldPositionEditBegin = useCallback(() => {
    worldPositionEditBeforeRef.current = captureSceneSnapshot(spineRowsRef.current)
  }, [])

  const onWorldPositionEditEnd = useCallback(
    (committed: boolean) => {
      const before = worldPositionEditBeforeRef.current
      worldPositionEditBeforeRef.current = null
      if (!committed || !before) return
      const after = captureSceneSnapshot(spineRowsRef.current)
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
  const [safeFramePreset, setSafeFramePreset] = useState<SafeFramePreset>('off')
  /** Canvas pick highlight (inspector); synced with hierarchy or direct canvas click on a skeleton. */
  const [canvasDragSpineId, setCanvasDragSpineId] = useState<string | null>(null)

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
    (sprite: import('pixi.js').Sprite) => {
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

  const getSpriteDragEnabled = useCallback(
    (sprite: import('pixi.js').Sprite) => {
      const row = spriteRowsRef.current.find((r) => r.sprite === sprite)
      return row ? !row.locked : true
    },
    [],
  )

  const dragSpriteBeforeRef = useRef<number>(0)

  const onSpriteDragStartForHistory = useCallback(() => {
    dragSpriteBeforeRef.current = historyTick
  }, [historyTick])

  const onSpriteDragEndForHistory = useCallback(() => {
    setHistoryTick((t) => t + 1)
  }, [])

  useEffect(() => {
    for (const row of spineRows) {
      row.spine.visible = row.layerVisible
      const effectivelyFrozen = row.placeholderPolicyFrozen && !row.placeholderPolicyIgnored
      row.spine.cursor = row.locked || effectivelyFrozen ? 'default' : 'grab'
    }
  }, [spineRows])

  useEffect(() => {
    for (const row of spriteRows) {
      row.sprite.visible = row.layerVisible
      row.sprite.cursor = row.locked ? 'default' : 'grab'
    }
  }, [spriteRows])

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
      pushUndoSnapshot()
      setSpineRows((rows) => rows.map((r) => (r.id === id ? { ...r, layerVisible: !r.layerVisible } : r)))
      setSpriteRows((rows) => rows.map((r) => (r.id === id ? { ...r, layerVisible: !r.layerVisible } : r)))
    },
    [pushUndoSnapshot],
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

  const atlas1xAvailable = useMemo(
    () => spineRows.some((r) => r.skeletonSourceFile && (r.atlasAvailableTags ?? []).includes('1x')),
    [spineRows],
  )
  const atlas2xAvailable = useMemo(
    () => spineRows.some((r) => r.skeletonSourceFile && (r.atlasAvailableTags ?? []).includes('2x')),
    [spineRows],
  )
  const atlasStemPreviewVisible = atlas1xAvailable || atlas2xAvailable

  const [hierarchyDragId, setHierarchyDragId] = useState<string | null>(null)
  const [hierarchyDragOverId, setHierarchyDragOverId] = useState<string | null>(null)

  // Sync z-order for all objects (spines + sprites) based on unified layerOrder.
  useEffect(() => {
    type LayerEntry = { kind: 'spine' | 'sprite'; obj: Spine | import('pixi.js').Sprite }
    const order: LayerEntry[] = []
    for (const id of layerOrder) {
      const spine = spineRows.find((r) => r.id === id)
      if (spine) { order.push({ kind: 'spine', obj: spine.spine }); continue }
      const sprite = spriteRows.find((r) => r.id === id)
      if (sprite) { order.push({ kind: 'sprite', obj: sprite.sprite }); continue }
    }
    if (order.length > 0) stageRef.current?.syncFullLayerOrder(order)
  }, [layerOrder, spineRows, spriteRows])

  useEffect(() => {
    stageRef.current?.reconcilePlaceholderAttachments(
      spineRows.map((r) => ({
        id: r.id,
        spine: r.spine,
        placeholderBindings: (r.placeholderPolicyFrozen && !r.placeholderPolicyIgnored) ? {} : r.placeholderBindings,
      })),
    )
  }, [spineRows])

  const onPlaceholderBind = useCallback(
    (hostRowId: string, boneName: string, childRowId: string | null) => {
      setSpineRows((prev) => applyPlaceholderBinding(prev, hostRowId, boneName, childRowId))
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

  // Re-validate animation names whenever the common list changes.
  useEffect(() => {
    const known = commonAnimationNames.map((t) => t.trim()).filter(Boolean)
    const updatedNames: string[] = []
    const newIssues: ValidationIssue[] = []
    setSpineRows((prev) =>
      prev.map((row) => {
        if (known.length === 0) {
          if (row.unknownAnimationNames.length === 0) return row
          return { ...row, unknownAnimationNames: [] }
        }
        const { issues, unknownNames } = validateLoadedSkeletonAnimations(
          row.displayName,
          row.spine,
          known,
        )
        newIssues.push(...issues)
        updatedNames.push(row.displayName)
        const prevUnknown = row.unknownAnimationNames
        if (
          prevUnknown.length === unknownNames.length &&
          prevUnknown.every((n, i) => n === unknownNames[i])
        ) {
          return row
        }
        return { ...row, unknownAnimationNames: unknownNames }
      }),
    )
    setValidationReport((prev) => {
      if (!prev) return prev
      const base: SpineValidationReport = {
        ...prev,
        issues: prev.issues.filter(
          (i) => !(i.issueKind === 'animation-name-policy'),
        ),
      }
      return newIssues.length > 0 ? mergeSpineValidationIssues(base, newIssues) : base
    })
  }, [commonAnimationNames])

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
          displayName: string
          placeholderPolicyFrozen: boolean
          /** Carry the row's existing ignored flag so a texture-only swap doesn't un-ignore it. */
          placeholderPolicyIgnored: boolean
          /** Carry existing bindings — a texture swap doesn't change skeleton structure. */
          placeholderBindings: Record<string, string>
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

          const phIssues =
            allowed.length > 0
              ? validateLoadedSkeletonPlaceholders(row.displayName, res.spine, allowed)
              : []
          let placeholderPolicyFrozen = false
          if (phIssues.length > 0) {
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

        for (const p of patches) {
          stageRef.current?.swapSpineInstance(p.oldSpine, p.newSpine)
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
    [busy, commonPlaceholderNames],
  )

  const removeSpineFromProject = useCallback(
    (rowId: string) => {
      if (busy) return
      const rows = spineRowsRef.current
      const row = rows.find((r) => r.id === rowId)
      if (!row) return
      const nextRows = spineRowsAfterRemoval(rows, rowId)
      stageRef.current?.reconcilePlaceholderAttachments(
        nextRows.map((r) => ({
          id: r.id,
          spine: r.spine,
          placeholderBindings: (r.placeholderPolicyFrozen && !r.placeholderPolicyIgnored) ? {} : r.placeholderBindings,
        })),
      )
      stageRef.current?.removeSpine(row.spine)
      spineHandleById.current.delete(rowId)
      setSpineRows(nextRows)
      setLayerOrder((prev) => prev.filter((id) => id !== rowId))
      setSelectedSpineId((sel) => (sel === rowId ? null : sel))
      setCanvasDragSpineId((id) => (id === rowId ? null : id))
    },
    [busy],
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

  const clearScene = useCallback(() => {
    importedFilesRef.current = []
    setAtlasSessionTag(null)
    stageRef.current?.clearSpines()
    // Destroy sprites — revoke objectUrls
    const spritesToClear = spriteRowsRef.current
    for (const row of spritesToClear) {
      stageRef.current?.removeSprite(row.sprite, row.objectUrl)
      URL.revokeObjectURL(row.objectUrl)
    }
    stageRef.current?.resetStageView()
    spineHandleById.current.clear()
    setOutcome(null)
    setValidationReport(null)
    setSpineRows([])
    setSpriteRows([])
    setLayerOrder([])
    setStageScale(1)
    setCanvasDragSpineId(null)
    setSelectedSpineId(null)
    setSelectedSpriteId(null)
    setOpenTitlebarMenu(null)
    projectFileHandleRef.current = null
    undoStackRef.current = []
    redoStackRef.current = []
    dragHistoryBeforeRef.current = null
    worldPositionEditBeforeRef.current = null
    setHistoryTick((t) => t + 1)
  }, [])

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

  const buildSaveInput = useCallback(() => ({
    rows: spineRows,
    spriteRows,
    importedFiles: importedFilesRef.current,
    backdropMode,
    safeFramePreset,
    layerOrder,
  }), [spineRows, spriteRows, layerOrder, backdropMode, safeFramePreset])

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

    // Apply viewport settings
    setBackdropMode(project.viewport.backdropMode as Parameters<typeof setBackdropMode>[0])
    setSafeFramePreset(project.viewport.safeFramePreset as Parameters<typeof setSafeFramePreset>[0])

    // clearScene() resets projectFileHandleRef to null, so restore the handle afterwards
    clearScene()
    projectFileHandleRef.current = handle
    await new Promise<void>((r) => setTimeout(r, 50))

    importedFilesRef.current = assetFiles
    setBusy(true)
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
        sprite.visible = saved.layerVisible
        // Use the saved id as the row id for layerOrder restoration
        restoredSpriteRows.push({
          id: saved.id,
          kind: 'sprite',
          displayName: saved.displayName,
          sourceFile: srcFile,
          objectUrl,
          sprite,
          locked: saved.locked,
          layerVisible: saved.layerVisible,
        })
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
    () => `${sidebarWidthPx}px 6px minmax(200px, 1fr) 6px ${inspectorWidthPx}px`,
    [sidebarWidthPx, inspectorWidthPx],
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
    <div className="editor-root">
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

      <header className="editor-titlebar" aria-label="MANCALA GAMING STUDIO EDITOR">
        <div className="editor-titlebar-left">
          <img
            className="editor-app-logo"
            src="/mancala-gaming-logo.png"
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
          {(spineRows.length > 0 || spriteRows.length > 0) && (
            <div className="editor-transport" role="group" aria-label="Scene transport">
              <button
                type="button"
                className="transport-btn transport-play"
                onClick={playAll}
                title="Play all"
                aria-label="Play all"
              >
                <span className="transport-icon" aria-hidden="true">
                  ▶
                </span>
              </button>
              <button
                type="button"
                className="transport-btn transport-pause"
                onClick={pauseAll}
                title="Pause all"
                aria-label="Pause all"
              >
                <span className="transport-icon transport-pause-icon" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="transport-btn transport-restart"
                onClick={restartAll}
                title="Restart all"
                aria-label="Restart all"
              >
                <span className="transport-icon" aria-hidden="true">
                  ↺
                </span>
              </button>
            </div>
          )}
        </div>
        <div className="editor-titlebar-hints">
          <h1 className="editor-app-name editor-app-name--titlebar-end">MANCALA GAMING STUDIO EDITOR</h1>
        </div>
      </header>

      <div className="editor-workspace">
      <div className="editor-body" style={{ gridTemplateColumns: bodyGridTemplate }}>
        <aside className="editor-sidebar" aria-label="Hierarchy">
          <div className="editor-sidebar-inner">
            {layerOrder.length > 0 ? (
              <div className="editor-panel-section editor-panel-section--hierarchy-grow">
                <div className="editor-panel-title">Hierarchy</div>
                <div className="editor-panel-content editor-panel-content--hierarchy">
                  <p className="editor-hierarchy-help">
                    Top = drawn in front. Drag a row onto another to reorder. Dot = scene visibility; padlock = lock
                    position; trash on the right removes from scene.
                  </p>
                  <div className="editor-hierarchy-scroll">
                    <div className="editor-hierarchy" role="tree" aria-label="Objects in scene">
                      {layerOrder.map((id) => {
                        const spineRow = spineRows.find((r) => r.id === id)
                        const spriteRow = spriteRows.find((r) => r.id === id)
                        const row = spineRow ?? spriteRow
                        if (!row) return null
                        const isSelected = id === selectedSpineId || id === selectedSpriteId
                        return (
                          <div
                            key={id}
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
                              title={row.layerVisible ? 'Visible in scene (click to hide)' : 'Hidden in scene (click to show)'}
                              aria-label={row.layerVisible ? 'Hide in preview scene' : 'Show in preview scene'}
                              aria-pressed={row.layerVisible}
                              onClick={(e) => { e.stopPropagation(); toggleRowLayerVisible(id) }}
                            >
                              <span className={`editor-hierarchy-dot${row.layerVisible ? ' is-on' : ''}`} aria-hidden />
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
                              role="treeitem"
                              aria-selected={isSelected}
                              aria-grabbed={hierarchyDragId === id}
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

        <main className="editor-viewport-column" aria-label="Preview viewport">
          <div className="editor-viewport-chrome">
            <div className="editor-viewport-tabs" role="tablist">
              <span className="editor-viewport-tab is-active" role="tab" aria-selected="true">
                Game
              </span>
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
                <span className="editor-field-label">Safe frame</span>
                <select
                  className="editor-select"
                  value={safeFramePreset}
                  onChange={(e) => setSafeFramePreset(e.target.value as SafeFramePreset)}
                  title="Reference device aspect + 5% inset (not tied to a specific phone)"
                >
                  <option value="off">Off</option>
                  <option value="phone-portrait">Phone portrait</option>
                  <option value="phone-landscape">Phone landscape</option>
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
              <label className="editor-field-inline editor-checkbox">
                <input
                  type="checkbox"
                  checked={showWorldGrid}
                  onChange={(e) => setShowWorldGrid(e.target.checked)}
                />
                <span
                  className="editor-field-label"
                  title="World (0,0) at viewport center after Reset view. +X right, +Y down. Cyan = skeleton root bone (Spine placement origin)."
                >
                  World grid
                </span>
              </label>
              <label className="editor-field-inline editor-checkbox">
                <input
                  type="checkbox"
                  checked={showMetricsOverlay}
                  onChange={(e) => setShowMetricsOverlay(e.target.checked)}
                />
                <span className="editor-field-label">Metrics</span>
              </label>
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
          <div className="editor-viewport-surface">
            <PixiStage
              ref={stageRef}
              backdropMode={backdropMode}
              showWorldGrid={showWorldGrid}
              onStageViewChange={setStageScale}
              safeFramePreset={safeFramePreset}
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
            {showMetricsOverlay ? (
              <ViewportMetricsOverlay
                stageRef={stageRef}
                spineRows={spineRows}
                selectedSpineId={selectedSpineId}
              />
            ) : null}
          </div>
        </main>

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
          <div className="editor-inspector-header">
            <span className="editor-inspector-title">Inspector</span>
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
                      onWorldPositionEditBegin={onWorldPositionEditBegin}
                      onWorldPositionEditEnd={onWorldPositionEditEnd}
                      onIgnorePlaceholderPolicy={() => ignoreSpinePlaceholderPolicy(row.id)}
                      onAddToCommonAnimations={addToCommonAnimationNames}
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
                    />
                  </div>
                ))}
              </>
            )}
          </div>
        </aside>
      </div>

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
        aria-label="Validation and import log"
        style={{ height: consoleHeightPx }}
      >
        <header className="editor-console-header">
          <span className="editor-console-title">Validation</span>
        </header>
        <div className="editor-console-body">
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
      </section>
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
