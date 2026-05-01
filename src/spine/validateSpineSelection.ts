import { TextureAtlas } from '@esotericsoftware/spine-core'
import { buildImageFileMap } from './buildImageFileMap'
import {
  fileStem,
  isAtlasFileName,
  isRasterImageFileName,
  isSkeletonFileName,
} from './fileKinds'
import { findAtlasForStem, listAtlasesForStem } from './findAtlasForStem'
import { findImageForAtlasPage } from './findImageForAtlasPage'
import { groupSpineFiles, type SpineFileGroup } from './groupSpineFiles'

export type ValidationSeverity = 'error' | 'warn' | 'info'

export type ValidationIssue = {
  severity: ValidationSeverity
  message: string
  /** Skeleton display name when the issue applies to one Spine object */
  context?: string
  /** When set, {@link groupsLoadableFromReport} ignores this issue for load blocking. */
  issueKind?: 'placeholder-policy' | 'animation-name-policy'
}

export type SpineValidationReport = {
  issues: ValidationIssue[]
  groups: SpineFileGroup[]
  stats: {
    totalFiles: number
    skeletonFiles: number
    atlasFiles: number
    rasterFiles: number
    pairedGroups: number
  }
}

/**
 * Pairs that have at least one {@link ValidationIssue} with `severity === "error"` and a matching `context`
 * (display name) are excluded so the preview never spends time on Spine objects that will fail anyway.
 */
export function groupsLoadableFromReport(report: SpineValidationReport): {
  loadable: SpineFileGroup[]
  skippedDisplayNames: string[]
} {
  const blocked = new Set<string>()
  for (const i of report.issues) {
    if (i.issueKind === 'placeholder-policy') continue
    if (i.severity === 'error' && i.context) blocked.add(i.context)
  }
  const loadable = report.groups.filter((g) => !blocked.has(g.displayName))
  const skippedDisplayNames = report.groups
    .filter((g) => blocked.has(g.displayName))
    .map((g) => g.displayName)
  return { loadable, skippedDisplayNames }
}

function byLowerName(files: File[]): Map<string, File> {
  const map = new Map<string, File>()
  for (const f of files) {
    map.set(f.name.toLowerCase(), f)
  }
  return map
}

function atlasPairedToChosenSkeleton(atlas: File, files: File[]): boolean {
  const map = byLowerName(files)
  for (const f of files) {
    if (!isSkeletonFileName(f.name)) continue
    const stem = fileStem(f.name)
    const hit = findAtlasForStem(stem, map)
    if (hit === atlas) return true
  }
  return false
}

function sortIssues(a: ValidationIssue, b: ValidationIssue): number {
  const rank = (s: ValidationSeverity) =>
    s === 'error' ? 0 : s === 'warn' ? 1 : 2
  const d = rank(a.severity) - rank(b.severity)
  if (d !== 0) return d
  return a.message.localeCompare(b.message)
}

function pageLookupKeys(pageName: string): string[] {
  const raw = pageName.replace(/\\/g, '/').trim()
  const short = raw.split('/').pop() ?? raw
  return [raw.toLowerCase(), short.toLowerCase()]
}

