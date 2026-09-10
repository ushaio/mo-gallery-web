/** Native editing and nested tools keep their own keyboard behavior. */
export function isZineEditableTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="spinbutton"]',
  ))
}

export function isZineShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof Element) || !target.closest('[data-zine-editor]')) return false
  return !isZineEditableTarget(target) && !target.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="separator"]')
}

export function isZineControlTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('button, a, [role="button"]:not([data-zine-slot])'))
}
