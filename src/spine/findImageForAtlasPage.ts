/**
 * Atlas page `name` is usually `hero.png`; sometimes includes a subpath.
 */
export function findImageForAtlasPage(
  page: { name: string },
  imagesByLowerName: Map<string, File>,
): File | undefined {
  const raw = page.name.replace(/\\/g, '/').trim()
  const short = raw.split('/').pop() ?? raw
  const keys = [raw.toLowerCase(), short.toLowerCase()]
  for (const k of keys) {
    const hit = imagesByLowerName.get(k)
    if (hit) return hit
  }
  return undefined
}
