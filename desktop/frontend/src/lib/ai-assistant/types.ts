import type { EditorAiMessageDto } from '@/lib/api/types'

export type SendOverrides = {
  input?: string
  images?: string[]
}

export type AttachedImage = {
  id: string
  url: string
  status: 'loading' | 'ready'
}

export type ConversationRenameTarget = {
  id: string
  surface: 'sidebar' | 'header'
}

export type ConversationRuntimeCache = {
  messages: EditorAiMessageDto[]
  hasMoreMessages: boolean
  systemPrompt: string
}

export type MessageImageRef = {
  url: string
  photoId?: string
}
