/**
 * Spine rigs may expose multiple placeholder bones for the same logical slot
 * (e.g. portrait vs landscape). Bone names are grouped by a shared stem when the
 * last segment is a known layout suffix: _ls, _pt, _pr, _tb, portrait, landscape, main.
 */

export type PlaceholderLayoutKey = 'main' | 'pt' | 'ls' | 'tb'

const LAYOUT_SUFFIX_RE = /^(.*)[_-](ls|pt|pr|tb|portrait|landscape|main)$/i

/** Whether two bone names belong to the same layout-variant group (shared stem + suffix rule). */
export function placeholderBonesShareLayoutGroup(a: string, b: string): boolean {
  return placeholderLayoutStem(a) === placeholderLayoutStem(b)
}

/** Stem used to group layout variants; falls back to the full bone name when no suffix matches. */
export function placeholderLayoutStem(boneName: string): string {
  const m = boneName.match(LAYOUT_SUFFIX_RE)
  return m ? m[1] : boneName
}

function tokenToLayout(token: string): PlaceholderLayoutKey {
  const t = token.toLowerCase()
  if (t === 'ls' || t === 'landscape') return 'ls'
  if (t === 'pt' || t === 'pr' || t === 'portrait') return 'pt'
  if (t === 'tb') return 'tb'
  return 'main'
}

export function inferPlaceholderLayoutForBone(boneName: string): PlaceholderLayoutKey {
  const m = boneName.match(LAYOUT_SUFFIX_RE)
  if (!m) return 'main'
  return tokenToLayout(m[2])
}

function pickBoneInStemGroup(bones: string[], layout: PlaceholderLayoutKey): string {
  const byLayout = new Map<PlaceholderLayoutKey, string>()
  for (const b of bones) {
    byLayout.set(inferPlaceholderLayoutForBone(b), b)
  }
  const exact = byLayout.get(layout)
  if (exact) return exact
  const main = byLayout.get('main')
  if (main) return main
  return [...bones].sort()[0]!
}

function chooseStemGroup(
  stemToBones: Map<string, string[]>,
  layout: PlaceholderLayoutKey,
): string[] {
  if (stemToBones.size === 1) return [...stemToBones.values()][0]!

  for (const bones of stemToBones.values()) {
    if (bones.some((b) => inferPlaceholderLayoutForBone(b) === layout)) {
      return bones
    }
  }
  for (const bones of stemToBones.values()) {
    if (bones.some((b) => inferPlaceholderLayoutForBone(b) === 'main')) {
      return bones
    }
  }
  const stems = [...stemToBones.keys()].sort()
  return stemToBones.get(stems[0])!
}

/**
 * Given all bone names on one host that bind to the same child, pick the bone to
 * attach for the active layout preview (main / pt / ls / tb).
 */
export function pickPlaceholderBoneForLayout(
  boundBoneNames: string[],
  layout: PlaceholderLayoutKey,
): string | null {
  if (boundBoneNames.length === 0) return null
  if (boundBoneNames.length === 1) return boundBoneNames[0]!

  const stemToBones = new Map<string, string[]>()
  for (const b of boundBoneNames) {
    const stem = placeholderLayoutStem(b)
    if (!stemToBones.has(stem)) stemToBones.set(stem, [])
    stemToBones.get(stem)!.push(b)
  }
  for (const bones of stemToBones.values()) {
    bones.sort()
  }

  const group = chooseStemGroup(stemToBones, layout)
  return pickBoneInStemGroup(group, layout)
}
