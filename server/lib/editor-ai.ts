import 'server-only'

import { db } from '~/server/lib/db'
export type EditorAiMessageRole = 'system' | 'user' | 'assistant'
export type EditorAiMessageStatus = 'pending' | 'streaming' | 'completed' | 'failed'

export interface EditorAiContextSnapshot {
  title?: string
  selectedText?: string
  currentParagraph?: string
  contextBefore?: string
  contextAfter?: string
}

export interface EditorAiConversationDto {
  id: string
  scopeId: string
  title?: string
  summary?: string
  lastModel?: string
  createdAt: string
  updatedAt: string
}

export interface EditorAiMessageDto {
  id: string
  conversationId: string
  role: string
  content: string
  status: string
  model?: string
  action?: string
  metadata?: unknown
  error?: string
  createdAt: string
}

function toConversationDto(conversation: {
  id: string
  scopeId: string
  title: string | null
  summary: string | null
  lastModel: string | null
  createdAt: Date
  updatedAt: Date
}): EditorAiConversationDto {
  return {
    id: conversation.id,
    scopeId: conversation.scopeId,
    title: conversation.title ?? undefined,
    summary: conversation.summary ?? undefined,
    lastModel: conversation.lastModel ?? undefined,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  }
}

function toMessageDto(message: {
  id: string
  conversationId: string
  role: string
  content: string
  status: string
  model: string | null
  action: string | null
  metadata: unknown
  error: string | null
  createdAt: Date
}): EditorAiMessageDto {
  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    status: message.status,
    model: message.model ?? undefined,
    action: message.action ?? undefined,
    metadata: message.metadata ?? undefined,
    error: message.error ?? undefined,
    createdAt: message.createdAt.toISOString(),
  }
}

export async function ensureEditorAiConversation(input: {
  scopeId: string
  title?: string
}) {
  const existing = await db.aiConversation.findUnique({
    where: {
      scopeId: input.scopeId,
    },
  })

  if (existing) {
    const updated = await db.aiConversation.update({
      where: { id: existing.id },
      data: {
        title: input.title ?? existing.title,
      },
    })
    return toConversationDto(updated)
  }

  const created = await db.aiConversation.create({
    data: {
      scopeId: input.scopeId,
      title: input.title,
    },
  })

  return toConversationDto(created)
}

export async function listEditorAiMessages(conversationId: string, limit = 50) {
  const messages = await db.aiMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })

  return messages.map(toMessageDto)
}

export async function createEditorAiMessage(input: {
  conversationId: string
  role: EditorAiMessageRole
  content: string
  status?: EditorAiMessageStatus
  model?: string
  action?: string
  metadata?: unknown
  error?: string
}) {
  const message = await db.aiMessage.create({
    data: {
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      status: input.status ?? 'completed',
      model: input.model,
      action: input.action,
      metadata: input.metadata as never,
      error: input.error,
    },
  })

  return toMessageDto(message)
}

export async function updateEditorAiMessage(
  messageId: string,
  data: {
    content?: string
    status?: EditorAiMessageStatus
    model?: string
    error?: string | null
    metadata?: unknown
  },
) {
  const message = await db.aiMessage.update({
    where: { id: messageId },
    data: {
      content: data.content,
      status: data.status,
      model: data.model,
      error: data.error,
      metadata: data.metadata as never,
    },
  })

  return toMessageDto(message)
}

export async function touchEditorAiConversation(
  conversationId: string,
  data: {
    title?: string
    lastModel?: string
    summary?: string
  },
) {
  const conversation = await db.aiConversation.update({
    where: { id: conversationId },
    data,
  })

  return toConversationDto(conversation)
}

export async function buildEditorAiHistoryMessages(conversationId: string, limit = 8) {
  const messages = await db.aiMessage.findMany({
    where: {
      conversationId,
      role: {
        in: ['user', 'assistant'],
      },
      status: {
        in: ['completed', 'streaming'],
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
  })

  return messages.reverse().map((message) => ({
    role: message.role as 'user' | 'assistant',
    content: message.content,
  }))
}
