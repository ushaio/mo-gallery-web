import type { LucideIcon } from 'lucide-react'

export type EditorCommandGroup =
  | 'block'
  | 'inline'
  | 'insert'
  | 'format'
  | 'table'
  | 'media'
  | 'ai'
  | 'history'

export type EditorCommandSurface =
  | 'main'
  | 'bubble'
  | 'floating'
  | 'insert'
  | 'format'
  | 'slash'
  | 'block'
  | 'node'

export interface EditorCommandDescriptor {
  id: string
  group: EditorCommandGroup
  label: string
  keywords: readonly string[]
  icon: LucideIcon
  shortcut?: string
  surfaces: readonly EditorCommandSurface[]
  active: boolean
  disabled: boolean
  execute: () => void
}

export interface EditorCommandDefinition {
  id: string
  group: EditorCommandGroup
  label: string
  keywords?: readonly string[]
  icon: LucideIcon
  shortcut?: string
  surfaces: readonly EditorCommandSurface[]
}

export interface EditorCommandBinding {
  active?: boolean
  disabled?: boolean
  execute: () => void
}

export function createEditorCommandRegistry(
  definitions: readonly EditorCommandDefinition[],
  bindings: Readonly<Record<string, EditorCommandBinding>>,
): EditorCommandDescriptor[] {
  return definitions.flatMap((definition) => {
    const binding = bindings[definition.id]
    if (!binding) return []

    return [{
      ...definition,
      keywords: definition.keywords ?? [],
      active: binding.active ?? false,
      disabled: binding.disabled ?? false,
      execute: binding.execute,
    }]
  })
}

export function getCommandsForSurface(
  commands: readonly EditorCommandDescriptor[],
  surface: EditorCommandSurface,
) {
  return commands.filter((command) => command.surfaces.includes(surface))
}

export function findEditorCommand(
  commands: readonly EditorCommandDescriptor[],
  commandId: string,
) {
  return commands.find((command) => command.id === commandId)
}

export function filterEditorCommands(
  commands: readonly EditorCommandDescriptor[],
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return [...commands]

  return commands.filter((command) => (
    command.label.toLocaleLowerCase().includes(normalizedQuery)
    || command.id.toLocaleLowerCase().includes(normalizedQuery)
    || command.keywords.some((keyword) => keyword.toLocaleLowerCase().includes(normalizedQuery))
  ))
}
