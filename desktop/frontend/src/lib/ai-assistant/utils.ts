import { GetAiHttpPort } from '../../../wailsjs/go/main/App'
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

export function withGenerationDuration(metadata: EditorAiMessageDto['metadata'], durationMs: number): EditorAiMessageDto['metadata'] {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return { ...metadata, durationMs }
  }
  return { durationMs }
}

export function formatGenerationDuration(durationMs: number): string {
  return durationMs < 1000 ? `${Math.round(durationMs)} ms` : `${(durationMs / 1000).toFixed(1)} s`
}
