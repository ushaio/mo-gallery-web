export function shouldCloseColorPickerMenu(
  target: Node | null,
  buttonElement: Pick<HTMLElement, 'contains'> | null,
  menuElement: Pick<HTMLElement, 'contains'> | null
) {
  if (buttonElement?.contains(target)) {
    return false
  }

  if (menuElement?.contains(target)) {
    return false
  }

  return true
}
