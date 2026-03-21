import 'server-only'

export type StoryAiAction =
  | 'rewrite'
  | 'expand'
  | 'shorten'
  | 'continue'
  | 'summarize'
  | 'custom'

export interface StoryAiGeneratePayload {
  action: StoryAiAction
  model?: string
  prompt?: string
  title?: string
  selectedText?: string
  currentParagraph?: string
  contextBefore?: string
  contextAfter?: string
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

const ACTION_INSTRUCTIONS: Record<StoryAiAction, string> = {
  rewrite: '润色并优化表达，保留原意和叙事节奏。',
  expand: '在不偏离原意的前提下扩写内容，增强画面感和细节。',
  shorten: '压缩内容，让表达更凝练，但保留关键信息和情绪。',
  continue: '基于已有内容自然续写下一段，不重复前文。',
  summarize: '总结成一段适合作为故事摘要的文字。',
  custom: '严格按用户指令完成改写或生成。',
}

const SYSTEM_PROMPT = '你是一名中文叙事编辑助手，帮助用户编辑摄影故事。只输出最终可直接放进正文的内容，不要解释，不要加引号，不要用“修改如下”之类的前缀。'

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

function buildUserPrompt(payload: StoryAiGeneratePayload): string {
  const sections = [
    payload.title ? `标题：${payload.title}` : '',
    payload.selectedText ? `选中文本：\n${payload.selectedText}` : '',
    payload.currentParagraph ? `当前段落：\n${payload.currentParagraph}` : '',
    payload.contextBefore ? `前文参考：\n${payload.contextBefore}` : '',
    payload.contextAfter ? `后文参考：\n${payload.contextAfter}` : '',
    `任务：${ACTION_INSTRUCTIONS[payload.action]}`,
    payload.prompt ? `用户补充要求（必须尽量满足，作为生成约束和参考）：\n${payload.prompt}` : '',
    '输出要求：只输出最终正文内容，不解释你的修改过程，不添加标题或前缀。',
  ].filter(Boolean)

  return sections.join('\n\n')
}

function buildUpstreamMessages(payload: StoryAiGeneratePayload) {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: SYSTEM_PROMPT,
    },
  ]

  for (const history of payload.historyMessages || []) {
    if (!history.content.trim()) continue
    messages.push({
      role: history.role,
      content: history.content.trim(),
    })
  }

  messages.push({
    role: 'user',
    content: buildUserPrompt(payload),
  })

  return messages
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
      messages: buildUpstreamMessages(payload),
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
