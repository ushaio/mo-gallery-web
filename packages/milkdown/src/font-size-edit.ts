import { editorViewCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import { getSelectedTextStyle, setTextStyle } from './text-style-plugin'
import { DEFAULT_FONT_SIZE, MAX_FONT_SIZE, MIN_FONT_SIZE } from './text-style'

const SIZE_SELECTOR = '.top-bar-heading-selector'
const SIZE_MARK = '[data-mo-toolbar-mark="size"]'
const detachers = new WeakMap<HTMLElement, () => void>()

/**
 * Crepe renders the toolbar selector buttons in its own Vue tree, so the
 * exact-size input is a DOM enhancement: double-clicking the size selector
 * swaps its label for a text input while single click keeps the dropdown.
 */
export function attachFontSizeEdit(root: HTMLElement, getCtx: () => Ctx) {
  detachers.get(root)?.()
  const onDoubleClick = (event: Event) => {
    const selector = (event.target as HTMLElement | null)?.closest?.(SIZE_SELECTOR) as HTMLElement | null
    if (!selector?.querySelector(SIZE_MARK)) return
    event.preventDefault()
    beginSizeEdit(selector, getCtx())
  }
  root.addEventListener('dblclick', onDoubleClick)
  detachers.set(root, () => root.removeEventListener('dblclick', onDoubleClick))
}

function beginSizeEdit(selector: HTMLElement, ctx: Ctx) {
  const button = selector.querySelector('.top-bar-heading-button')
  const label = selector.querySelector('.top-bar-heading-label') as HTMLElement | null
  if (!button || !label || selector.querySelector('.top-bar-size-input')) return
  const { size } = getSelectedTextStyle(ctx.get(editorViewCtx).state)
  const input = document.createElement('input')
  input.type = 'text'
  input.inputMode = 'numeric'
  input.className = 'top-bar-size-input'
  input.value = String(size ?? DEFAULT_FONT_SIZE)
  // Pointer events must not reach Crepe's button handler, or each click re-toggles the dropdown.
  for (const type of ['pointerdown', 'dblclick'] as const) input.addEventListener(type, (event) => event.stopPropagation())
  let closed = false
  const close = (apply: boolean) => {
    if (closed) return
    closed = true
    const value = Number.parseInt(input.value, 10)
    input.remove()
    label.style.display = ''
    if (apply && Number.isFinite(value)) {
      const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, value))
      const view = ctx.get(editorViewCtx)
      setTextStyle('size', String(clamped))(view.state, view.dispatch, view)
    }
    ctx.get(editorViewCtx).focus()
  }
  input.addEventListener('blur', () => close(true))
  input.addEventListener('keydown', (event) => {
    event.stopPropagation()
    if (event.key === 'Enter') close(true)
    else if (event.key === 'Escape') close(false)
  })
  label.style.display = 'none'
  button.insertBefore(input, label)
  input.focus()
  input.select()
}
