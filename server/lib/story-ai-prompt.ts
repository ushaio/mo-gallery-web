import 'server-only'

import type { StoryAiAction } from './story-ai'

interface StoryAiPromptPolishPayload {
  text: string
  action?: StoryAiAction
  hasSelection?: boolean
  model?: string
}

interface StoryAiConfig {
  baseUrl: string
  apiKey: string
  model: string
}

const PROMPT_POLISH_SYSTEM_PROMPT = '你是一名提示词润色助手，负责把用户写给 MO 助手的需求改写得更清晰、自然、具体、可执行。保留原意，不要擅自扩展超出用户目标的新要求。只输出润色后的需求文本，不要解释，不要加标题，不要加引号。'

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

function buildPromptPolishUserMessage(payload: StoryAiPromptPolishPayload) {
  const parts = [
    payload.action ? `当前动作：${payload.action}` : '',
    payload.hasSelection === true ? '编辑上下文：当前有选区。' : '编辑上下文：当前以段落为主要上下文。',
    `待润色需求：\n${payload.text.trim()}`,
    '输出要求：保留用户原意，改成更清晰顺滑、适合直接发送给 MO 助手的单段需求文本。',
  ].filter(Boolean)

  return parts.join('\n\n')
}

export async function polishStoryAiPrompt(payload: StoryAiPromptPolishPayload): Promise<string> {
  const config = getStoryAiConfig()
  const activeModel = payload.model?.trim() || config.model

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: activeModel,
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content: PROMPT_POLISH_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: buildPromptPolishUserMessage(payload),
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(errorText || 'AI provider request failed')
  }

  const data = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string
      }
    }>
  }

  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) {
    throw new Error('AI prompt polish failed')
  }

  return content
}
