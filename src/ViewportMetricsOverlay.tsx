import { useEffect, useState, type RefObject } from 'react'
import type { PixiStageHandle } from './PixiStage'
import type { SpineControlRow } from './SpineInstanceControls'

type Props = {
  stageRef: RefObject<PixiStageHandle | null>
  spineRows: SpineControlRow[]
  selectedSpineId: string | null
}

export function ViewportMetricsOverlay({ stageRef, spineRows, selectedSpineId }: Props) {
  const [text, setText] = useState('…')

  useEffect(() => {
    let id = 0
    const tick = () => {
      const snap = stageRef.current?.getPerformanceMetrics()
      if (!snap) {
        setText('Preview starting…')
      } else {
        const lines = [
          `FPS ${snap.fps.toFixed(0)}`,
          `Frame ${snap.frameMs.toFixed(1)} ms`,
          snap.drawCalls !== null ? `GPU draws ${snap.drawCalls}` : `GPU draws — (${snap.rendererName})`,
          `Renderer ${snap.rendererName} · res ${snap.resolution.toFixed(2)}`,
          `Canvas ${snap.canvasPixelW}×${snap.canvasPixelH}px`,
          `Spines ${snap.spineInstances} (${snap.visibleSpineInstances} visible)`,
          `Bones (sum) ${snap.bonesTotal} · Slots (sum) ${snap.slotsTotal}`,
          `Skins (sum) ${snap.skinsTotal} · Animations (sum) ${snap.animationsTotal}`,
        ]
        if (snap.jsHeapUsedMb !== null && snap.jsHeapTotalMb !== null) {
          lines.push(`JS heap ~${snap.jsHeapUsedMb} / ${snap.jsHeapTotalMb} MB`)
        }
        const row = selectedSpineId ? spineRows.find((r) => r.id === selectedSpineId) : undefined
        if (row) {
          const d = row.spine.skeleton.data
          lines.push(
            `Selected: ${row.displayName} — ${row.spine.skeleton.bones.length} bones, ${row.spine.skeleton.slots.length} slots, ${d.animations.length} anims`,
          )
        }
        setText(lines.join('\n'))
      }
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [stageRef, spineRows, selectedSpineId])

  return (
    <div className="editor-viewport-metrics" aria-label="Performance metrics overlay">
      <div className="editor-viewport-metrics-title">Metrics</div>
      <pre className="editor-viewport-metrics-body">{text}</pre>
    </div>
  )
}
