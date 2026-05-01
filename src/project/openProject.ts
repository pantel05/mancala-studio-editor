import JSZip from 'jszip'
import { PROJECT_FORMAT_VERSION, type MancalaProject, type ProjectObject } from './projectTypes'

export type OpenProjectResult =
  | { ok: true; project: MancalaProject; assetFiles: File[] }
  | { ok: false; error: string }

export type PickedMancalaFile = {
  file: File
  /** Present in Chrome/Edge (File System Access API); null in Firefox/Safari fallback. */
  handle: FileSystemFileHandle | null
}

/**
 * Show a file picker and return the raw File + handle without parsing.
 * Returns null if the user cancels.
 *
 * NOTE: We intentionally do NOT pass a `types` filter to showOpenFilePicker.
 * macOS has no registered MIME type for .mancala, so any MIME-based filter
 * causes Chrome to grey out (disable) perfectly valid .mancala files.
 * We validate the extension ourselves after the user picks.
 */
export async function pickMancalaFile(): Promise<PickedMancalaFile | { ok: false; error: string } | null> {
  try {
    if ('showOpenFilePicker' in window) {
      const [handle] = await (window as Window & typeof globalThis).showOpenFilePicker({
        multiple: false,
        // No types filter — let the user see all files; we check the extension below
      })
      const file = await handle.getFile()
      if (!file.name.toLowerCase().endsWith('.mancala')) {
        return { ok: false, error: `Expected a .mancala file but got "${file.name}".` }
      }
      return { file, handle }
    }
    // Fallback: hidden file input (no handle)
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      // No accept filter for the same reason — avoids greying out files on some OSes
      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) { resolve(null); return }
        if (!file.name.toLowerCase().endsWith('.mancala')) {
          resolve({ ok: false, error: `Expected a .mancala file but got "${file.name}".` })
          return
        }
        resolve({ file, handle: null })
      }
      input.oncancel = () => resolve(null)
      input.click()
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return null
    throw err
  }
}

/** Read and parse a .mancala File object (works for both native-picker and drag-drop). */
export async function readMancalaFile(file: File): Promise<OpenProjectResult> {
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer())

    const projectEntry = zip.file('project.json')
    if (!projectEntry) {
      return { ok: false, error: 'Invalid .mancala file: missing project.json.' }
    }

    const projectJson = await projectEntry.async('text')
    const raw = JSON.parse(projectJson) as unknown

    if (!isValidProject(raw)) {
      return { ok: false, error: 'Invalid or unsupported project.json format.' }
    }

    const project = raw as MancalaProject

    if (project.version > PROJECT_FORMAT_VERSION) {
      return {
        ok: false,
        error: `This project was saved with a newer version of the editor (v${project.version}). Please update the app.`,
      }
    }

    // Extract all asset files from assets/
    const assetFiles: File[] = []
    const assetsFolder = zip.folder('assets')
    if (assetsFolder) {
      const entries = Object.entries(zip.files).filter(
        ([name]) => name.startsWith('assets/') && !name.endsWith('/'),
      )
      for (const [zipPath, zipEntry] of entries) {
        const fileName = zipPath.replace(/^assets\//, '')
        const buffer = await zipEntry.async('arraybuffer')
        const mimeType = guessMime(fileName)
        const f = new File([buffer], fileName, { type: mimeType })
        assetFiles.push(f)
      }
    }

    return { ok: true, project, assetFiles }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to read .mancala file.' }
  }
}

function isValidProject(raw: unknown): raw is MancalaProject {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  return (
    typeof o.version === 'number' &&
    o.app === 'MANCALA GAMING STUDIO EDITOR' &&
    Array.isArray(o.objects)
  )
}

function guessMime(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    atlas: 'text/plain',
    json: 'application/json',
    skel: 'application/octet-stream',
  }
  return map[ext] ?? 'application/octet-stream'
}

/**
 * Given loaded rows (after their spines have been created), apply the project's saved state:
 * positions, scales, animations, skins, visibility, etc.
 *
 * Returns a mapping from project object id → loaded row id (for re-linking placeholder bindings).
 */
export function applyProjectStateToRows(
  project: MancalaProject,
  rows: { id: string; displayName: string; spine: import('@esotericsoftware/spine-pixi-v8').Spine }[],
): Map<string, string> {
  // Match by displayName
  const projectIdToRowId = new Map<string, string>()

  for (const obj of project.objects) {
    const row = rows.find((r) => r.displayName === obj.displayName)
    if (!row) continue
    projectIdToRowId.set(obj.id, row.id)

    const spine = row.spine

    // Position
    spine.position.set(obj.position.x, obj.position.y)

    // Scale
    spine.scale.set(obj.scale)

    // Skin
    if (obj.skin) {
      try {
        spine.skeleton.setSkinByName(obj.skin)
        spine.skeleton.setToSetupPose()
      } catch {
        // skin no longer exists — ignore
      }
    }

    // Animation
    if (obj.animation) {
      const animExists = spine.skeleton.data.animations.some((a) => a.name === obj.animation)
      if (animExists) {
        spine.state.setAnimation(0, obj.animation, obj.loop)
        spine.state.timeScale = obj.speed
        if (!obj.playing) {
          spine.autoUpdate = false
          spine.update(0)
        }
      }
    }

    // Bone-local offset (for nested objects)
    if (obj.boneOffset) {
      spine.position.set(obj.boneOffset.x, obj.boneOffset.y)
    }
  }

  return projectIdToRowId
}

/**
 * Resolve saved placeholder bindings back to live row ids.
 * `projectIdToRowId` maps saved project object id → newly created row id.
 */
export function resolveProjectBindings(
  savedObj: ProjectObject,
  projectIdToRowId: Map<string, string>,
): Record<string, string> {
  const resolved: Record<string, string> = {}
  for (const [boneName, savedTargetId] of Object.entries(savedObj.placeholderBindings)) {
    const liveId = projectIdToRowId.get(savedTargetId)
    if (liveId) resolved[boneName] = liveId
  }
  return resolved
}
