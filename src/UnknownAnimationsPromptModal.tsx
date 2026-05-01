import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'

export type UnknownAnimEntry = {
  /** Spine display name (shown as a group header). */
  displayName: string
  /** Animation names that are not in the Common Animation States list. */
  names: string[]
}

type Decision = 'add' | 'ignore' | 'undecided'

type Props = {
  open: boolean
  entries: UnknownAnimEntry[]
  /** Called with the names the user chose to add (may be empty if all ignored/undecided). */
  onConfirm: (toAdd: string[]) => void
  /** Called when the user dismisses the modal without deciding. */
  onDismiss: () => void
  /** Override modal heading. Defaults to "New animation names detected". */
  title?: string
  /** Override body description. Defaults to animation-specific text. */
  description?: ReactNode
}

export function UnknownAnimationsPromptModal({ open, entries, onConfirm, onDismiss, title, description }: Props) {
  const titleId = useId()
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  // Per-name decision: 'add' | 'ignore' | 'undecided' (default)
  const [decisions, setDecisions] = useState<Map<string, Decision>>(new Map())

  // Reset to all-undecided whenever the modal opens with new entries
  useEffect(() => {
    if (open) {
      setDecisions(new Map())
    }
  }, [open, entries])

  useEffect(() => {
    if (!open) return
    closeBtnRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onDismiss])

  const setDecision = useCallback((name: string, decision: Decision) => {
    setDecisions((prev) => {
      const next = new Map(prev)
      next.set(name, decision)
      return next
    })
  }, [])

  const allNames = entries.flatMap((e) => e.names)

  const addAll = useCallback(() => {
    setDecisions(new Map(allNames.map((n) => [n, 'add'])))
  }, [allNames])

  const ignoreAll = useCallback(() => {
    setDecisions(new Map(allNames.map((n) => [n, 'ignore'])))
  }, [allNames])

  const toAddCount = [...decisions.values()].filter((d) => d === 'add').length

  const handleConfirm = useCallback(() => {
    const toAdd = allNames.filter((n) => decisions.get(n) === 'add')
    onConfirm(toAdd)
  }, [allNames, decisions, onConfirm])

  if (!open || entries.length === 0) return null

  return (
    <div
      className="editor-modal-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onDismiss()
      }}
    >
      <div
        className="editor-modal editor-modal--anim-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="editor-modal-head">
          <h2 id={titleId} className="editor-modal-title">
            {title ?? 'New animation names detected'}
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            className="editor-modal-close"
            onClick={onDismiss}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>

        <div className="editor-modal-body">
          <p className="editor-modal-desc">
            {description ?? (
              <>
                The following animation names were found that are <strong>not</strong> in your{' '}
                <strong>Common Animation States</strong> list. Decide which ones to add — names
                left undecided will be ignored for now.
              </>
            )}
          </p>

          <div className="anim-prompt-list">
            {entries.map((entry) => (
              <div key={entry.displayName} className="anim-prompt-group">
                <div className="anim-prompt-group-header">{entry.displayName}</div>
                {entry.names.map((name) => {
                  const decision = decisions.get(name) ?? 'undecided'
                  return (
                    <div
                      key={name}
                      className={`anim-prompt-row anim-prompt-row--${decision}`}
                    >
                      <code className="anim-prompt-name">{name}</code>
                      <div className="anim-prompt-actions">
                        <button
                          type="button"
                          className={`btn btn-sm anim-prompt-btn${decision === 'add' ? ' is-add' : ''}`}
                          onClick={() => setDecision(name, 'add')}
                          aria-pressed={decision === 'add'}
                          title="Add to Common Animation States"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm anim-prompt-btn${decision === 'ignore' ? ' is-ignore' : ''}`}
                          onClick={() => setDecision(name, 'ignore')}
                          aria-pressed={decision === 'ignore'}
                          title="Skip for now — warning will remain in the Inspector"
                        >
                          Ignore
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="editor-modal-foot editor-modal-foot--anim-prompt">
          <div className="editor-modal-foot-actions">
            <button
              type="button"
              className="btn btn-sm"
              onClick={addAll}
              title="Mark all names as Add"
            >
              Add all
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={ignoreAll}
              title="Mark all names as Ignore"
            >
              Ignore all
            </button>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirm}
          >
            {toAddCount > 0 ? `Add ${toAddCount} name${toAddCount === 1 ? '' : 's'}` : 'Done'}
          </button>
        </div>
      </div>
    </div>
  )
}
