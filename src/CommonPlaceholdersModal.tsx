import { useCallback, useEffect, useId, useRef, useState } from 'react'

const EXPORT_FILENAME = 'mancala-gaming-placeholders.json'

type CommonPlaceholdersModalProps = {
  open: boolean
  onClose: () => void
  names: string[]
  onNamesChange: (next: string[]) => void
}

export function CommonPlaceholdersModal({
  open,
  onClose,
  names,
  onNamesChange,
}: CommonPlaceholdersModalProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState('')
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    closeBtnRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const addName = useCallback(() => {
    const t = draft.trim()
    if (t.length === 0) return
    if (names.includes(t)) {
      setDraft('')
      return
    }
    onNamesChange([...names, t])
    setDraft('')
  }, [draft, names, onNamesChange])

  const removeAt = useCallback(
    (index: number) => {
      onNamesChange(names.filter((_, i) => i !== index))
    },
    [names, onNamesChange],
  )

  const exportNames = useCallback(() => {
    const blob = new Blob(
      [JSON.stringify({ commonPlaceholderBoneNames: names }, null, 2)],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = EXPORT_FILENAME
    a.click()
    URL.revokeObjectURL(url)
  }, [names])

  const triggerImport = useCallback(() => {
    setImportError(null)
    importInputRef.current?.click()
  }, [])

  const onImportFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string) as unknown
          const list =
            parsed &&
            typeof parsed === 'object' &&
            !Array.isArray(parsed) &&
            'commonPlaceholderBoneNames' in parsed
              ? (parsed as { commonPlaceholderBoneNames: unknown }).commonPlaceholderBoneNames
              : parsed
          if (!Array.isArray(list)) throw new Error('Expected an array of names.')
          const cleaned = (list as unknown[])
            .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
            .map((x) => x.trim())
          onNamesChange([...new Set([...names, ...cleaned])])
          setImportError(null)
        } catch (err) {
          setImportError(err instanceof Error ? err.message : 'Invalid file.')
        }
      }
      reader.readAsText(file)
    },
    [names, onNamesChange],
  )

  if (!open) return null

  return (
    <div
      className="editor-modal-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className="editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="editor-modal-head">
          <h2 id={titleId} className="editor-modal-title">
            Common placeholders
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            className="editor-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="editor-modal-body">
          <p className="editor-modal-desc">
            Bone names listed here are the only valid placeholder bones when this list is non-empty. They must match
            your Spine skeleton exactly (case-sensitive). Names are saved automatically in this browser — you
            don't need to do anything to keep them. The <strong>Export</strong> / <strong>Import</strong> buttons
            at the bottom are only needed if you move to a different server or browser.
          </p>
          {importError && (
            <p className="editor-modal-import-error" role="alert">{importError}</p>
          )}
          <div className="editor-placeholder-add-row">
            <input
              type="text"
              className="editor-modal-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addName()
                }
              }}
              placeholder="e.g. placeholder-reels"
              aria-label="New placeholder bone name"
            />
            <button type="button" className="btn btn-primary" onClick={addName}>
              Add
            </button>
          </div>
          {names.length === 0 ? (
            <p className="editor-modal-empty">No names yet — add your first placeholder bone name above.</p>
          ) : (
            <ul className="editor-placeholder-name-list">
              {names.map((n, i) => (
                <li key={`${n}-${i}`} className="editor-placeholder-name-item">
                  <code className="editor-placeholder-name-code">{n}</code>
                  <button type="button" className="btn btn-sm" onClick={() => removeAt(i)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="editor-modal-foot editor-modal-foot--placeholders">
          <div className="editor-modal-foot-actions">
            <button
              type="button"
              className="btn btn-sm"
              onClick={exportNames}
              disabled={names.length === 0}
              title="Download as JSON file — use Import to restore on any port or server"
            >
              Export
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={triggerImport}
              title="Load from a previously exported JSON file — merges with current list"
            >
              Import
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              className="visually-hidden"
              aria-hidden
              onChange={onImportFile}
            />
          </div>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
