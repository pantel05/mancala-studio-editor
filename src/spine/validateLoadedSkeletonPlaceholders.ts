import type { Spine } from '@esotericsoftware/spine-pixi-v8'
import { isPlaceholderBoneName } from './placeholderConvention'
import type { SkeletonPlaceholderInfo } from './scanSkeletonPlaceholders'
import { scanSkeletonPlaceholders } from './scanSkeletonPlaceholders'
import type { ValidationIssue } from './validateSpineSelection'

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const row = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) row[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = row[j]
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost)
      prev = tmp
    }
  }
  return row[n]!
}

function maxTypoDistance(a: string, b: string): number {
  const L = Math.max(a.length, b.length)
  if (L <= 6) return 1
  if (L <= 14) return 2
  return 3
}

function closestAllowedName(bone: string, allowed: readonly string[]): string | null {
  let best: string | null = null
  let bestD = Infinity
  for (const a of allowed) {
    const d = levenshtein(bone, a)
    if (d < bestD) {
      bestD = d
      best = a
    }
  }
  if (best === null || bestD > maxTypoDistance(bone, best)) return null
  if (best === bone) return null
  if (Math.min(bone.length, best.length) < 8) return null
  return best
}

/**
 * When the allowed list is non-empty, only those bone names may appear as placeholders.
 * Bones that match the loose “placeholder-like” heuristic but are not allowed → error.
 * Bones that are close (edit distance) to an allowed name but not exact → error (typos).
 */
export function validateLoadedSkeletonPlaceholders(
  displayName: string,
  spine: Spine,
  allowedBoneNames: string[],
): ValidationIssue[] {
  const allowed = [...new Set(allowedBoneNames.map((s) => s.trim()).filter(Boolean))]
  if (allowed.length === 0) return []

  const allowedSet = new Set(allowed)
  const issues: ValidationIssue[] = []
  const data = spine.skeleton.data

  for (const bd of data.bones) {
    const b = bd.name
    if (allowedSet.has(b)) continue

    if (isPlaceholderBoneName(b)) {
      const hint = closestAllowedName(b, allowed)
      issues.push({
        issueKind: 'placeholder-policy',
        severity: 'error',
        message: hint
          ? `Placeholder bone “${b}” is not in your Common placeholders list. Did you mean “${hint}”? Fix the name in Spine or add “${b}” under Settings → Common placeholders if it is intentional.`
          : `Placeholder bone “${b}” is not in your Common placeholders list. Fix the name in Spine or add it under Settings → Common placeholders.`,
        context: displayName,
      })
      continue
    }

    const typo = closestAllowedName(b, allowed)
    if (typo) {
      issues.push({
        issueKind: 'placeholder-policy',
        severity: 'error',
        message: `Bone “${b}” is not an allowed placeholder name but closely matches “${typo}” (likely a typo). Fix it in Spine or update Common placeholders.`,
        context: displayName,
      })
    }
  }

  return issues
}

/** Inspector: if the bible list is empty, show all convention-detected placeholders; otherwise only allowed names that exist on the skeleton. */
export function resolveInspectorPlaceholders(
  spine: Spine,
  allowedBoneNames: string[],
): SkeletonPlaceholderInfo[] {
  const scanned = scanSkeletonPlaceholders(spine)
  const allowed = new Set(allowedBoneNames.map((s) => s.trim()).filter(Boolean))
  if (allowed.size === 0) return scanned
  return scanned.filter((p) => allowed.has(p.boneName))
}
