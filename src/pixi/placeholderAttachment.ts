import { Container } from 'pixi.js'
import type { Spine } from '@esotericsoftware/spine-pixi-v8'

export type PlaceholderAttachResult = {
  detach: () => void
}

/**
 * Parents `child` under `host` so it follows the given bone (slot attachment when a matching slot exists).
 * The child is wrapped in a {@link Container} so slot objects or manual bone matrices apply cleanly.
 */
export function attachSpineToHostPlaceholder(
  host: Spine,
  boneName: string,
  child: Spine,
  world: Container,
): PlaceholderAttachResult {
  const bone = host.skeleton.findBone(boneName)
  if (!bone) {
    if (child.parent && child.parent !== world) child.removeFromParent()
    if (!child.parent) world.addChild(child)
    return {
      detach: () => {},
    }
  }

  const slotName = (() => {
    const bd = host.skeleton.data.findBone(boneName)
    if (!bd) return null
    for (const slot of host.skeleton.slots) {
      if (slot.data.boneData === bd) return slot.data.name
    }
    return null
  })()

  // Detach child from any previous parent (the parent may be a destroyed wrapper after a swap).
  if (child.parent) {
    try { child.removeFromParent() } catch { /* parent may already be destroyed */ }
  }
  // Do NOT reset child.position here — the bone-local offset set by the user (via drag or
  // inspector scrub) must survive atlas-tag swaps and re-reconciliations.

  const wrapper = new Container()
  wrapper.addChild(child)

  let tickerUpdate: (() => void) | null = null

  if (slotName && host.skeleton.data.findSlot(slotName)) {
    host.addSlotObject(slotName, wrapper)
  } else {
    host.addChild(wrapper)
    const update = () => {
      const matrix = wrapper.localTransform
      matrix.a = bone.a
      matrix.b = bone.c
      matrix.c = -bone.b
      matrix.d = -bone.d
      matrix.tx = bone.worldX
      matrix.ty = bone.worldY
      wrapper.setFromMatrix(matrix)
    }
    tickerUpdate = update
    host.ticker.add(update)
    update()
  }

  const detach = () => {
    // host or wrapper may be destroyed if the host spine was swapped with children:false.
    if (tickerUpdate) {
      try { host.ticker.remove(tickerUpdate) } catch { /* host destroyed */ }
    }
    try { host.removeSlotObject(wrapper) } catch { /* not a slot object or host destroyed */ }
    try {
      if (wrapper.parent) wrapper.removeFromParent()
    } catch { /* wrapper parent may be destroyed */ }

    if (!wrapper.destroyed) {
      // The wrapper may contain a *different* spine than the originally-captured `child`
      // when swapSpineInstance replaced the child in-place during an atlas-tag swap.
      // Move every living child of the wrapper to world so the next reconcile can re-attach it.
      for (const wrapChild of [...wrapper.children]) {
        try { world.addChild(wrapChild) } catch { /* addChild re-parents automatically */ }
      }
      try { wrapper.destroy({ children: false }) } catch {}
    } else {
      // Wrapper was cascade-destroyed (shouldn't happen with children:false, but guard anyway).
      if (!child.destroyed) {
        try { child.removeFromParent() } catch {}
        world.addChild(child)
      }
    }
  }

  return { detach }
}
