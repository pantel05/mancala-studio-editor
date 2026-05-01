type GlLike = WebGLRenderingContext | WebGL2RenderingContext

function patchMethod(gl: GlLike, name: string, onCall: () => void): () => void {
  const rec = gl as unknown as Record<string, unknown>
  const orig = rec[name]
  if (typeof orig !== 'function') return () => {}
  const bound = (orig as (...args: never[]) => unknown).bind(gl)
  rec[name] = (...args: never[]) => {
    onCall()
    return bound(...args)
  }
  return () => {
    rec[name] = bound
  }
}

export type WebGlDrawCallMeter = {
  hook: { prerender(): void; postrender(): void }
  getLastFrameDrawCalls: () => number
  dispose: () => void
}

/** Counts GPU draw calls per frame (WebGL only). Install once; hook with renderer prerender/postrender. */
export function createWebGlDrawCallMeter(gl: GlLike): WebGlDrawCallMeter {
  let accum = 0
  let lastFrame = 0
  const disposers: (() => void)[] = []

  const bump = () => {
    accum++
  }

  disposers.push(patchMethod(gl, 'drawElements', bump))
  disposers.push(patchMethod(gl, 'drawArrays', bump))

  const g2 = gl as WebGL2RenderingContext
  if (typeof g2.drawElementsInstanced === 'function') {
    disposers.push(patchMethod(g2 as GlLike, 'drawElementsInstanced', bump))
  }
  if (typeof g2.drawArraysInstanced === 'function') {
    disposers.push(patchMethod(g2 as GlLike, 'drawArraysInstanced', bump))
  }

  const hook = {
    prerender() {
      accum = 0
    },
    postrender() {
      lastFrame = accum
    },
  }

  return {
    hook,
    getLastFrameDrawCalls: () => lastFrame,
    dispose() {
      for (const d of disposers) d()
    },
  }
}
