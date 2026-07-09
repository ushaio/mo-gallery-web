import 'server-only'

// 润色提示词收敛到共享包 @mo-gallery/ai-agent（与 desktop 同一份实现）
import { buildPromptPolishMessages, toOpenAiChatMessages } from '@mo-gallery/ai-agent'
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
      messages: toOpenAiChatMessages(buildPromptPolishMessages(payload)),
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
