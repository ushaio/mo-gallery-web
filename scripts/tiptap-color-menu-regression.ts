import { shouldCloseColorPickerMenu } from '../src/components/tiptap-editor/color-picker-utils.ts'

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

type MockNode = {
  name: string
}

type MockElement = {
  contains: (target: MockNode | null) => boolean
}

const buttonTarget: MockNode = { name: 'button' }
const menuTarget: MockNode = { name: 'menu-item' }
const outsideTarget: MockNode = { name: 'outside' }

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
