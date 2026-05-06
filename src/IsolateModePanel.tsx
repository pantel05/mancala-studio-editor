import { useRef, useState, type DragEvent } from 'react'
import type { SpineControlRow } from './SpineInstanceControls'

const ANIM_DND_MIME = 'application/x-mancala-isolate-anim'

function dragRowKey(spineId: string, index: number): string {
  return `${spineId}:${index}`
}

function parseDragRowKey(key: string): { spineId: string; index: number } | null {
  const i = key.lastIndexOf(':')
  if (i <= 0) return null
  const spineId = key.slice(0, i)
  const index = Number(key.slice(i + 1))
  if (!Number.isFinite(index)) return null
  return { spineId, index }
}

export type IsolateModePanelProps = {
  /** All spine instances in the scene (root and nested under placeholders). */
  spineRows: SpineControlRow[]
  isolateSpineOrder: string[]
  onIsolateSpineOrderChange: (next: string[]) => void
  isolateAnimQueues: Record<string, string[]>
  onIsolateAnimQueuesChange: (next: Record<string, string[]>) => void
  isolateAnimSpeed: Record<string, number>
  onIsolateAnimSpeedChange: (id: string, speed: number) => void
  /** Clear per-object isolate metadata when removing from the list. */
  onIsolateSpineMetaRemove: (id: string) => void
  isolatePlaying: boolean
  onPlaySequences: () => void
  onStopSequences: () => void
}

function rowById(rows: SpineControlRow[], id: string): SpineControlRow | undefined {
  return rows.find((r) => r.id === id)
}

