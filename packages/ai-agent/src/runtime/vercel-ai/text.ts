import { dynamicTool, generateText, jsonSchema, stepCountIs, streamText } from 'ai'
import type { LanguageModel } from 'ai'

import type { EditorAiChatMessage, EditorAiEndpoint } from '../../types'
import type { EditorAiRuntimeTool, EditorAiStreamEvent } from '../../stream'
import { createAbortError, normalizeAiError } from './errors'
import { toVercelAiModelInput } from './messages'
import { createVercelAiLanguageModel } from './provider'

export interface StreamVercelAiTextOptions {
  endpoint: EditorAiEndpoint
  model: string
  messages: EditorAiChatMessage[]
  temperature: number
  signal?: AbortSignal
  onChunk: (text: string) => void
  onEvent?: (event: EditorAiStreamEvent) => void
  tools?: Record<string, EditorAiRuntimeTool>
  /** Internal injection point for tests and custom runtimes. */
  languageModel?: LanguageModel
}

function toVercelTools(tools?: Record<string, EditorAiRuntimeTool>) {
  if (!tools || Object.keys(tools).length === 0) return undefined
  return Object.fromEntries(Object.entries(tools).map(([name, definition]) => [name, dynamicTool({
    description: definition.description,
    inputSchema: jsonSchema(definition.inputSchema),
    execute: (input, options) => definition.execute(input, {
      signal: options.abortSignal,
      toolCallId: options.toolCallId,
    }),
  })]))
}

export async function streamVercelAiText(
  options: StreamVercelAiTextOptions,
): Promise<string> {
  try {
    const input = toVercelAiModelInput(options.messages)
    const result = streamText({
      model: options.languageModel
        ?? createVercelAiLanguageModel(options.endpoint, options.model),
      ...input,
      temperature: options.temperature,
      abortSignal: options.signal,
      tools: toVercelTools(options.tools),
      stopWhen: options.tools ? stepCountIs(6) : undefined,
    })

    let fullText = ''
    for await (const part of result.fullStream) {
      let event: EditorAiStreamEvent | null = null
      if (part.type === 'text-delta') {
        fullText += part.text
        options.onChunk(part.text)
        event = { type: 'text-delta', id: part.id, text: part.text }
      } else if (part.type === 'reasoning-delta') {
        event = { type: 'reasoning-delta', id: part.id, text: part.text }
      } else if (part.type === 'tool-input-start') {
        event = { type: 'tool-input-start', id: part.id, name: part.toolName }
      } else if (part.type === 'tool-input-delta') {
        event = { type: 'tool-input-delta', id: part.id, delta: part.delta }
      } else if (part.type === 'tool-call') {
        event = { type: 'tool-call', id: part.toolCallId, name: part.toolName, input: part.input }
      } else if (part.type === 'tool-result') {
        event = {
          type: 'tool-result', id: part.toolCallId, name: part.toolName,
          input: part.input, output: part.output,
        }
      } else if (part.type === 'tool-error') {
        event = {
          type: 'tool-error', id: part.toolCallId, name: part.toolName, input: part.input,
          error: part.error instanceof Error ? part.error.message : String(part.error),
        }
      }
      if (event) options.onEvent?.(event)
    }

    return fullText
  } catch (error) {
    if (options.signal?.aborted) throw createAbortError(options.signal.reason)
    throw normalizeAiError(error)
  }
}

export interface GenerateVercelAiTextOptions {
  endpoint: EditorAiEndpoint
  model: string
  messages: EditorAiChatMessage[]
  temperature: number
  signal?: AbortSignal
  /** Internal injection point for tests and custom runtimes. */
  languageModel?: LanguageModel
}

export async function generateVercelAiText(
  options: GenerateVercelAiTextOptions,
): Promise<string> {
  try {
    const input = toVercelAiModelInput(options.messages)
    const result = await generateText({
      model: options.languageModel
        ?? createVercelAiLanguageModel(options.endpoint, options.model),
      ...input,
      temperature: options.temperature,
      abortSignal: options.signal,
    })
    return result.text
  } catch (error) {
    if (options.signal?.aborted) throw createAbortError(options.signal.reason)
    throw normalizeAiError(error)
  }
}
