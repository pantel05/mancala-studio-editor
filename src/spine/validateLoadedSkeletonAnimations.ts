import type { Spine } from '@esotericsoftware/spine-pixi-v8'
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
  if (L <= 12) return 2
  return 3
}

function closestKnownName(anim: string, known: readonly string[]): string | null {
  let best: string | null = null
  let bestD = Infinity
  for (const k of known) {
    const d = levenshtein(anim, k)
    if (d < bestD) {
      bestD = d
      best = k
    }
  }
  if (best === null || bestD > maxTypoDistance(anim, best)) return null
  if (best === anim) return null
  return best
}

/**
 * When the known list is non-empty, any animation name on the skeleton that is NOT in the
 * list produces a **warning** (never an error — does not freeze/block the object).
 *
 * Returns the list of unknown animation names alongside the full ValidationIssue list.
 */
export function validateLoadedSkeletonAnimations(
  displayName: string,
  spine: Spine,
  knownAnimationNames: string[],
): { issues: ValidationIssue[]; unknownNames: string[] } {
  const known = [...new Set(knownAnimationNames.map((s) => s.trim()).filter(Boolean))]
  if (known.length === 0) return { issues: [], unknownNames: [] }

  const knownSet = new Set(known)
  const issues: ValidationIssue[] = []
  const unknownNames: string[] = []

  for (const anim of spine.skeleton.data.animations) {
    const name = anim.name
    if (knownSet.has(name)) continue

    unknownNames.push(name)
    const hint = closestKnownName(name, known)
    issues.push({
      issueKind: 'animation-name-policy',
      severity: 'warn',
      message: hint
        ? `Animation "${name}" is not in your Common Animation States. Did you mean "${hint}"? Fix the name in Spine or add "${name}" to the list if it is intentional.`
        : `Animation "${name}" is not in your Common Animation States. Fix the name in Spine or add it under Settings → Common Animation States.`,
      context: displayName,
    })
  }

  return { issues, unknownNames }
}
