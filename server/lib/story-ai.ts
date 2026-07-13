import 'server-only'

// prompt 构建收敛到共享包 @mo-gallery/ai-agent（与 desktop 同一份实现），
// 本文件只保留 web 服务端的上游调用与 SSE 转发管道
import {
  buildEditorAiMessages,
  toOpenAiChatMessages,
  type EditorAiAction,
  type EditorAiChatMessage,
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

interface StoryAiConfig extends StoryAiModelCapabilityConfig {
  baseUrl: string
  apiKey: string
  model: string
  imageModels: string[]
  defaultImageModel?: string
}

export interface StoryAiModelCapabilityConfig {
  visionModels: ReadonlySet<string>
  toolModels: ReadonlySet<string>
  structuredOutputModels: ReadonlySet<string>
  contextWindows: ReadonlyMap<string, number>
}

export interface StoryAiModelCapabilities {
  vision: boolean
  tools: boolean
  structuredOutput: boolean
  contextWindow: number
}

export interface StoryAiModelCapabilityConfigInput {
  visionModels?: string
  toolModels?: string
  structuredOutputModels?: string
  contextWindows?: string
}

function parseModelIdList(value: string | undefined): Set<string> {
  return new Set(
    (value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )
}

export function parseStoryAiModelCapabilityConfig(
  input: StoryAiModelCapabilityConfigInput,
): StoryAiModelCapabilityConfig {
  const rawContextWindows = input.contextWindows === undefined ? '{}' : input.contextWindows
  let parsedContextWindows: unknown
  try {
    parsedContextWindows = JSON.parse(rawContextWindows)
  } catch {
    throw new Error('AI_MODEL_CONTEXT_WINDOWS must be a valid JSON object')
  }

  if (
    typeof parsedContextWindows !== 'object'
    || parsedContextWindows === null
    || Array.isArray(parsedContextWindows)
  ) {
    throw new Error('AI_MODEL_CONTEXT_WINDOWS must be a JSON object')
  }

  const contextWindows = new Map<string, number>()
  for (const [rawModelId, value] of Object.entries(parsedContextWindows)) {
    const modelId = rawModelId.trim()
    if (!modelId) {
      throw new Error('AI_MODEL_CONTEXT_WINDOWS model IDs must not be empty')
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      throw new Error('AI_MODEL_CONTEXT_WINDOWS values must be positive integers')
    }
    contextWindows.set(modelId, value)
  }

  return {
    visionModels: parseModelIdList(input.visionModels),
    toolModels: parseModelIdList(input.toolModels),
    structuredOutputModels: parseModelIdList(input.structuredOutputModels),
    contextWindows,
  }
}

export function resolveStoryAiModelCapabilities(
  modelId: string,
  config: StoryAiModelCapabilityConfig,
): StoryAiModelCapabilities {
  return {
    vision: config.visionModels.has(modelId),
    tools: config.toolModels.has(modelId),
    structuredOutput: config.structuredOutputModels.has(modelId),
    contextWindow: config.contextWindows.get(modelId) ?? 8192,
  }
}

export interface StoryAiModelOption {
  id: string
  label: string
  capabilities?: Array<'chat' | 'image'>
  vision: boolean
  tools: boolean
  structuredOutput: boolean
  contextWindow: number
}

export interface StoryAiImageInput {
  buffer: Buffer
  filename: string
  contentType: string
}

export interface StoryAiGeneratedImage {
  buffer: Buffer
  contentType: string
  model: string
  revisedPrompt?: string
}

function getStoryAiConfig(): StoryAiConfig {
  const baseUrl = process.env.AI_BASE_URL?.trim()
  const apiKey = process.env.AI_API_KEY?.trim()
  const model = process.env.AI_MODEL?.trim()
  const configuredImageModels = (process.env.AI_IMAGE_MODELS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const defaultImageModel = process.env.AI_IMAGE_MODEL?.trim() || configuredImageModels[0]
  const imageModels = Array.from(new Set([defaultImageModel, ...configuredImageModels].filter((item): item is string => Boolean(item))))
  const capabilityConfig = parseStoryAiModelCapabilityConfig({
    visionModels: process.env.AI_VISION_MODELS,
    toolModels: process.env.AI_TOOL_MODELS,
    structuredOutputModels: process.env.AI_STRUCTURED_OUTPUT_MODELS,
    contextWindows: process.env.AI_MODEL_CONTEXT_WINDOWS,
  })

  if (!baseUrl || !apiKey || !model) {
    throw new Error('AI service is not configured')
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    model,
    imageModels,
    defaultImageModel,
    ...capabilityConfig,
  }
}

/** 供 Hono 代理路由读取上游配置（编辑器 Agent 模式使用） */
export const getStoryAiEnvConfig = getStoryAiConfig


export async function generateStoryAiText(input: {
  messages: EditorAiChatMessage[]
  model?: string
  temperature?: number
}): Promise<string> {
  const config = getStoryAiConfig()
  const activeModel = input.model?.trim() || config.model
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: activeModel,
      stream: false,
      temperature: input.temperature ?? 0.2,
      messages: toOpenAiChatMessages(input.messages),
    }),
    signal: AbortSignal.timeout(120_000),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(errorText || 'AI provider request failed')
  }

  const payload = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string }>
      }
    }>
  }
  const content = payload.choices?.[0]?.message?.content
  const text = typeof content === 'string'
    ? content
    : content?.map((part) => part.text || '').join('')
  if (!text?.trim()) throw new Error('AI generation returned empty content')
  return text.trim()
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

