import JSZip from 'jszip'
import type { SpineControlRow } from '../SpineInstanceControls'
import type { SpriteRow } from '../SpriteRow'
import type { StageBackdropMode } from '../PixiStage'
import type { SafeFramePreset } from '../pixi/safeFrameOverlay'
import {
  MANCALA_FILE_EXT,
  PROJECT_FORMAT_VERSION,
  type MancalaProject,
  type ProjectObject,
  type SpriteObject,
} from './projectTypes'

// Permissive MIME map so the OS file picker never greys out .mancala files
const MANCALA_ACCEPT = {
  'application/octet-stream': ['.mancala' as `.${string}`],
  'application/zip': ['.mancala' as `.${string}`],
  'application/x-zip-compressed': ['.mancala' as `.${string}`],
  'application/x-zip': ['.mancala' as `.${string}`],
}

export type SaveProjectInput = {
  rows: SpineControlRow[]
  spriteRows: SpriteRow[]
  /** All files currently loaded in the session (skeleton + atlas + textures). */
  importedFiles: File[]
  backdropMode: StageBackdropMode
  safeFramePreset: SafeFramePreset
  /** Unified draw order: IDs from both rows and spriteRows (front to back). */
  layerOrder?: string[]
}

export type SaveProjectResult =
  | { ok: true; handle?: FileSystemFileHandle }
  | { ok: false; error: string }

/**
 * Save using an existing file handle (no dialog — overwrites in place).
 * Falls back to a new Save-As dialog if the handle is no longer writable.
 */
export async function saveProjectToHandle(
  handle: FileSystemFileHandle,
  input: SaveProjectInput,
): Promise<SaveProjectResult> {
  try {
    const zip = await buildZip(input)
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return { ok: true, handle }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return { ok: true }
    // Handle gone (e.g. file deleted) — fall back to Save-As
    return saveProjectSaveAs(input)
  }
}

/**
 * Show a native Save-As dialog and write the file.
 * Returns the FileSystemFileHandle on success so callers can store it for future saves.
 */
export async function saveProjectSaveAs(input: SaveProjectInput): Promise<SaveProjectResult> {
  try {
    const zip = await buildZip(input)
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })

    if ('showSaveFilePicker' in window) {
      const handle = await (window as Window & typeof globalThis).showSaveFilePicker({
        suggestedName: 'scene.mancala',
        types: [
          {
            description: 'Mancala Gaming Studio Editor Project',
            accept: MANCALA_ACCEPT,
          },
        ],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return { ok: true, handle }
    } else {
      // Fallback — trigger download (Firefox / Safari)
      triggerDownload(blob, 'scene.mancala')
      return { ok: true }
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return { ok: true } // user cancelled
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

async function buildZip(input: SaveProjectInput): Promise<JSZip> {
  const { rows, spriteRows, importedFiles, backdropMode, safeFramePreset, layerOrder } = input
  const zip = new JSZip()
  const assetsFolder = zip.folder('assets')!

  // Index imported files by lower-case name for quick lookup
  const fileByName = new Map<string, File>()
  for (const f of importedFiles) {
    fileByName.set(f.name.toLowerCase(), f)
  }

  // Collect all files referenced by the loaded spine rows
  const referencedFileNames = new Set<string>()
  for (const row of rows) {
    if (row.skeletonSourceFile) {
      referencedFileNames.add(row.skeletonSourceFile.name)
    }
  }

  // Also collect atlas + texture files that share the same stem as a skeleton file
  const allFileNames = importedFiles.map((f) => f.name)
  for (const skelName of [...referencedFileNames]) {
    const stem = skelName.replace(/\.(skel|json)$/i, '')
    for (const fn of allFileNames) {
      const fnLower = fn.toLowerCase()
      const stemLower = stem.toLowerCase()
      if (fnLower.startsWith(stemLower) && fn !== skelName) {
        referencedFileNames.add(fn)
      }
    }
  }

  // Write referenced spine files into assets/
  for (const name of referencedFileNames) {
    const file = fileByName.get(name.toLowerCase())
    if (file) {
      assetsFolder.file(name, await file.arrayBuffer())
    }
  }

  // Write sprite image files into assets/
  for (const row of spriteRows) {
    const src = row.sourceFile
    if (src && !referencedFileNames.has(src.name)) {
      assetsFolder.file(src.name, await src.arrayBuffer())
    }
  }

  // Build project.json
  const objects: ProjectObject[] = rows.map((row) => {
    const spine = row.spine
    const track = spine.state.tracks[0] ?? null
    const animation = track?.animation?.name ?? null
    const loop = track?.loop ?? true
    const speed = spine.state.timeScale
    const playing = spine.autoUpdate
    const skin = spine.skeleton.skin?.name ?? null
    const boneOffset = row.pinnedUnder ? { x: spine.position.x, y: spine.position.y } : null

    return {
      id: row.id,
      displayName: row.displayName,
      skeletonFile: row.skeletonSourceFile?.name ?? '',
      activeAtlasTag: row.activeAtlasTag ?? '',
      position: { x: spine.x, y: spine.y },
      scale: spine.scale.x,
      layerVisible: row.layerVisible,
      locked: row.locked,
      animation,
      loop,
      speed,
      playing,
      skin,
      placeholderBindings: { ...row.placeholderBindings },
      boneOffset,
      pinnedUnder: row.pinnedUnder
        ? { hostId: row.pinnedUnder.hostRowId, boneName: row.pinnedUnder.boneName }
        : null,
      placeholderPolicyIgnored: row.placeholderPolicyIgnored,
    }
  })

  const sprites: SpriteObject[] = spriteRows.map((row) => ({
    id: row.id,
    displayName: row.displayName,
    imageFile: row.sourceFile.name,
    position: { x: row.sprite.position.x, y: row.sprite.position.y },
    scaleX: row.sprite.scale.x,
    scaleY: row.sprite.scale.y,
    rotation: row.sprite.rotation,
    alpha: row.sprite.alpha,
    layerVisible: row.layerVisible,
    locked: row.locked,
  }))

  // Compute layerOrder: use provided value, or fall back to objects order
  const resolvedLayerOrder = layerOrder ?? [...rows.map((r) => r.id), ...spriteRows.map((r) => r.id)]

  const project: MancalaProject = {
    version: PROJECT_FORMAT_VERSION,
    app: 'MANCALA GAMING STUDIO EDITOR',
    savedAt: new Date().toISOString(),
    viewport: { backdropMode, safeFramePreset },
    objects,
    sprites,
    layerOrder: resolvedLayerOrder,
  }

  zip.file('project.json', JSON.stringify(project, null, 2))
  return zip
}

/** Returns true if the filename looks like a .mancala project file. */
export function isMancalaFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(MANCALA_FILE_EXT)
}
