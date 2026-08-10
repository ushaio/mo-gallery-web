/**
 * 基于 Vercel AI SDK 的文本生成执行层。
 *
 * 同一份项目 API 在两种环境运行：
 * - desktop：Wails WebView 调用本地 Go OpenAI 兼容代理；
 * - web：服务端直连上游，或浏览器经 Hono 安全代理。
 */

import {
  generateVercelAiText,
  streamVercelAiText,
} from './runtime/vercel-ai/text'
import type { EditorAiChatMessage, EditorAiEndpoint } from './types'

export interface EditorAiRuntimeToolExecutionContext {
  signal?: AbortSignal
  toolCallId?: string
}

export interface EditorAiRuntimeTool {
  description?: string
  inputSchema: Record<string, unknown>
  execute: (input: unknown, context?: EditorAiRuntimeToolExecutionContext) => Promise<unknown>
}

export type EditorAiStreamEvent =
  | { type: 'text-delta'; id: string; text: string }
  | { type: 'reasoning-delta'; id: string; text: string }
  | { type: 'tool-input-start'; id: string; name: string }
  | { type: 'tool-input-delta'; id: string; delta: string }
  | { type: 'tool-call'; id: string; name: string; input: unknown }
  | { type: 'tool-result'; id: string; name: string; input: unknown; output: unknown }
  | { type: 'tool-error'; id: string; name: string; input: unknown; error: string }

export type EditorAiTraceBlock =
  | { type: 'text'; id: string; text: string }
  | { type: 'reasoning'; id: string; text: string }
  | {
    type: 'tool'
    id: string
    name: string
    status: 'preparing' | 'running' | 'completed' | 'failed'
    inputText?: string
    input?: unknown
    output?: unknown
    error?: string
  }

export interface EditorAiAssistantTraceMetadata {
  type: 'assistant_trace'
  blocks: EditorAiTraceBlock[]
}

function appendTraceTextBlock(
  blocks: EditorAiTraceBlock[],
  type: 'text' | 'reasoning',
  id: string,
  text: string,
): EditorAiTraceBlock[] {
  if (!text) return blocks
  const index = blocks.findIndex(block => block.type === type && block.id === id)
  if (index < 0) return [...blocks, { type, id, text }]
  const current = blocks[index]
  if (!current || current.type !== type) return blocks
  const next = blocks.slice()
  next[index] = { ...current, text: current.text + text }
  return next
}

function updateTraceToolBlock(
  blocks: EditorAiTraceBlock[],
  id: string,
  create: () => Extract<EditorAiTraceBlock, { type: 'tool' }>,
  update: (block: Extract<EditorAiTraceBlock, { type: 'tool' }>) => Extract<EditorAiTraceBlock, { type: 'tool' }>,
): EditorAiTraceBlock[] {
  const index = blocks.findIndex(block => block.type === 'tool' && block.id === id)
  if (index < 0) return [...blocks, create()]
  const current = blocks[index]
  if (!current || current.type !== 'tool') return blocks
  const next = blocks.slice()
  next[index] = update(current)
  return next
}

export function reduceEditorAiTrace(
  blocks: EditorAiTraceBlock[],
  event: EditorAiStreamEvent,
): EditorAiTraceBlock[] {
  if (event.type === 'text-delta' || event.type === 'reasoning-delta') {
    return appendTraceTextBlock(
      blocks,
      event.type === 'text-delta' ? 'text' : 'reasoning',
      event.id,
      event.text,
    )
  }
  if (event.type === 'tool-input-start') {
    return updateTraceToolBlock(
      blocks,
      event.id,
      () => ({ type: 'tool', id: event.id, name: event.name, status: 'preparing' }),
      block => ({ ...block, name: event.name }),
    )
  }
  if (event.type === 'tool-input-delta') {
    return updateTraceToolBlock(
      blocks,
      event.id,
      () => ({ type: 'tool', id: event.id, name: '', status: 'preparing', inputText: event.delta }),
      block => ({ ...block, inputText: (block.inputText ?? '') + event.delta }),
    )
  }
  if (event.type === 'tool-call') {
    return updateTraceToolBlock(
      blocks,
      event.id,
      () => ({ type: 'tool', id: event.id, name: event.name, status: 'running', input: event.input }),
      block => ({ ...block, name: event.name, status: 'running', input: event.input }),
    )
  }
  if (event.type === 'tool-result') {
    return updateTraceToolBlock(
      blocks,
      event.id,
      () => ({
        type: 'tool', id: event.id, name: event.name, status: 'completed',
        ...(event.input === undefined ? {} : { input: event.input }),
        ...(event.output === undefined ? {} : { output: event.output }),
      }),
      block => {
        const { error: _error, ...withoutError } = block
        return {
          ...withoutError, name: event.name, status: 'completed',
          ...(event.input === undefined ? {} : { input: event.input }),
          ...(event.output === undefined ? {} : { output: event.output }),
        }
      },
    )
  }
  return updateTraceToolBlock(
    blocks,
    event.id,
    () => ({
      type: 'tool', id: event.id, name: event.name, status: 'failed',
      input: event.input, error: event.error,
    }),
    block => ({
      ...block, name: event.name, status: 'failed', input: event.input, error: event.error,
    }),
  )
}

export function readEditorAiAssistantTrace(value: unknown): EditorAiTraceBlock[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const candidate = value as { type?: unknown; blocks?: unknown }
  if (candidate.type !== 'assistant_trace' || !Array.isArray(candidate.blocks)) return []
  return candidate.blocks.filter((block): block is EditorAiTraceBlock => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) return false
    const item = block as { type?: unknown; id?: unknown; text?: unknown; name?: unknown; status?: unknown }
    if (typeof item.id !== 'string') return false
    if (item.type === 'text' || item.type === 'reasoning') return typeof item.text === 'string'
    return item.type === 'tool'
      && typeof item.name === 'string'
      && (item.status === 'preparing' || item.status === 'running' || item.status === 'completed' || item.status === 'failed')
  })
}

export interface StreamEditorAiOptions {
  endpoint: EditorAiEndpoint
  model: string
  messages: EditorAiChatMessage[]
  temperature?: number
  signal?: AbortSignal
  onChunk: (text: string) => void
  onEvent?: (event: EditorAiStreamEvent) => void
  tools?: Record<string, EditorAiRuntimeTool>
}

/** 流式生成：逐段回调 onChunk，结束后返回完整文本。 */
export async function streamEditorAiText(
  options: StreamEditorAiOptions,
): Promise<string> {
  return streamVercelAiText({
    ...options,
    temperature: options.temperature ?? 0.7,
    tools: options.tools,
  })
}

export interface GenerateEditorAiOptions {
  endpoint: EditorAiEndpoint
  model: string
  messages: EditorAiChatMessage[]
  temperature?: number
  signal?: AbortSignal
}

/** 非流式生成（标题、提示词润色等短任务）。 */
export async function generateEditorAiText(
  options: GenerateEditorAiOptions,
): Promise<string> {
  const text = await generateVercelAiText({
    ...options,
    temperature: options.temperature ?? 0.4,
  })
  const trimmed = text.trim()
  if (!trimmed) throw new Error('AI generation returned empty content')
  return trimmed
}
