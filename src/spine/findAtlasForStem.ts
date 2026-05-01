import { isAtlasFileName } from './fileKinds'

const TAG_PREFERENCE = ['2x', '3x', '1x', '4x', '0.5x'] as const

/** Lowercase filename → file (last wins on duplicate keys). */
export function filesByLowerName(files: File[]): Map<string, File> {
  const map = new Map<string, File>()
  for (const f of files) {
    map.set(f.name.toLowerCase(), f)
  }
  return map
}

/**
 * Tag string for an atlas paired with `stem`: `''` for `stem.atlas`, else the `@tag` part of `stem@tag.atlas`
 * (lowercase).
 */
export function atlasTagForStemAndFile(stem: string, atlasFile: File): string {
  const low = atlasFile.name.toLowerCase()
  const s = stem.toLowerCase()
  if (low === `${s}.atlas`) return ''
  const m = atlasFile.name.match(/^(.+?)@([^.]+)\.atlas$/i)
  if (!m) return ''
  if (m[1].toLowerCase() !== s) return ''
  return m[2].toLowerCase()
}

function sortAtlasTags(tags: string[]): string[] {
  const rank = (t: string) => {
    if (t === '') return 0
    if (t === '1x') return 1
    if (t === '2x') return 2
    return 10
  }
  return [...tags].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

/** Distinct atlas tags available for this stem in the file list (sorted). */
export function atlasTagsForStem(stem: string, byLower: Map<string, File>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const f of listAtlasesForStem(stem, byLower)) {
    const t = atlasTagForStemAndFile(stem, f)
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return sortAtlasTags(out)
}

/** Resolve the atlas file for `stem@tag.atlas` (or `stem.atlas` when `tag` is `''`). */
export function findAtlasFileForStemTag(
  stem: string,
  tag: string,
  byLower: Map<string, File>,
): File | undefined {
  const want = tag.toLowerCase()
  for (const f of listAtlasesForStem(stem, byLower)) {
    if (atlasTagForStemAndFile(stem, f) === want) return f
  }
  return undefined
}

/**
 * All atlas files in the map that belong to this skeleton stem (`stem.atlas` or `stem@tag.atlas`).
 */
export function listAtlasesForStem(
  stem: string,
  byLowerName: Map<string, File>,
): File[] {
  const stemLower = stem.toLowerCase()
  const out: File[] = []

  const exact = byLowerName.get(`${stemLower}.atlas`)
  if (exact && isAtlasFileName(exact.name)) out.push(exact)

  const escaped = stemLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^${escaped}@([^.]+)\\.atlas$`)

  const tagged: { tag: string; file: File }[] = []
  for (const [nameLower, file] of byLowerName) {
    const m = nameLower.match(re)
    if (m && isAtlasFileName(file.name)) {
      tagged.push({ tag: m[1].toLowerCase(), file })
    }
  }
  tagged.sort((a, b) => a.file.name.localeCompare(b.file.name))
  for (const t of tagged) {
    if (!out.some((f) => f === t.file)) out.push(t.file)
  }
  return out
}

/**
 * Spine often exports either `hero.atlas` or resolution-specific `hero@1x.atlas` / `hero@2x.atlas`.
 * When several tagged atlases exist, prefer @2x for preview (then @3x, @1x, …).
 */
export function findAtlasForStem(
  stem: string,
  byLowerName: Map<string, File>,
): File | undefined {
  const candidates = listAtlasesForStem(stem, byLowerName)
  if (candidates.length === 0) return undefined

  const stemLower = stem.toLowerCase()
  const exact = byLowerName.get(`${stemLower}.atlas`)
  if (exact && isAtlasFileName(exact.name) && candidates.includes(exact)) {
    return exact
  }

  const tagged: { tag: string; file: File }[] = []
  for (const file of candidates) {
    const n = file.name.toLowerCase()
    const m = n.match(/^(.+?)@([^.]+)\.atlas$/)
    if (m) tagged.push({ tag: m[2], file })
  }
  if (tagged.length === 0) return candidates[0]

  for (const tag of TAG_PREFERENCE) {
    const hit = tagged.find((t) => t.tag === tag)
    if (hit) return hit.file
  }

  tagged.sort((a, b) => a.file.name.localeCompare(b.file.name))
  return tagged[0].file
}
