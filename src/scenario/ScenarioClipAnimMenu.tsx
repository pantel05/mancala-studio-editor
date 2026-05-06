import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type ScenarioClipAnimMenuProps = {
  value: string
  names: string[]
  onChange: (name: string) => void
}

type MenuPos = { top: number; left: number; width: number; maxHeight: number }

const EST_ROW_PX = 34
const MENU_VERTICAL_PAD = 12
const MAX_MENU_NATURAL = 280

function computeMenuLayout(btn: DOMRect, namesLength: number): MenuPos {
  const margin = 8
  const gap = 4
  const maxW = Math.min(280, window.innerWidth - 16)
  const w = Math.min(maxW, Math.max(180, 200))
  let left = btn.right - w
  left = Math.max(margin, Math.min(left, window.innerWidth - w - margin))

  const estContentH = Math.min(MAX_MENU_NATURAL, MENU_VERTICAL_PAD + namesLength * EST_ROW_PX)
  const spaceBelow = window.innerHeight - btn.bottom - gap - margin
  const spaceAbove = btn.top - gap - margin

  let top: number
  let maxHeight: number

  const fitsBelow = estContentH <= spaceBelow
  const fitsAbove = estContentH <= spaceAbove

  if (fitsBelow) {
    top = btn.bottom + gap
    maxHeight = Math.min(MAX_MENU_NATURAL, Math.max(96, spaceBelow))
  } else if (fitsAbove || spaceAbove > spaceBelow) {
    maxHeight = Math.min(MAX_MENU_NATURAL, Math.max(96, spaceAbove))
    const targetH = Math.min(estContentH, maxHeight)
    top = btn.top - gap - targetH
    if (top < margin) {
      top = margin
      maxHeight = Math.min(maxHeight, Math.max(96, btn.top - gap - margin))
    }
  } else {
    top = btn.bottom + gap
    maxHeight = Math.max(96, spaceBelow)
  }

  return { top, left, width: w, maxHeight }
}

/**
 * Compact animation picker — portaled with `position: fixed`. Opens **upward** when there is
 * not enough room below the trigger (e.g. track near bottom of the window).
 */
export function ScenarioClipAnimMenu({ value, names, onChange }: ScenarioClipAnimMenuProps) {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const updateMenuPos = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    setMenuPos(computeMenuLayout(el.getBoundingClientRect(), names.length))
  }, [names.length])

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null)
      return
    }
    updateMenuPos()
    const onReposition = () => updateMenuPos()
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open, updateMenuPos])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (listRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const menu =
    open && menuPos ? (
      <ul
        ref={listRef}
        className="scenario-anim-menu-list scenario-anim-menu-list--portal"
        style={{
          position: 'fixed',
          top: menuPos.top,
          left: menuPos.left,
          width: menuPos.width,
          maxHeight: menuPos.maxHeight,
        }}
        role="listbox"
        aria-label="Animations"
      >
        {names.map((n) => (
          <li key={n} role="presentation">
            <button
              type="button"
              className={`scenario-anim-menu-item${n === value ? ' is-current' : ''}`}
              role="option"
              aria-selected={n === value}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onChange(n)
                setOpen(false)
              }}
            >
              {n}
            </button>
          </li>
        ))}
      </ul>
    ) : null

  return (
    <div className="scenario-anim-menu-root">
      <button
        ref={triggerRef}
        type="button"
        className="scenario-anim-menu-trigger"
        title="Choose animation"
        aria-expanded={open}
        aria-haspopup="listbox"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        <span className="scenario-anim-menu-trigger-chevron" aria-hidden>
          ▾
        </span>
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  )
}
