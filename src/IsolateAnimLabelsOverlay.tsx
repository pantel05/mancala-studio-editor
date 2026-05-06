import type { SpineControlRow } from './SpineInstanceControls'

type Props = {
  active: boolean
  isolateSpineOrder: string[]
  spineRows: SpineControlRow[]
  isolateAnimLabels: Record<string, string>
}

/**
 * Fixed top-left readout inside the viewport: `{displayName} - {animation}` per isolated skeleton.
 */
export function IsolateAnimLabelsOverlay({
  active,
  isolateSpineOrder,
  spineRows,
  isolateAnimLabels,
}: Props) {
  if (!active || isolateSpineOrder.length === 0) return null

  return (
    <div className="isolate-caption-panel" aria-live="polite" aria-label="Isolate mode playback">
      {isolateSpineOrder.map((id) => {
        const row = spineRows.find((r) => r.id === id)
        if (!row) return null
        const anim = isolateAnimLabels[id] ?? '—'
        return (
          <div key={id} className="isolate-caption-line" title={`${row.displayName} — ${anim}`}>
            <span className="isolate-caption-object">{row.displayName}</span>
            <span className="isolate-caption-sep"> - </span>
            <span className="isolate-caption-anim">{anim}</span>
          </div>
        )
      })}
    </div>
  )
}
