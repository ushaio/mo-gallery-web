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

export interface StreamEditorAiOptions {
  endpoint: EditorAiEndpoint
  model: string
  messages: EditorAiChatMessage[]
  temperature?: number
  signal?: AbortSignal
  onChunk: (text: string) => void
}

/** 流式生成：逐段回调 onChunk，结束后返回完整文本。 */
export async function streamEditorAiText(
  options: StreamEditorAiOptions,
): Promise<string> {
  return streamVercelAiText({
    ...options,
    temperature: options.temperature ?? 0.7,
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
