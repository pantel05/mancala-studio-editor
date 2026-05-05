import { Container } from 'pixi.js'
import type { Spine } from '@esotericsoftware/spine-pixi-v8'

export type PlaceholderAttachResult = {
  detach: () => void
}

/**
 * Parents multiple `children` under `host` at one bone using a **single** slot object (or one ticker
 * root). Spine only keeps one object per `addSlotObject` slot; extra symbols must be inner wrappers
 * under that root so they do not replace each other.
 */
export function attachSpineStackToHostPlaceholder(
  host: Spine,
  boneName: string,
  children: Spine[],
  world: Container,
): PlaceholderAttachResult {
  const bone = host.skeleton.findBone(boneName)
  if (!bone) {
    for (const child of children) {
      if (child.parent && child.parent !== world) child.removeFromParent()
      if (!child.parent) world.addChild(child)
    }
    return { detach: () => {} }
  }

  const slotName = (() => {
    const bd = host.skeleton.data.findBone(boneName)
    if (!bd) return null
    for (const slot of host.skeleton.slots) {
      if (slot.data.boneData === bd) return slot.data.name
    }
    return null
  })()

  const stackRoot = new Container()

  for (const child of children) {
    if (child.parent) {
      try { child.removeFromParent() } catch { /* parent may already be destroyed */ }
    }
    const wrapper = new Container()
    wrapper.addChild(child)
    stackRoot.addChild(wrapper)
  }

  let tickerUpdate: (() => void) | null = null

  if (slotName && host.skeleton.data.findSlot(slotName)) {
    host.addSlotObject(slotName, stackRoot)
  } else {
    host.addChild(stackRoot)
    const update = () => {
      const matrix = stackRoot.localTransform
      matrix.a = bone.a
      matrix.b = bone.c
      matrix.c = -bone.b
      matrix.d = -bone.d
      matrix.tx = bone.worldX
      matrix.ty = bone.worldY
      stackRoot.setFromMatrix(matrix)
    }
    tickerUpdate = update
    host.ticker.add(update)
    update()
  }

  const detach = () => {
    if (tickerUpdate) {
      try { host.ticker.remove(tickerUpdate) } catch { /* host destroyed */ }
    }
    try { host.removeSlotObject(stackRoot) } catch { /* not a slot object or host destroyed */ }
    try {
      if (stackRoot.parent) stackRoot.removeFromParent()
    } catch { /* stackRoot parent may be destroyed */ }

    if (!stackRoot.destroyed) {
      for (const inner of [...stackRoot.children]) {
        for (const wrapChild of [...inner.children]) {
          try { world.addChild(wrapChild) } catch { /* addChild re-parents */ }
        }
        try { inner.destroy({ children: false }) } catch {}
      }
      try { stackRoot.destroy({ children: false }) } catch {}
    } else {
      for (const child of children) {
        if (!child.destroyed) {
          try { child.removeFromParent() } catch {}
          try { world.addChild(child) } catch {}
        }
      }
    }
  }

  return { detach }
}

/**
 * Parents `child` under `host` so it follows the given bone (slot attachment when a matching slot exists).
 * Prefer {@link attachSpineStackToHostPlaceholder} when several symbols share one placeholder bone.
 */
export function attachSpineToHostPlaceholder(
  host: Spine,
  boneName: string,
  child: Spine,
  world: Container,
): PlaceholderAttachResult {
  return attachSpineStackToHostPlaceholder(host, boneName, [child], world)
}