function looksLikeImageModel(model: string): boolean {
  return /(?:^|[-_.])(gpt-image|dall-e|imagegen|image-generation)(?:$|[-_.])/i.test(model)
}

const MAX_GENERATED_IMAGE_BYTES = 30 * 1024 * 1024

function detectGeneratedImageContentType(buffer: Buffer): string | null {
  const detected = new Uint8Array(buffer.subarray(0, 16))
  if (detected[0] === 0x89 && detected[1] === 0x50 && detected[2] === 0x4e && detected[3] === 0x47) return 'image/png'
  if (detected[0] === 0xff && detected[1] === 0xd8 && detected[2] === 0xff) return 'image/jpeg'
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return null
}

async function parseGeneratedImageResponse(response: Response, model: string): Promise<StoryAiGeneratedImage> {
  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(errorText || `Image generation request failed (${response.status})`)
  }
  const payload = await response.json() as {
    data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>
  }
  const item = payload.data?.[0]
  if (!item) throw new Error('Image generation response is empty')

  if (item.b64_json) {
    const buffer = Buffer.from(item.b64_json, 'base64')
    if (buffer.length === 0 || buffer.length > MAX_GENERATED_IMAGE_BYTES) {
      throw new Error('Generated image is empty or exceeds 30MB')
    }
    const contentType = detectGeneratedImageContentType(buffer)
    if (!contentType) throw new Error('Generated image has an unsupported format')
    return { buffer, contentType, model, revisedPrompt: item.revised_prompt }
  }
  if (!item.url) throw new Error('Image generation response is missing image data')

  const imageResponse = await fetch(item.url, { signal: AbortSignal.timeout(180_000) })
  if (!imageResponse.ok) throw new Error(`Failed to download generated image (${imageResponse.status})`)
  const buffer = Buffer.from(await imageResponse.arrayBuffer())
  if (buffer.length === 0 || buffer.length > MAX_GENERATED_IMAGE_BYTES) {
    throw new Error('Generated image is empty or exceeds 30MB')
  }
  const contentType = detectGeneratedImageContentType(buffer)
  if (!contentType) throw new Error('Generated image has an unsupported format')
  return { buffer, contentType, model, revisedPrompt: item.revised_prompt }
}

export async function generateStoryAiImage(input: {
  prompt: string
  model?: string
  size?: string
  images?: StoryAiImageInput[]
}): Promise<StoryAiGeneratedImage> {
  const config = getStoryAiConfig()
  const model = input.model?.trim() || config.defaultImageModel
  if (!model) throw new Error('AI image model is not configured')
  const size = input.size?.trim() || '1024x1024'
  const images = input.images || []

  if (images.length === 0) {
    const response = await fetch(`${config.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ model, prompt: input.prompt, n: 1, size }),
      signal: AbortSignal.timeout(300_000),
    })
    return parseGeneratedImageResponse(response, model)
  }

  const formData = new FormData()
  formData.set('model', model)
  formData.set('prompt', input.prompt)
  formData.set('n', '1')
  formData.set('size', size)
  const imageField = images.length > 1 ? 'image[]' : 'image'
  for (const image of images) {
    formData.append(imageField, new Blob([new Uint8Array(image.buffer)], { type: image.contentType }), image.filename)
  }
  const response = await fetch(`${config.baseUrl}/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: formData,
    signal: AbortSignal.timeout(300_000),
  })
  return parseGeneratedImageResponse(response, model)
}

export async function fetchStoryAiModels(): Promise<{
  defaultModel: string
  defaultImageModel?: string
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
    .map((id) => {
      // This heuristic is legacy chat/image UI classification only. Direct-edit
      // capabilities are resolved exclusively from explicit model ID config.
      const supportsImage = config.imageModels.includes(id) || looksLikeImageModel(id)
      return {
        id,
        label: id,
        capabilities: [supportsImage ? 'image' : 'chat'] as Array<'chat' | 'image'>,
        ...resolveStoryAiModelCapabilities(id, config),
      }
    })

  const hasDefault = models.some((item) => item.id === config.model)
  const normalizedModels = hasDefault
    ? models
    : [{
      id: config.model,
      label: `${config.model} (default)`,
      capabilities: ['chat' as const],
      ...resolveStoryAiModelCapabilities(config.model, config),
    }, ...models]

  const knownModelIds = new Set(normalizedModels.map((item) => item.id))
  const allModels = [
    ...normalizedModels,
    ...config.imageModels
      .filter((id) => !knownModelIds.has(id))
      .map((id) => ({
        id,
        label: id,
        capabilities: ['image' as const],
        ...resolveStoryAiModelCapabilities(id, config),
      })),
  ]
  const defaultImageModel = config.defaultImageModel
    || allModels.find((item) => item.capabilities?.includes('image'))?.id

  return {
    defaultModel: config.model,
    defaultImageModel,
    models: allModels,
  }
}
