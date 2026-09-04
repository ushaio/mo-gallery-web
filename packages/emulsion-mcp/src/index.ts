#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

interface AutomationDescriptor {
  version: number
  url: string
  token: string
  pid: number
  startedAt: string
}

type JsonRecord = Record<string, unknown>

const editorTargetShape = {
  documentId: z.string().optional().describe('Current story or blog document id'),
  documentKind: z.enum(['story', 'blog']).optional(),
}

const toolbarCommandIds = [
  'bold', 'italic', 'underline', 'strike', 'inlineCode',
  'bulletList', 'orderedList', 'blockquote',
  'alignLeft', 'alignCenter', 'alignRight', 'clearFormatting',
  'undo', 'redo', 'textColor', 'backgroundColor',
] as const

const toolbarControlIds = ['headingLevel', 'fontFamily', 'fontSize'] as const

function descriptorPath() {
  if (process.env.EMULSION_AUTOMATION_FILE) return process.env.EMULSION_AUTOMATION_FILE
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || join(process.env.USERPROFILE || homedir(), 'AppData', 'Roaming')
    return join(appData, 'mo-gallery-desktop', 'automation.json')
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'mo-gallery-desktop', 'automation.json')
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'mo-gallery-desktop', 'automation.json')
}

async function readDescriptor(): Promise<AutomationDescriptor> {
  let raw: string
  try {
    raw = await readFile(descriptorPath(), 'utf8')
  } catch {
    throw new Error('Emulsion automation is unavailable. Start it with EMULSION_AUTOMATION=1 and wails dev.')
  }
  const descriptor = JSON.parse(raw) as Partial<AutomationDescriptor>
  if (!descriptor.url || !descriptor.token || descriptor.version !== 1) {
    throw new Error('Emulsion automation descriptor is invalid or unsupported')
  }
  return descriptor as AutomationDescriptor
}

