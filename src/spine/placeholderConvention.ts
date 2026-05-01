/**
 * Which skeleton bones count as “placeholders” for tooling (inspector list, attach symbols, naming checks).
 * Adjust these rules when your studio’s naming convention is finalized; grammar / typo checks can build on
 * {@link isPlaceholderBoneName} later.
 */

const PLACEHOLDER_SUBSTRINGS = ['placeholder', 'place_holder', 'pholder'] as const

/** Bone names matching this pattern are treated as placeholders (case-insensitive). */
const PLACEHOLDER_NAME_PREFIX = /^ph[_-]/i

export function isPlaceholderBoneName(boneName: string): boolean {
  const n = boneName.trim()
  if (n.length === 0) return false
  if (PLACEHOLDER_NAME_PREFIX.test(n)) return true
  const lower = n.toLowerCase()
  for (const s of PLACEHOLDER_SUBSTRINGS) {
    if (lower.includes(s)) return true
  }
  return false
}
