import assert from 'node:assert/strict'
import type { LucideIcon } from 'lucide-react'
import {
  createEditorCommandRegistry,
  filterEditorCommands,
  findEditorCommand,
  getCommandsForSurface,
  type EditorCommandDefinition,
} from '../src/tiptap-editor/editor-command-registry'

const Icon = (() => null) as unknown as LucideIcon
const definitions: EditorCommandDefinition[] = [
  {
    id: 'bold',
    group: 'inline',
    label: '粗体',
    keywords: ['bold', 'strong'],
    icon: Icon,
    shortcut: 'Mod-B',
    surfaces: ['main', 'bubble'],
  },
  {
    id: 'image',
    group: 'insert',
    label: '图片',
    keywords: ['image', 'photo', 'tupian'],
    icon: Icon,
    surfaces: ['insert', 'slash'],
  },
  {
    id: 'unbound',
    group: 'format',
    label: '未绑定',
    icon: Icon,
    surfaces: ['format'],
  },
]

const calls: string[] = []
const commands = createEditorCommandRegistry(definitions, {
  bold: {
    active: true,
    execute: () => calls.push('bold'),
  },
  image: {
    disabled: true,
    execute: () => calls.push('image'),
  },
})

assert.deepEqual(commands.map((command) => command.id), ['bold', 'image'], 'unbound definitions are omitted')
assert.deepEqual(getCommandsForSurface(commands, 'main').map((command) => command.id), ['bold'])
assert.deepEqual(getCommandsForSurface(commands, 'slash').map((command) => command.id), ['image'])
assert.equal(findEditorCommand(commands, 'bold')?.active, true)
assert.equal(findEditorCommand(commands, 'image')?.disabled, true)
assert.deepEqual(filterEditorCommands(commands, 'strong').map((command) => command.id), ['bold'])
assert.deepEqual(filterEditorCommands(commands, 'tupian').map((command) => command.id), ['image'])
assert.deepEqual(filterEditorCommands(commands, '').map((command) => command.id), ['bold', 'image'])

findEditorCommand(commands, 'bold')?.execute()
assert.deepEqual(calls, ['bold'], 'all surfaces call the same registered command')

console.log('✓ editor command registry surface and search contracts')