export function IsolateModePanel({
  spineRows,
  isolateSpineOrder,
  onIsolateSpineOrderChange,
  isolateAnimQueues,
  onIsolateAnimQueuesChange,
  isolateAnimSpeed,
  onIsolateAnimSpeedChange,
  onIsolateSpineMetaRemove,
  isolatePlaying,
  onPlaySequences,
  onStopSequences,
}: IsolateModePanelProps) {
  const inSet = new Set(isolateSpineOrder)
  const addable = spineRows.filter((r) => !inSet.has(r.id))

  const moveSpine = (id: string, dir: -1 | 1) => {
    const i = isolateSpineOrder.indexOf(id)
    if (i < 0) return
    const j = i + dir
    if (j < 0 || j >= isolateSpineOrder.length) return
    const next = [...isolateSpineOrder]
    const t = next[i]!
    next[i] = next[j]!
    next[j] = t
    onIsolateSpineOrderChange(next)
  }

  const removeSpine = (id: string) => {
    onIsolateSpineOrderChange(isolateSpineOrder.filter((x) => x !== id))
    const { [id]: _, ...rest } = isolateAnimQueues
    onIsolateAnimQueuesChange(rest)
    onIsolateSpineMetaRemove(id)
  }

  const addSpine = (id: string) => {
    const row = rowById(spineRows, id)
    if (!row) return
    const names = row.spine.skeleton.data.animations.map((a) => a.name)
    onIsolateSpineOrderChange([...isolateSpineOrder, id])
    onIsolateAnimQueuesChange({ ...isolateAnimQueues, [id]: [...names] })
    onIsolateAnimSpeedChange(id, 1)
  }

  const setQueue = (id: string, queue: string[]) => {
    onIsolateAnimQueuesChange({ ...isolateAnimQueues, [id]: queue })
  }

  const moveAnim = (spineId: string, index: number, dir: -1 | 1) => {
    const q = [...(isolateAnimQueues[spineId] ?? [])]
    const j = index + dir
    if (j < 0 || j >= q.length) return
    const t = q[index]!
    q[index] = q[j]!
    q[j] = t
    setQueue(spineId, q)
  }

  const removeAnim = (spineId: string, index: number) => {
    const q = [...(isolateAnimQueues[spineId] ?? [])]
    q.splice(index, 1)
    setQueue(spineId, q)
  }

  const appendAnim = (spineId: string, name: string) => {
    if (!name) return
    const q = [...(isolateAnimQueues[spineId] ?? [])]
    q.push(name)
    setQueue(spineId, q)
  }

  const [animDragKey, setAnimDragKey] = useState<string | null>(null)
  /** Row under the pointer while reordering (same skeleton list only). */
  const [animDropHoverKey, setAnimDropHoverKey] = useState<string | null>(null)
  /** Sync with `animDragKey` for dragover handlers (state may lag one frame after dragstart). */
  const animDragKeyRef = useRef<string | null>(null)

  const reorderAnimDrag = (spineId: string, fromIndex: number, toIndex: number) => {
    const q = [...(isolateAnimQueues[spineId] ?? [])]
    if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= q.length) return
    if (toIndex < 0 || toIndex > q.length) return
    const [item] = q.splice(fromIndex, 1)
    let insertAt = toIndex
    if (fromIndex < toIndex) insertAt = toIndex - 1
    q.splice(insertAt, 0, item!)
    setQueue(spineId, q)
  }

  const onAnimDragStart = (spineId: string, index: number, e: DragEvent<HTMLSpanElement>) => {
    e.dataTransfer.effectAllowed = 'move'
    const payload = JSON.stringify({ spineId, index })
    e.dataTransfer.setData(ANIM_DND_MIME, payload)
    e.dataTransfer.setData('text/plain', payload)
    setAnimDropHoverKey(null)
    const k = dragRowKey(spineId, index)
    animDragKeyRef.current = k
    setAnimDragKey(k)
  }

  const onAnimDragEnd = () => {
    animDragKeyRef.current = null
    setAnimDragKey(null)
    setAnimDropHoverKey(null)
  }

  const onAnimDragOverItem = (spineId: string, idx: number, e: DragEvent<HTMLLIElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const activeKey = animDragKeyRef.current
    if (!activeKey) return
    const src = parseDragRowKey(activeKey)
    if (!src || src.spineId !== spineId) return
    setAnimDropHoverKey(dragRowKey(spineId, idx))
  }

  const onAnimQueueDragLeave = (spineId: string, e: DragEvent<HTMLOListElement>) => {
    const activeKey = animDragKeyRef.current
    if (!activeKey) return
    const src = parseDragRowKey(activeKey)
    if (!src || src.spineId !== spineId) return
    const related = e.relatedTarget as Node | null
    if (related && e.currentTarget.contains(related)) return
    setAnimDropHoverKey(null)
  }

  const onAnimDrop = (spineId: string, dropIndex: number, e: DragEvent<HTMLLIElement>) => {
    e.preventDefault()
    let raw = e.dataTransfer.getData(ANIM_DND_MIME)
    if (!raw) raw = e.dataTransfer.getData('text/plain')
    let payload: { spineId: string; index: number }
    try {
      payload = JSON.parse(raw) as { spineId: string; index: number }
    } catch {
      return
    }
    if (payload.spineId !== spineId) return
    reorderAnimDrag(spineId, payload.index, dropIndex)
    animDragKeyRef.current = null
    setAnimDragKey(null)
    setAnimDropHoverKey(null)
  }

  return (
    <div className="isolate-panel-inner">
      <div className="isolate-panel-head">
        <div className="isolate-panel-title">Isolate mode</div>
        <p className="isolate-panel-help">
          Starts with an empty canvas — add skeletons from the hierarchy below (root or nested). Each object plays its animation list in order (in parallel
          with others). Drag on the canvas to move instances; use <strong>In front</strong> / <strong>Behind</strong> for draw
          order (which skeleton paints on top). Reorder clips via the ⋮⋮ handle or row arrows. Exit from the canvas when done.
        </p>
        <div className="isolate-panel-transport">
          <button
            type="button"
            className="btn btn-compact"
            onClick={onPlaySequences}
            disabled={isolatePlaying || isolateSpineOrder.length === 0}
          >
            Play sequences
          </button>
          <button type="button" className="btn btn-compact" onClick={onStopSequences} disabled={!isolatePlaying}>
            Stop
          </button>
        </div>
      </div>

      <div className="isolate-add-row">
        <label className="isolate-add-label">
          <span>Add from hierarchy</span>
          <select
            className="editor-select isolate-add-select"
            value=""
            onChange={(e) => {
              const v = e.target.value
              if (v) addSpine(v)
              e.target.value = ''
            }}
            disabled={addable.length === 0}
            aria-label="Add skeleton to isolate list"
          >
            <option value="">{addable.length === 0 ? 'All skeletons added' : 'Choose skeleton…'}</option>
            {addable.map((r) => (
              <option key={r.id} value={r.id}>
                {r.displayName}
                {r.pinnedUnder ? ' (nested)' : ''}
                {r.placeholderPolicyFrozen && !r.placeholderPolicyIgnored ? ' (frozen)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="isolate-spine-list">
        {isolateSpineOrder.length === 0 ? (
          <p className="isolate-empty">Canvas is empty — use “Add from hierarchy” to show skeletons here.</p>
        ) : (
          isolateSpineOrder.map((id) => {
            const row = rowById(spineRows, id)
            if (!row) return null
            const q = isolateAnimQueues[id] ?? []
            const allNames = row.spine.skeleton.data.animations.map((a) => a.name)
            const idxInIsolate = isolateSpineOrder.indexOf(id)
            const speed = isolateAnimSpeed[id] ?? 1
            return (
              <section key={id} className="isolate-spine-block">
                <header className="isolate-spine-block-head">
                  <span className="isolate-spine-name" title={row.displayName}>
                    {row.displayName}
                  </span>
                  <div className="isolate-spine-block-actions">
                    <button
                      type="button"
                      className="btn btn-compact"
                      title="Draw this skeleton in front of the others (list order: top = front)"
                      aria-label="Bring skeleton toward front"
                      disabled={idxInIsolate <= 0}
                      onClick={() => moveSpine(id, -1)}
                    >
                      In front
                    </button>
                    <button
                      type="button"
                      className="btn btn-compact"
                      title="Draw this skeleton behind the others"
                      aria-label="Send skeleton toward back"
                      disabled={idxInIsolate < 0 || idxInIsolate >= isolateSpineOrder.length - 1}
                      onClick={() => moveSpine(id, 1)}
                    >
                      Behind
                    </button>
                    <button
                      type="button"
                      className="btn btn-compact isolate-remove-spine"
                      onClick={() => removeSpine(id)}
                    >
                      Remove
                    </button>
                  </div>
                </header>
                <div className="isolate-speed-row">
                  <label className="isolate-speed-label">
                    <span className="isolate-speed-label-text">Anim speed</span>
                    <input
                      type="range"
                      className="isolate-speed-slider"
                      min={0}
                      max={3}
                      step={0.05}
                      value={speed}
                      onChange={(e) => onIsolateAnimSpeedChange(id, Number(e.target.value))}
                      aria-valuemin={0}
                      aria-valuemax={3}
                      aria-valuenow={speed}
                      aria-label={`Animation speed for ${row.displayName}`}
                    />
                    <span className="isolate-speed-readout" title="Spine AnimationState timeScale">
                      {speed.toFixed(2)}×
                    </span>
                  </label>
                </div>
                <ol
                  className="isolate-anim-queue"
                  onDragLeave={(e) => onAnimQueueDragLeave(id, e)}
                >
                  {q.length === 0 ? (
                    <li className="isolate-anim-queue-empty">No clips — add from the dropdown below.</li>
                  ) : (
                    q.map((animName, idx) => {
                      const rowKey = dragRowKey(id, idx)
                      const isDraggingRow = animDragKey === rowKey
                      const isDropTarget =
                        animDragKey != null &&
                        animDropHoverKey === rowKey &&
                        animDragKey !== rowKey
                      return (
                      <li
                        key={`${id}-q-${idx}`}
                        className={
                          'isolate-anim-item' +
                          (isDraggingRow ? ' isolate-anim-item--dragging' : '') +
                          (isDropTarget ? ' isolate-anim-item--drop-target' : '')
                        }
                        onDragOver={(e) => onAnimDragOverItem(id, idx, e)}
                        onDrop={(e) => onAnimDrop(id, idx, e)}
                      >
                        <span
                          className="isolate-anim-grip"
                          draggable
                          role="button"
                          tabIndex={0}
                          aria-label={`Drag to reorder ${animName}`}
                          title="Drag to reorder"
                          onDragStart={(e) => onAnimDragStart(id, idx, e)}
                          onDragEnd={onAnimDragEnd}
                        >
                          ⋮⋮
                        </span>
                        <span className="isolate-anim-index">{idx + 1}.</span>
                        <span className="isolate-anim-name" title={animName}>
                          {animName}
                        </span>
                        <div className="isolate-anim-actions">
                          <button
                            type="button"
                            className="btn btn-compact"
                            aria-label={`Move ${animName} earlier`}
                            onClick={() => moveAnim(id, idx, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="btn btn-compact"
                            aria-label={`Move ${animName} later`}
                            onClick={() => moveAnim(id, idx, 1)}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="btn btn-compact"
                            aria-label={`Remove ${animName} from queue`}
                            onClick={() => removeAnim(id, idx)}
                          >
                            ×
                          </button>
                        </div>
                      </li>
                      )
                    })
                  )}
                </ol>
                <div className="isolate-append-anim">
                  <select
                    className="editor-select isolate-append-select"
                    value=""
                    disabled={allNames.length === 0}
                    onChange={(e) => {
                      appendAnim(id, e.target.value)
                      e.target.value = ''
                    }}
                    aria-label={`Add animation to queue for ${row.displayName}`}
                  >
                    <option value="">
                      {allNames.length === 0 ? 'No animations on skeleton' : 'Add clip to queue…'}
                    </option>
                    {allNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </section>
            )
          })
        )}
      </div>
    </div>
  )
}
