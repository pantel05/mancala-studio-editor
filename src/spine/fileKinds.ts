const RASTER = /\.(png|webp|jpe?g|avif)$/i

export function isSkeletonFileName(name: string): boolean {
  const n = name.toLowerCase()
  return n.endsWith('.json') || n.endsWith('.skel')
}

export function isAtlasFileName(name: string): boolean {
  return name.toLowerCase().endsWith('.atlas')
}

export function isRasterImageFileName(name: string): boolean {
  return RASTER.test(name)
}

export function fileStem(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name
}
