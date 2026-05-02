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
  /** Label shown in the confirmation warning. Defaults to "Common Animation States". */
  listLabel?: string
}

export function UnknownAnimationsPromptModal({ open, entries, onConfirm, onDismiss, title, description, listLabel }: Props) {
  const titleId = useId()
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  const [decisions, setDecisions] = useState<Map<string, Decision>>(new Map())
  const [confirmStep, setConfirmStep] = useState(false)

  // Reset state whenever the modal opens with new entries
  useEffect(() => {
    if (open) {
      setDecisions(new Map())
      setConfirmStep(false)
    }
  }, [open, entries])

  useEffect(() => {
    if (!open) return
    if (confirmStep) {
      confirmBtnRef.current?.focus()
    } else {
      closeBtnRef.current?.focus()
    }
  }, [open, confirmStep])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmStep) setConfirmStep(false)
        else onDismiss()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, confirmStep, onDismiss])

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

  const toAdd = allNames.filter((n) => decisions.get(n) === 'add')
  const toAddCount = toAdd.length

  const handleRequestConfirm = useCallback(() => {
    if (toAddCount === 0) {
      onConfirm([])
      return
    }
    setConfirmStep(true)
  }, [toAddCount, onConfirm])

  const handleFinalConfirm = useCallback(() => {
    onConfirm(toAdd)
  }, [toAdd, onConfirm])

  if (!open || entries.length === 0) return null

  const resolvedListLabel = listLabel ?? 'Common Animation States'

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
            {confirmStep ? 'Review before adding' : (title ?? 'New animation names detected')}
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            className="editor-modal-close"
            onClick={confirmStep ? () => setConfirmStep(false) : onDismiss}
            aria-label={confirmStep ? 'Go back' : 'Dismiss'}
          >
            ×
          </button>
        </div>

        {confirmStep ? (
          <>
            <div className="editor-modal-body">
              <div className="add-confirm-warning" role="alert">
                <span className="add-confirm-warning-icon">⚠️</span>
                <div className="add-confirm-warning-text">
                  <p>
                    You are about to add the following{' '}
                    {toAddCount === 1 ? 'name' : `${toAddCount} names`} to your{' '}
                    <strong>{resolvedListLabel}</strong> list. Once saved, they will be treated
                    as <strong>valid and approved</strong> in all future imports — the validator
                    will no longer flag them.
                  </p>
                  <p>
                    <strong>
                      If any name contains a typo, it will silently pass future validation
                    </strong>{' '}
                    and may cause integration issues that are difficult to trace later.
                  </p>
                  <p>Please double-check the spelling carefully before confirming.</p>
                </div>
              </div>
              <ul className="add-confirm-name-list">
                {toAdd.map((name) => (
                  <li key={name} className="add-confirm-name-item">
                    <code>{name}</code>
                  </li>
                ))}
              </ul>
            </div>
            <div className="editor-modal-foot editor-modal-foot--confirm">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setConfirmStep(false)}
              >
                Go back
              </button>
              <button
                ref={confirmBtnRef}
                type="button"
                className="btn btn-primary"
                onClick={handleFinalConfirm}
              >
                Confirm &amp; Add {toAddCount} name{toAddCount === 1 ? '' : 's'}
              </button>
            </div>
          </>
        ) : (
          <>
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
                onClick={handleRequestConfirm}
              >
                {toAddCount > 0 ? `Add ${toAddCount} name${toAddCount === 1 ? '' : 's'}` : 'Done'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
