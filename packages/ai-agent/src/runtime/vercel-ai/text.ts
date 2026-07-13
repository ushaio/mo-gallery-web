import { generateText, streamText } from 'ai'
import type { LanguageModel } from 'ai'

import type { EditorAiChatMessage, EditorAiEndpoint } from '../../types'
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
  /** Internal injection point for tests and custom runtimes. */
  languageModel?: LanguageModel
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
    })

    for await (const text of result.textStream) {
      options.onChunk(text)
    }

    return await result.text
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