async function validateGroupAssets(
  group: SpineFileGroup,
  allFiles: File[],
): Promise<{ issues: ValidationIssue[]; referencedKeys: Set<string> }> {
  const issues: ValidationIssue[] = []
  const referencedKeys = new Set<string>()
  const ctx = group.displayName
  const imagesBy = buildImageFileMap(allFiles)

  try {
    const atlasText = await group.atlas.text()
    let textureAtlas: TextureAtlas
    try {
      textureAtlas = new TextureAtlas(atlasText)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      issues.push({
        severity: 'error',
        message: `Atlas “${group.atlas.name}” could not be parsed: ${msg}`,
        context: ctx,
      })
      return { issues, referencedKeys }
    }

    for (const page of textureAtlas.pages) {
      for (const k of pageLookupKeys(page.name)) referencedKeys.add(k)
      const img = findImageForAtlasPage(page, imagesBy)
      if (!img) {
        issues.push({
          severity: 'error',
          message: `Atlas page “${page.name}” has no matching image in the selection (use the same filename as in the atlas, e.g. PNG or WebP).`,
          context: ctx,
        })
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    issues.push({
      severity: 'error',
      message: `Could not read atlas “${group.atlas.name}”: ${msg}`,
      context: ctx,
    })
  }

  return { issues, referencedKeys }
}

async function validateSkeletonJsonShape(
  group: SpineFileGroup,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  const ctx = group.displayName
  if (!group.skeleton.name.toLowerCase().endsWith('.json')) return issues

  try {
    const raw = await group.skeleton.text()
    let data: unknown
    try {
      data = JSON.parse(raw) as unknown
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      issues.push({
        severity: 'error',
        message: `“${group.skeleton.name}” is not valid JSON: ${msg}`,
        context: ctx,
      })
      return issues
    }
    if (typeof data !== 'object' || data === null) {
      issues.push({
        severity: 'error',
        message: `“${group.skeleton.name}” is not a JSON object.`,
        context: ctx,
      })
      return issues
    }
    const o = data as Record<string, unknown>
    if (!Array.isArray(o.bones)) {
      issues.push({
        severity: 'error',
        message: `“${group.skeleton.name}” does not look like Spine skeleton JSON (expected a “bones” array).`,
        context: ctx,
      })
      return issues
    }
    if (o.bones.length === 0) {
      issues.push({
        severity: 'warn',
        message: `“${group.skeleton.name}” has an empty “bones” array.`,
        context: ctx,
      })
    }
    const sk = o.skeleton
    if (sk && typeof sk === 'object' && sk !== null) {
      const sv = (sk as Record<string, unknown>).spine
      if (typeof sv === 'string' && sv.length > 0) {
        issues.push({
          severity: 'info',
          message: `Spine editor export version: ${sv} (from ${group.skeleton.name}).`,
          context: ctx,
        })
      }
    }
    const skins = o.skins
    if (
      skins &&
      typeof skins === 'object' &&
      skins !== null &&
      !Array.isArray(skins) &&
      Object.keys(skins as object).length === 0
    ) {
      issues.push({
        severity: 'info',
        message: `“${group.skeleton.name}” has no skins defined.`,
        context: ctx,
      })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    issues.push({
      severity: 'error',
      message: `Could not read skeleton “${group.skeleton.name}”: ${msg}`,
      context: ctx,
    })
  }
  return issues
}

export async function validateSpineFiles(
  files: File[],
): Promise<SpineValidationReport> {
  const issues: ValidationIssue[] = []
  const { groups, notes } = groupSpineFiles(files)
  const map = byLowerName(files)

  let skeletonFiles = 0
  let atlasFiles = 0
  let rasterFiles = 0
  for (const f of files) {
    if (isSkeletonFileName(f.name)) skeletonFiles++
    else if (isAtlasFileName(f.name)) atlasFiles++
    else if (isRasterImageFileName(f.name)) rasterFiles++
  }

  for (const n of notes) {
    issues.push({ severity: 'error', message: n })
  }

  const stemToFiles = new Map<string, File[]>()
  for (const f of files) {
    if (!isSkeletonFileName(f.name)) continue
    const stem = fileStem(f.name).toLowerCase()
    const arr = stemToFiles.get(stem) ?? []
    arr.push(f)
    stemToFiles.set(stem, arr)
  }
  for (const [stem, arr] of stemToFiles) {
    if (arr.length > 1) {
      issues.push({
        severity: 'warn',
        message: `Several skeleton files share the stem “${stem}”: ${arr.map((x) => x.name).join(', ')}. Only one export per stem is paired for preview.`,
      })
    }
  }

  for (const f of files) {
    if (!isAtlasFileName(f.name)) continue
    if (!atlasPairedToChosenSkeleton(f, files)) {
      issues.push({
        severity: 'warn',
        message: `Atlas “${f.name}” is not used — no skeleton in this selection resolves to it (check names and @1x / @2x tags).`,
      })
    }
  }

  for (const g of groups) {
    const stem = fileStem(g.skeleton.name)
    const allForStem = listAtlasesForStem(stem, map)
    const chosen = g.atlas
    const others = allForStem.filter((a) => a !== chosen)
    if (others.length > 0) {
      issues.push({
        severity: 'info',
        message: `Preview uses “${chosen.name}”. Same stem also has: ${others.map((o) => o.name).join(', ')}.`,
        context: g.displayName,
      })
    }
  }

  let unknownCount = 0
  const unknownSamples: string[] = []
  for (const f of files) {
    if (
      isSkeletonFileName(f.name) ||
      isAtlasFileName(f.name) ||
      isRasterImageFileName(f.name)
    ) {
      continue
    }
    unknownCount++
    if (unknownSamples.length < 4) unknownSamples.push(f.name)
  }
  if (unknownCount > 0) {
    const tail = unknownCount > 4 ? ` (+${unknownCount - 4} more)` : ''
    issues.push({
      severity: 'info',
      message: `${unknownCount} file(s) skipped (not .json / .skel / .atlas / supported image): ${unknownSamples.join(', ')}${tail}`,
    })
  }

  for (const g of groups) {
    issues.push(...(await validateSkeletonJsonShape(g)))
  }

  const allReferenced = new Set<string>()
  for (const g of groups) {
    const { issues: gi, referencedKeys } = await validateGroupAssets(g, files)
    issues.push(...gi)
    for (const k of referencedKeys) allReferenced.add(k)
  }

  if (allReferenced.size > 0) {
    const unused: string[] = []
    for (const f of files) {
      if (!isRasterImageFileName(f.name)) continue
      const low = f.name.toLowerCase()
      if (!allReferenced.has(low)) unused.push(f.name)
    }
    if (unused.length > 0) {
      issues.push({
        severity: 'info',
        message: `Bitmap file(s) in the selection are not used by any paired atlas: ${unused.slice(0, 10).join(', ')}${unused.length > 10 ? ` (+${unused.length - 10} more)` : ''}`,
      })
    }
  }

  issues.sort(sortIssues)

  return {
    issues,
    groups,
    stats: {
      totalFiles: files.length,
      skeletonFiles,
      atlasFiles,
      rasterFiles,
      pairedGroups: groups.length,
    },
  }
}

/** Append issues (e.g. after load-time placeholder checks) and re-sort by severity. */
export function mergeSpineValidationIssues(
  report: SpineValidationReport,
  extra: ValidationIssue[],
): SpineValidationReport {
  const issues = [...report.issues, ...extra]
  issues.sort(sortIssues)
  return { ...report, issues }
}
