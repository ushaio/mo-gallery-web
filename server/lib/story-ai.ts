import 'server-only'

// prompt 构建收敛到共享包 @mo-gallery/ai-agent（与 desktop 同一份实现），
// 本文件只保留 web 服务端的上游调用与 SSE 转发管道
import {
  buildEditorAiMessages,
  toOpenAiChatMessages,
  type EditorAiAction,
  type OpenAiContentPart,
  type OpenAiImagePart,
  type OpenAiTextPart,
} from '@mo-gallery/ai-agent'

export type StoryAiAction = EditorAiAction

export type TextContentPart = OpenAiTextPart
export type ImageContentPart = OpenAiImagePart
export type ContentPart = OpenAiContentPart

export interface StoryAiGeneratePayload {
  action: StoryAiAction
  model?: string
  prompt?: string
  title?: string
  selectedText?: string
  currentParagraph?: string
  contextBefore?: string
  contextAfter?: string
  systemPrompt?: string
  images?: string[]
  historyMessages?: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
  onComplete?: (content: string, activeModel: string) => Promise<void> | void
  onError?: (message: string) => Promise<void> | void
}

interface StoryAiConfig {
  baseUrl: string
  apiKey: string
  model: string
}

export interface StoryAiModelOption {
  id: string
  label: string
}

function getStoryAiConfig(): StoryAiConfig {
  const baseUrl = process.env.AI_BASE_URL?.trim()
  const apiKey = process.env.AI_API_KEY?.trim()
  const model = process.env.AI_MODEL?.trim()

  if (!baseUrl || !apiKey || !model) {
    throw new Error('AI service is not configured')
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    model,
  }
}

export async function createEditorAiStream(payload: StoryAiGeneratePayload): Promise<ReadableStream<Uint8Array>> {
  const config = getStoryAiConfig()
  const activeModel = payload.model?.trim() || config.model

  const upstreamResponse = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: activeModel,
      stream: true,
      temperature: 0.7,
      messages: toOpenAiChatMessages(buildEditorAiMessages(payload)),
    }),
  })

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    const errorText = await upstreamResponse.text().catch(() => '')
    throw new Error(errorText || 'AI provider request failed')
  }

  const upstreamReader = upstreamResponse.body.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''
  let fullContent = ''

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (true) {
          const { done, value } = await upstreamReader.read()

          if (done) {
            await payload.onComplete?.(fullContent, activeModel)
            controller.enqueue(encoder.encode('event: done\ndata: [DONE]\n\n'))
            controller.close()
            return
          }

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) {
              continue
            }

            const data = trimmed.slice(5).trim()
            if (!data || data === '[DONE]') {
              continue
            }

            try {
              const json = JSON.parse(data) as {
                choices?: Array<{ delta?: { content?: string } }>
              }
              const content = json.choices?.[0]?.delta?.content
              if (!content) {
                continue
              }

              fullContent += content
              controller.enqueue(encoder.encode(`event: chunk\ndata: ${JSON.stringify(content)}\n\n`))
            } catch {
              continue
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'AI stream failed'
        await payload.onError?.(message)
        controller.enqueue(encoder.encode(`event: error\ndata: ${message}\n\n`))
        controller.close()
      }
    },
    cancel() {
      void upstreamReader.cancel()
    },
  })
}

export async function createStoryAiStream(payload: StoryAiGeneratePayload): Promise<ReadableStream<Uint8Array>> {
  return createEditorAiStream(payload)
}

export async function fetchStoryAiModels(): Promise<{
  defaultModel: string
  models: StoryAiModelOption[]
}> {
  const config = getStoryAiConfig()

  const response = await fetch(`${config.baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(errorText || 'Failed to fetch AI models')
  }

  const payload = await response.json() as {
    data?: Array<{ id?: string }>
  }

  const models = (payload.data || [])
    .map((item) => item.id?.trim())
    .filter((item): item is string => Boolean(item))
    .map((id) => ({
      id,
      label: id,
    }))

  const hasDefault = models.some((item) => item.id === config.model)
  const normalizedModels = hasDefault
    ? models
    : [{ id: config.model, label: `${config.model} (default)` }, ...models]

  return {
    defaultModel: config.model,
    models: normalizedModels,
  }
}
