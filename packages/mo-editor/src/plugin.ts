export interface MoEditorPluginContext {
  readonly root: HTMLElement
  readonly storage: Map<string, unknown>
  registerCommand(id: string, command: () => void): void
  unregisterCommand(id: string): void
}

export interface MoEditorPlugin {
  id: string
  name?: string
  version?: string
  commands?: Record<string, (context: MoEditorPluginContext) => void>
  onLoad?: (context: MoEditorPluginContext) => void | (() => void)
  onChange?: (html: string, context: MoEditorPluginContext) => void
  transformMarkdown?: (markdown: string) => string
}

export function createPluginContext(root: HTMLElement) {
  const commands = new Map<string, () => void>()
  const context: MoEditorPluginContext = {
    root,
    storage: new Map(),
    registerCommand: (id, command) => commands.set(id, command),
    unregisterCommand: (id) => commands.delete(id),
  }
  return { context, run: (id: string) => commands.get(id)?.() }
}
