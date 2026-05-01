import { findAtlasForStem } from './findAtlasForStem'
import { fileStem, isAtlasFileName, isSkeletonFileName } from './fileKinds'

export type SpineFileGroup = {
  /** Base name (filename without extension), for UI */
  displayName: string
  skeleton: File
  atlas: File
}

export type GroupSpineFilesResult = {
  groups: SpineFileGroup[]
  /** Human-readable reasons files were not paired */
  notes: string[]
}

/**
 * Pair each `.json` / `.skel` with an atlas from the same file list:
 * `stem.atlas` or `stem@1x.atlas` / `stem@2x.atlas` (etc.).
 * Textures are matched at load time by atlas page names.
 */
export function groupSpineFiles(files: File[]): GroupSpineFilesResult {
  const notes: string[] = []
  const byLowerName = new Map<string, File>()
  for (const f of files) {
    byLowerName.set(f.name.toLowerCase(), f)
  }

  const usedSkeletons = new Set<File>()
  const usedAtlases = new Set<File>()
  const groups: SpineFileGroup[] = []

  for (const f of files) {
    if (!isSkeletonFileName(f.name)) continue
    if (usedSkeletons.has(f)) continue

    const stem = fileStem(f.name)
    const atlas = findAtlasForStem(stem, byLowerName)
    if (!atlas || !isAtlasFileName(atlas.name)) {
      notes.push(
        `“${f.name}” needs a matching atlas in the same selection: “${stem}.atlas” or tagged exports like “${stem}@1x.atlas” / “${stem}@2x.atlas”.`,
      )
      continue
    }
    if (usedAtlases.has(atlas)) {
      notes.push(`Atlas “${atlas.name}” is already used with another skeleton.`)
      continue
    }

    usedSkeletons.add(f)
    usedAtlases.add(atlas)
    groups.push({
      displayName: stem,
      skeleton: f,
      atlas,
    })
  }

  return { groups, notes }
}
