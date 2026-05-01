import type { BoneData, SkeletonData } from '@esotericsoftware/spine-core'
import type { Spine } from '@esotericsoftware/spine-pixi-v8'
import { isPlaceholderBoneName } from './placeholderConvention'

export type SkeletonPlaceholderInfo = {
  boneName: string
  parentBoneName: string | null
  /** First slot in draw order that is bound to this bone, if any (used for addSlotObject when possible). */
  slotName: string | null
}

function findSlotNameForBoneData(data: SkeletonData, boneData: BoneData): string | null {
  for (const slot of data.slots) {
    if (slot.boneData === boneData) return slot.name
  }
  return null
}

/** Collect placeholder bones after skeleton data is available (e.g. right after load). */
export function scanSkeletonPlaceholders(spine: Spine): SkeletonPlaceholderInfo[] {
  const data = spine.skeleton.data
  const out: SkeletonPlaceholderInfo[] = []
  for (const bd of data.bones) {
    if (!isPlaceholderBoneName(bd.name)) continue
    out.push({
      boneName: bd.name,
      parentBoneName: bd.parent?.name ?? null,
      slotName: findSlotNameForBoneData(data, bd),
    })
  }
  return out
}
