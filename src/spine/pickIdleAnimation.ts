/** Prefer an animation named `idle` (case-insensitive); otherwise the first export. */
export function pickIdleAnimationName(animationNames: string[]): string | undefined {
  if (animationNames.length === 0) return undefined
  const idle = animationNames.find((n) => n.toLowerCase() === 'idle')
  return idle ?? animationNames[0]
}