async function request(path: string, init?: RequestInit): Promise<JsonRecord> {
  const descriptor = await readDescriptor()
  let response: Response
  try {
    response = await fetch(`${descriptor.url}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${descriptor.token}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    })
  } catch (error) {
    throw new Error(`Cannot connect to Emulsion automation process ${descriptor.pid}: ${String(error)}`)
  }
  const body = await response.text()
  let payload: JsonRecord
  try {
    payload = body ? JSON.parse(body) as JsonRecord : {}
  } catch {
    throw new Error(`Emulsion returned an invalid response (${response.status}): ${body}`)
  }
  if (!response.ok || payload.ok === false) {
    throw new Error(typeof payload.error === 'string' ? payload.error : `Emulsion request failed (${response.status})`)
  }
  return payload
}

function targetParams(input: { documentId?: string; documentKind?: 'story' | 'blog' }) {
  return {
    ...(input.documentId ? { documentId: input.documentId } : {}),
    ...(input.documentKind ? { documentKind: input.documentKind } : {}),
  }
}

async function editorCommand(method: string, params: JsonRecord = {}) {
  return request('/v1/editor/command', {
    method: 'POST',
    body: JSON.stringify({ method, params }),
  })
}

function textResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  }
}

function errorResult(error: unknown) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
  }
}

/** Compare persisted ProseMirror JSON by structure rather than object key order. */
function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalizeJson(entry)]),
    )
  }
  return value
}

function structurallyEqualJson(left: unknown, right: unknown) {
  return JSON.stringify(canonicalizeJson(left)) === JSON.stringify(canonicalizeJson(right))
}

async function runTool(operation: () => Promise<unknown>) {
  try {
    return textResult(await operation())
  } catch (error) {
    return errorResult(error)
  }
}

const server = new McpServer({ name: 'emulsion', version: '0.1.0' })

server.registerTool('emulsion_status', {
  description: 'Check whether the local Emulsion automation endpoint is running.',
}, async () => runTool(() => request('/v1/status')))

server.registerTool('editor_status', {
  description: 'List active TipTap editor targets in Emulsion.',
}, async () => runTool(() => editorCommand('status')))

server.registerTool('app_navigate', {
  description: 'Navigate Emulsion to a top-level menu. Use this after restarting the desktop client.',
  inputSchema: {
    menu: z.enum([
      'home', 'library', 'local-library', 'cloud-library', 'photos', 'albums', 'film-rolls',
      'upload', 'photo-journal', 'design', 'ai-assistant', 'inspiration', 'storage', 'settings', 'friends',
    ]),
  },
}, async ({ menu }) => runTool(() => editorCommand('navigate', { menu })))

server.registerTool('app_location', {
  description: 'Return Emulsion current route and active editor target.',
}, async () => runTool(() => editorCommand('location')))

server.registerTool('editor_open_document', {
  description: 'Open a story or blog editor and wait until its TipTap target is ready. Draft content is used by default; choose database to ignore the local draft.',
  inputSchema: {
    documentId: z.string().min(1),
    documentKind: z.enum(['story', 'blog']),
    source: z.enum(['draft', 'database']).default('draft'),
  },
}, async (input) => runTool(() => editorCommand('open_document', input)))

server.registerTool('editor_focus', {
  description: 'Focus the current Emulsion TipTap editor.',
  inputSchema: editorTargetShape,
}, async (input) => runTool(() => editorCommand('focus', targetParams(input))))

server.registerTool('editor_set_content', {
  description: 'Replace editor content to prepare a debugging scenario. This updates the active draft.',
  inputSchema: {
    ...editorTargetShape,
    content: z.string().describe('HTML or Markdown content accepted by the shared editor'),
  },
}, async (input) => runTool(() => editorCommand('set_content', {
  ...targetParams(input),
  content: input.content,
})))

server.registerTool('editor_type_text', {
  description: 'Type text through ProseMirror text-input handlers so Markdown input rules execute.',
  inputSchema: {
    ...editorTargetShape,
    text: z.string(),
  },
}, async (input) => runTool(() => editorCommand('type_text', {
  ...targetParams(input),
  text: input.text,
})))

server.registerTool('editor_press_key', {
  description: 'Send a key through the active ProseMirror keymap, including Enter, Backspace and shortcuts.',
  inputSchema: {
    ...editorTargetShape,
    key: z.string().min(1),
    code: z.string().optional(),
    ctrlKey: z.boolean().optional(),
    altKey: z.boolean().optional(),
    shiftKey: z.boolean().optional(),
    metaKey: z.boolean().optional(),
  },
}, async (input) => runTool(() => editorCommand('press_key', input)))

server.registerTool('editor_set_selection', {
  description: 'Place the live editor selection at a ProseMirror document position for deterministic keyboard debugging.',
  inputSchema: {
    ...editorTargetShape,
    from: z.number().int().min(1),
    to: z.number().int().min(1).optional(),
  },
}, async (input) => runTool(() => editorCommand('set_selection', input)))

server.registerTool('editor_get_state', {
  description: 'Return live TipTap HTML, JSON, selection, block type and active marks.',
  inputSchema: editorTargetShape,
}, async (input) => runTool(() => editorCommand('get_state', targetParams(input))))

server.registerTool('editor_toolbar_state', {
  description: 'Return the live TipTap toolbar commands, selected values, enabled state, and editor state.',
  inputSchema: editorTargetShape,
}, async (input) => runTool(() => editorCommand('toolbar_state', targetParams(input))))

server.registerTool('editor_list_metrics', {
  description: 'Read rendered list item and ::marker computed font sizes to verify nested list symbol inheritance.',
  inputSchema: editorTargetShape,
}, async (input) => runTool(() => editorCommand('list_metrics', targetParams(input))))

server.registerTool('editor_toolbar_click', {
  description: 'Click a real TipTap toolbar formatting button by stable command id.',
  inputSchema: {
    ...editorTargetShape,
    commandId: z.enum(toolbarCommandIds),
  },
}, async (input) => runTool(() => editorCommand('toolbar_click', input)))

server.registerTool('editor_toolbar_select', {
  description: 'Choose a real TipTap toolbar select value. Read valid values with editor_toolbar_state first.',
  inputSchema: {
    ...editorTargetShape,
    controlId: z.enum(toolbarControlIds),
    value: z.string(),
  },
}, async (input) => runTool(() => editorCommand('toolbar_select', input)))

server.registerTool('editor_toolbar_color', {
  description: 'Open the real TipTap formatting menu and color picker, then choose or clear a text/background color.',
  inputSchema: {
    ...editorTargetShape,
    kind: z.enum(['textColor', 'backgroundColor']),
    value: z.string().describe('Hex color such as #ef4444, or an empty string to clear it'),
  },
}, async (input) => runTool(() => editorCommand('toolbar_color', input)))

server.registerTool('draft_get', {
  description: 'Read a persisted draft through the Emulsion drafts.db data layer.',
  inputSchema: {
    key: z.string().min(1).describe('For example story_editor_<storyId> or blog_draft_<blogId>'),
  },
}, async ({ key }) => runTool(() => request(`/v1/drafts/get?key=${encodeURIComponent(key)}`)))

server.registerTool('draft_wait_saved', {
  description: 'Wait until a draft autosave has a savedAt value newer than the supplied baseline.',
  inputSchema: {
    key: z.string().min(1),
    afterSavedAt: z.number().int().nonnegative(),
    timeoutMs: z.number().int().min(100).max(30000).optional(),
  },
}, async (input) => runTool(() => request('/v1/drafts/wait', {
  method: 'POST',
  body: JSON.stringify(input),
})))

server.registerTool('draft_restore', {
  description: 'Restore a draft_get snapshot after a destructive editor automation scenario.',
  inputSchema: {
    key: z.string().min(1),
    data: z.record(z.string(), z.unknown()).describe('The complete data object previously returned by draft_get'),
  },
}, async (input) => runTool(() => request('/v1/drafts/restore', {
  method: 'POST',
  body: JSON.stringify(input),
})))

server.registerTool('editor_compare_draft', {
  description: 'Return live TipTap state and persisted drafts.db data with HTML/JSON equality flags.',
  inputSchema: {
    ...editorTargetShape,
    key: z.string().min(1),
  },
}, async (input) => runTool(async () => {
  const [liveResponse, draftResponse] = await Promise.all([
    editorCommand('get_state', targetParams(input)),
    request(`/v1/drafts/get?key=${encodeURIComponent(input.key)}`),
  ])
  const commandData = liveResponse.data as JsonRecord | undefined
  const live = commandData?.after as JsonRecord | undefined
  const draft = draftResponse.data as JsonRecord | null | undefined
  return {
    live,
    persisted: draft ?? null,
    equal: {
      html: Boolean(live && draft && live.html === draft.content),
      json: Boolean(live && draft && structurallyEqualJson(live.json, draft.contentJson)),
    },
  }
}))

const transport = new StdioServerTransport()
await server.connect(transport)
