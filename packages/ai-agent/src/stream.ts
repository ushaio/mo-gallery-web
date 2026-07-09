/**
 * 基于 Vercel AI SDK 的生成执行层。
 *
 * 同一份代码在两种环境运行：
 * - desktop：跑在 Wails webview 里，endpoint 指向本地 Go 代理
 *   （http://127.0.0.1:{port}/v1，密钥由 Go 侧注入，前端不接触）
 * - web：跑在 Next 服务端，endpoint 直连上游 OpenAI 兼容 API
 *
 * 后续编辑器 agent 工具循环（读文档/改段落等 tool calling）在此模块上扩展。
 */

import { streamText, generateText, type ModelMessage } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { EditorAiChatMessage, EditorAiEndpoint } from './types'

function toModelMessages(messages: EditorAiChatMessage[]): ModelMessage[] {
  return messages.map((message): ModelMessage => {
    if (message.role === 'user' && message.images && message.images.length > 0) {
      return {
        role: 'user',
        content: [
          { type: 'text', text: message.text },
          ...message.images.map((url) => ({ type: 'image' as const, image: url })),
        ],
      }
    }
    if (message.role === 'system') return { role: 'system', content: message.text }
    if (message.role === 'assistant') return { role: 'assistant', content: message.text }
    return { role: 'user', content: message.text }
  })
}

function createModel(endpoint: EditorAiEndpoint, modelId: string) {
  const provider = createOpenAICompatible({
    name: 'mo-gallery',
    baseURL: endpoint.baseURL.replace(/\/+$/, ''),
    apiKey: endpoint.apiKey,
    headers: endpoint.headers,
  })
  return provider.chatModel(modelId)
}

export interface StreamEditorAiOptions {
  endpoint: EditorAiEndpoint
  model: string
  messages: EditorAiChatMessage[]
  temperature?: number
  signal?: AbortSignal
  onChunk: (text: string) => void
}

/** 流式生成：逐段回调 onChunk，结束后返回完整文本 */
export async function streamEditorAiText(options: StreamEditorAiOptions): Promise<string> {
  const result = streamText({
    model: createModel(options.endpoint, options.model),
    messages: toModelMessages(options.messages),
    temperature: options.temperature ?? 0.7,
    abortSignal: options.signal,
  })

  for await (const delta of result.textStream) {
    if (delta) options.onChunk(delta)
  }

  return await result.text
}

export interface GenerateEditorAiOptions {
  endpoint: EditorAiEndpoint
  model: string
  messages: EditorAiChatMessage[]
  temperature?: number
  signal?: AbortSignal
}

/** 非流式生成（提示词润色等短任务） */
export async function generateEditorAiText(options: GenerateEditorAiOptions): Promise<string> {
  const { text } = await generateText({
    model: createModel(options.endpoint, options.model),
    messages: toModelMessages(options.messages),
    temperature: options.temperature ?? 0.4,
    abortSignal: options.signal,
  })

  const trimmed = text.trim()
  if (!trimmed) throw new Error('AI generation returned empty content')
  return trimmed
}
