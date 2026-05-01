import { isRasterImageFileName } from './fileKinds'

/** Lowercase file name → File (last wins on duplicate names) */
export function buildImageFileMap(files: File[]): Map<string, File> {
  const map = new Map<string, File>()
  for (const f of files) {
    if (!isRasterImageFileName(f.name)) continue
    map.set(f.name.toLowerCase(), f)
  }
  return map
}
