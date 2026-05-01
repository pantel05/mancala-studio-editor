import {
  AtlasAttachmentLoader,
  SkeletonBinary,
  SkeletonJson,
  TextureAtlas,
} from '@esotericsoftware/spine-core'
import { Spine, SpineTexture } from '@esotericsoftware/spine-pixi-v8'
import { Texture } from 'pixi.js'
import { buildImageFileMap } from './buildImageFileMap'
import { findImageForAtlasPage } from './findImageForAtlasPage'
import type { SpineFileGroup } from './groupSpineFiles'

export type LoadSpineOk = {
  ok: true
  displayName: string
  spine: Spine
}

export type LoadSpineErr = {
  ok: false
  displayName: string
  message: string
}

export type LoadSpineResult = LoadSpineOk | LoadSpineErr

/** Match browser MIME so decode matches Pixi’s texture loader (important for WebP alpha). */
function mimeForImageFile(file: File): string {
  if (file.type?.startsWith('image/')) return file.type
  const n = file.name.toLowerCase()
  if (n.endsWith('.webp')) return 'image/webp'
  if (n.endsWith('.png')) return 'image/png'
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg'
  if (n.endsWith('.avif')) return 'image/avif'
  return 'application/octet-stream'
}

/**
 * Decode and upload like Pixi’s atlas loader: PMA pages use createImageBitmap(..., { premultiplyAlpha: 'none' })
 * plus GPU `premultiplied-alpha`; straight pages use default decode + `premultiply-alpha-on-upload`.
 * Wrong combinations cause white fringes / solid rectangles around attachments.
 */
async function textureFromImageFile(file: File, premultipliedAlpha: boolean): Promise<Texture> {
  const blob = new Blob([await file.arrayBuffer()], { type: mimeForImageFile(file) })
  const bitmap = premultipliedAlpha
    ? await createImageBitmap(blob, { premultiplyAlpha: 'none' })
    : await createImageBitmap(blob)

  const alphaMode = premultipliedAlpha ? 'premultiplied-alpha' : 'premultiply-alpha-on-upload'

  return Texture.from({
    resource: bitmap,
    alphaMode,
  })
}

/**
 * Load one Spine object from local files (skeleton + atlas + raster pages).
 * Does not use `Assets` / blob URLs so loaders still see correct extensions for parsers.
 */
export async function loadSpineFromFileGroup(
  group: SpineFileGroup,
  allFiles: File[],
): Promise<LoadSpineResult> {
  const { displayName, skeleton, atlas } = group
  const imagesByName = buildImageFileMap(allFiles)

  try {
    const atlasText = await atlas.text()
    const textureAtlas = new TextureAtlas(atlasText)

    for (const page of textureAtlas.pages) {
      const img = findImageForAtlasPage(page, imagesByName)
      if (!img) {
        return {
          ok: false,
          displayName,
          message: `Atlas “${atlas.name}” needs image “${page.name}” (add it to the same folder selection or drop).`,
        }
      }
      const pixiTex = await textureFromImageFile(img, page.pma)
      page.setTexture(SpineTexture.from(pixiTex.source))
    }

    const attachmentLoader = new AtlasAttachmentLoader(textureAtlas)
    const lower = skeleton.name.toLowerCase()

    let skeletonData
    if (lower.endsWith('.json')) {
      const json = JSON.parse(await skeleton.text()) as unknown
      if (typeof json !== 'object' || json === null || !('bones' in json)) {
        return {
          ok: false,
          displayName,
          message: `“${skeleton.name}” is not a valid Spine JSON export (missing skeleton data).`,
        }
      }
      const parser = new SkeletonJson(attachmentLoader)
      skeletonData = parser.readSkeletonData(json)
    } else if (lower.endsWith('.skel')) {
      const bytes = new Uint8Array(await skeleton.arrayBuffer())
      const parser = new SkeletonBinary(attachmentLoader)
      skeletonData = parser.readSkeletonData(bytes)
    } else {
      return { ok: false, displayName, message: `Unsupported skeleton file: ${skeleton.name}` }
    }

    const spine = new Spine({
      skeletonData,
      autoUpdate: true,
    })

    return { ok: true, displayName, spine }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      displayName,
      message: `Could not load “${displayName}”: ${msg}`,
    }
  }
}
