import { GetAiHttpPort } from '../../../wailsjs/go/main/App'
import type { EditorAiUsage } from '@mo-gallery/ai-agent'
import type { EditorAiMessageDto, StoryAiModelOption } from '@/lib/api/types'

// Local AI HTTP service port
let aiHttpPort = 0

export async function ensureAiPort() {
  if (!aiHttpPort) {
    aiHttpPort = await GetAiHttpPort()
  }
  return aiHttpPort
}

export function createLocalMessageId(role: 'user' | 'assistant'): string {
  return `local-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function deriveConversationTitle(prompt: string): string {
  return prompt.replace(/\s+/g, ' ').trim().slice(0, 40)
}

export function supportsChat(model: StoryAiModelOption): boolean {
  return !model.capabilities || model.capabilities.includes('chat')
}

export function supportsImageGeneration(model: StoryAiModelOption): boolean {
  return model.capabilities?.includes('image') === true
}

export function selectAvailableModel(models: StoryAiModelOption[], preferred: string | undefined): string {
  return models.some(model => model.id === preferred) ? preferred ?? '' : models[0]?.id ?? ''
}

export function formatConversationDate(dateStr: string): string {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function getGenerationDurationMs(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const durationMs = (metadata as { durationMs?: unknown }).durationMs
  return typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : null
}

function readTokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : undefined
}

export function getGenerationUsage(metadata: unknown): EditorAiUsage | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const rawUsage = (metadata as { usage?: unknown }).usage
  if (!rawUsage || typeof rawUsage !== 'object' || Array.isArray(rawUsage)) return null
  const usage = rawUsage as Record<string, unknown>
  const parsed: EditorAiUsage = {
    inputTokens: readTokenCount(usage.inputTokens),
    outputTokens: readTokenCount(usage.outputTokens),
    reasoningTokens: readTokenCount(usage.reasoningTokens),
    cacheReadTokens: readTokenCount(usage.cacheReadTokens),
  }
  return Object.values(parsed).some(value => value !== undefined) ? parsed : null
}

export function withGenerationDuration(metadata: EditorAiMessageDto['metadata'], durationMs: number): EditorAiMessageDto['metadata'] {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return { ...metadata, durationMs }
  }
  return { durationMs }
}

export function formatGenerationDuration(durationMs: number): string {
  return durationMs < 1000 ? `${Math.round(durationMs)} ms` : `${(durationMs / 1000).toFixed(1)} s`
}

export function formatTokenCount(tokens: number): string {
  return new Intl.NumberFormat().format(tokens)
}
