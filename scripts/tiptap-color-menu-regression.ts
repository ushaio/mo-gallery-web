import { shouldCloseColorPickerMenu } from '../src/components/tiptap-editor/color-picker-utils'

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

type MockNode = Node

type MockElement = {
  contains: (target: Node | null) => boolean
}

const buttonTarget = { name: 'button' } as unknown as Node
const menuTarget = { name: 'menu-item' } as unknown as Node
const outsideTarget = { name: 'outside' } as unknown as Node

const buttonElement: MockElement = {
  contains: (target) => target === buttonTarget,
}

const menuElement: MockElement = {
  contains: (target) => target === menuTarget,
}

assert(
  shouldCloseColorPickerMenu(buttonTarget, buttonElement as never, menuElement as never) === false,
  'clicking the toolbar button should not close the menu'
)

assert(
  shouldCloseColorPickerMenu(menuTarget, buttonElement as never, menuElement as never) === false,
  'clicking inside the color menu should not close the menu before the color action runs'
)

assert(
  shouldCloseColorPickerMenu(outsideTarget, buttonElement as never, menuElement as never) === true,
  'clicking outside the button and menu should close the menu'
)

console.log('tiptap-color-menu regression: ok')
