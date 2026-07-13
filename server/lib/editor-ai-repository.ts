import {
  editorAiMessageMetadataSchema,
  editorAiTaskMessageMetadataSchema,
  readEditorAiTaskMessageMetadata,
  type AiChangeSetState,
  type EditorAiMessageMetadata,
} from '@mo-gallery/ai-agent'

export type EditorAiMessageRole = 'system' | 'user' | 'assistant'
export type EditorAiMessageStatus = 'pending' | 'streaming' | 'completed' | 'failed' | 'stopped'

export interface EditorAiConversationDto {
  id: string
  scopeId: string
  title?: string
  summary?: string
  lastModel?: string
  systemPrompt?: string
  createdAt: string
  updatedAt: string
}

export interface EditorAiConversationWithMessagesDto extends EditorAiConversationDto {
  messages: EditorAiMessageDto[]
}

export interface EditorAiMessageDto {
  id: string
  conversationId: string
  role: string
  content: string
  status: string
  model?: string
  action?: string
  metadata?: EditorAiMessageMetadata
  error?: string
  createdAt: string
}

export interface EditorAiHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface EditorAiMessageAppendInput {
  conversationId: string
  role: EditorAiMessageRole
  content: string
  status?: EditorAiMessageStatus
  model?: string
  action?: string
  metadata?: EditorAiMessageMetadata
  error?: string
}

export type EditorAiMessageFinishInput =
  | {
    status: 'completed'
    content: string
    model?: string
    metadata?: EditorAiMessageMetadata
  }
  | {
    status: 'failed' | 'stopped'
    content?: string
    model?: string
    metadata?: EditorAiMessageMetadata
    error: string
  }

export interface EditorAiConversationUpdateInput {
  title?: string
  lastModel?: string
  summary?: string
  systemPrompt?: string | null
}

export interface EditorAiRepository {
  createConversation(userId: string, input: {
    scopeId: string
    title?: string
    systemPrompt?: string
  }): Promise<EditorAiConversationDto>
  listConversations(userId: string, scopeId?: string): Promise<EditorAiConversationDto[]>
  getConversation(userId: string, conversationId: string): Promise<EditorAiConversationDto | null>
  getConversationWithMessages(
    userId: string,
    conversationId: string,
  ): Promise<EditorAiConversationWithMessagesDto | null>
  deleteConversation(userId: string, conversationId: string): Promise<void>
  clearConversation(userId: string, conversationId: string): Promise<EditorAiConversationDto>
  listMessages(userId: string, conversationId: string, limit?: number): Promise<EditorAiMessageDto[]>
  buildHistory(userId: string, conversationId: string, limit?: number): Promise<EditorAiHistoryMessage[]>
  hasMessage(userId: string, messageId: string): Promise<boolean>
  appendMessage(userId: string, input: EditorAiMessageAppendInput): Promise<EditorAiMessageDto>
  finishMessage(
    userId: string,
    messageId: string,
    input: EditorAiMessageFinishInput,
  ): Promise<EditorAiMessageDto>
  updateTaskState(
    userId: string,
    messageId: string,
    state: AiChangeSetState,
  ): Promise<EditorAiMessageDto>
  updateConversation(
    userId: string,
    conversationId: string,
    input: EditorAiConversationUpdateInput,
  ): Promise<EditorAiConversationDto>
}

export class EditorAiNotFoundError extends Error {
  constructor(public readonly resource: 'conversation' | 'message') {
    super(`${resource} not found`)
    this.name = 'EditorAiNotFoundError'
  }
}

export class EditorAiInvalidMetadataError extends Error {
  constructor(message = 'Invalid editor AI message metadata') {
    super(message)
    this.name = 'EditorAiInvalidMetadataError'
  }
}

export interface EditorAiConversationRecord {
  id: string
  userId: string | null
  scopeId: string
  title: string | null
  summary: string | null
  lastModel: string | null
  systemPrompt: string | null
  createdAt: Date
  updatedAt: Date
}

export interface EditorAiMessageRecord {
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
}

interface ConversationWhere {
  id?: string
  userId?: string
  scopeId?: string
}

interface MessageWhere {
  id?: string
  conversationId?: string
  conversation?: { userId: string }
  role?: { in: string[] }
  status?: { in: string[] }
}

interface ConversationCreateData {
  userId: string
  scopeId: string
  title?: string
  systemPrompt?: string
}

interface ConversationUpdateData {
  title?: string
  summary?: string | null
  lastModel?: string | null
  systemPrompt?: string | null
  updatedAt?: Date
}

interface MessageCreateData {
  conversationId: string
  role: string
  content: string
  status: string
  model?: string | null
  action?: string
  metadata?: EditorAiMessageMetadata
  error?: string | null
}

interface MessageUpdateData {
  content?: string
  status?: string
  model?: string | null
  metadata?: EditorAiMessageMetadata
  error?: string | null
}

interface EditorAiConversationDelegate {
  create(args: { data: ConversationCreateData }): Promise<EditorAiConversationRecord>
  findFirst(args: { where: ConversationWhere }): Promise<EditorAiConversationRecord | null>
  findMany(args: {
    where: ConversationWhere
    orderBy: Array<{ updatedAt: 'desc' } | { createdAt: 'desc' }>
  }): Promise<EditorAiConversationRecord[]>
  update(args: { where: { id: string }; data: ConversationUpdateData }): Promise<EditorAiConversationRecord>
  updateMany(args: { where: ConversationWhere; data: ConversationUpdateData }): Promise<{ count: number }>
  deleteMany(args: { where: ConversationWhere }): Promise<{ count: number }>
}

interface EditorAiMessageDelegate {
  create(args: { data: MessageCreateData }): Promise<EditorAiMessageRecord>
  findFirst(args: { where: MessageWhere }): Promise<EditorAiMessageRecord | null>
  findMany(args: {
    where: MessageWhere
    orderBy: { createdAt: 'asc' | 'desc' }
    take?: number
  }): Promise<EditorAiMessageRecord[]>
  update(args: { where: { id: string }; data: MessageUpdateData }): Promise<EditorAiMessageRecord>
  deleteMany(args: { where: MessageWhere }): Promise<{ count: number }>
}

export interface EditorAiTransactionClient {
  aiConversation: Pick<
    EditorAiConversationDelegate,
    'findFirst' | 'update' | 'updateMany'
  >
  aiMessage: Pick<EditorAiMessageDelegate, 'create' | 'findFirst' | 'update' | 'deleteMany'>
}

export interface EditorAiStore {
  aiConversation: EditorAiConversationDelegate
  aiMessage: EditorAiMessageDelegate
  $transaction<T>(
    callback: (transaction: EditorAiTransactionClient) => Promise<T>,
    options: { isolationLevel: 'Serializable' },
  ): Promise<T>
}

export function toEditorAiConversationDto(
  conversation: EditorAiConversationRecord,
): EditorAiConversationDto {
  return {
    id: conversation.id,
    scopeId: conversation.scopeId,
    title: conversation.title ?? undefined,
    summary: conversation.summary ?? undefined,
    lastModel: conversation.lastModel ?? undefined,
    systemPrompt: conversation.systemPrompt ?? undefined,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  }
}

export function toEditorAiMessageDto(message: EditorAiMessageRecord): EditorAiMessageDto {
  const metadata = message.metadata === null || message.metadata === undefined
    ? undefined
    : parseMetadata(message.metadata)
  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    status: message.status,
    model: message.model ?? undefined,
    action: message.action ?? undefined,
    metadata,
    error: message.error ?? undefined,
    createdAt: message.createdAt.toISOString(),
  }
}

function parseMetadata(metadata: unknown): EditorAiMessageMetadata {
  const parsed = editorAiMessageMetadataSchema.safeParse(metadata)
  if (!parsed.success) throw new EditorAiInvalidMetadataError()
  return parsed.data
}

function ownedConversationWhere(userId: string, conversationId: string): ConversationWhere {
  return { id: conversationId, userId }
}

function ownedMessageWhere(userId: string, messageId: string): MessageWhere {
  return { id: messageId, conversation: { userId } }
}

export function createEditorAiRepository(store: EditorAiStore): EditorAiRepository {
  return {
    async createConversation(userId, input) {
      const conversation = await store.aiConversation.create({
        data: {
          userId,
          scopeId: input.scopeId,
          title: input.title,
          systemPrompt: input.systemPrompt,
        },
      })
      return toEditorAiConversationDto(conversation)
    },

    async listConversations(userId, scopeId) {
      const conversations = await store.aiConversation.findMany({
        where: { userId, ...(scopeId === undefined ? {} : { scopeId }) },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      })
      return conversations.map(toEditorAiConversationDto)
    },

    async getConversation(userId, conversationId) {
      const conversation = await store.aiConversation.findFirst({
        where: ownedConversationWhere(userId, conversationId),
      })
      return conversation ? toEditorAiConversationDto(conversation) : null
    },

    async getConversationWithMessages(userId, conversationId) {
      const conversation = await store.aiConversation.findFirst({
        where: ownedConversationWhere(userId, conversationId),
      })
      if (!conversation) return null
      const messages = await store.aiMessage.findMany({
        where: { conversationId: conversation.id, conversation: { userId } },
        orderBy: { createdAt: 'asc' },
      })
      return {
        ...toEditorAiConversationDto(conversation),
        messages: messages.map(toEditorAiMessageDto),
      }
    },

    async deleteConversation(userId, conversationId) {
      const result = await store.aiConversation.deleteMany({
        where: ownedConversationWhere(userId, conversationId),
      })
      if (result.count !== 1) throw new EditorAiNotFoundError('conversation')
    },

    async clearConversation(userId, conversationId) {
      return store.$transaction(async (transaction) => {
        const owned = await transaction.aiConversation.findFirst({
          where: ownedConversationWhere(userId, conversationId),
        })
        if (!owned) throw new EditorAiNotFoundError('conversation')
        await transaction.aiMessage.deleteMany({
          where: { conversationId: owned.id, conversation: { userId } },
        })
        const result = await transaction.aiConversation.updateMany({
          where: ownedConversationWhere(userId, conversationId),
          data: { summary: null, lastModel: null },
        })
        if (result.count !== 1) throw new EditorAiNotFoundError('conversation')
        const conversation = await transaction.aiConversation.findFirst({
          where: ownedConversationWhere(userId, conversationId),
        })
        if (!conversation) throw new EditorAiNotFoundError('conversation')
        return toEditorAiConversationDto(conversation)
      }, { isolationLevel: 'Serializable' })
    },

    async listMessages(userId, conversationId, limit = 50) {
      const messages = await store.aiMessage.findMany({
        where: { conversationId, conversation: { userId } },
        orderBy: { createdAt: 'asc' },
        take: limit,
      })
      return messages.map(toEditorAiMessageDto)
    },

    async buildHistory(userId, conversationId, limit = 8) {
      const messages = await store.aiMessage.findMany({
        where: {
          conversationId,
          conversation: { userId },
          role: { in: ['user', 'assistant'] },
          status: { in: ['completed', 'streaming'] },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
      return messages.reverse().map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      }))
    },

    async hasMessage(userId, messageId) {
      const message = await store.aiMessage.findFirst({
        where: ownedMessageWhere(userId, messageId),
      })
      return message !== null
    },

    async appendMessage(userId, input) {
      const metadata = input.metadata === undefined ? undefined : parseMetadata(input.metadata)
      return store.$transaction(async (transaction) => {
        const conversation = await transaction.aiConversation.findFirst({
          where: ownedConversationWhere(userId, input.conversationId),
        })
        if (!conversation) throw new EditorAiNotFoundError('conversation')
        const message = await transaction.aiMessage.create({
          data: {
            conversationId: conversation.id,
            role: input.role,
            content: input.content,
            status: input.status ?? 'completed',
            model: input.model,
            action: input.action,
            metadata,
            error: input.error,
          },
        })
        return toEditorAiMessageDto(message)
      }, { isolationLevel: 'Serializable' })
    },

    async finishMessage(userId, messageId, input) {
      return store.$transaction(async (transaction) => {
        const message = await transaction.aiMessage.findFirst({
          where: ownedMessageWhere(userId, messageId),
        })
        if (!message) throw new EditorAiNotFoundError('message')
        const metadata = input.metadata === undefined ? undefined : parseMetadata(input.metadata)
        const updated = await transaction.aiMessage.update({
          where: { id: message.id },
          data: {
            status: input.status,
            content: input.content,
            model: input.model,
            metadata,
            error: input.status === 'completed' ? null : input.error,
          },
        })
        await transaction.aiConversation.update({
          where: { id: message.conversationId },
          data: {
            updatedAt: new Date(),
            ...(input.status === 'completed' && input.model
              ? { lastModel: input.model }
              : {}),
          },
        })
        return toEditorAiMessageDto(updated)
      }, { isolationLevel: 'Serializable' })
    },

    async updateTaskState(userId, messageId, state) {
      return store.$transaction(async (transaction) => {
        const message = await transaction.aiMessage.findFirst({
          where: ownedMessageWhere(userId, messageId),
        })
        if (!message) throw new EditorAiNotFoundError('message')
        const existing = readEditorAiTaskMessageMetadata(message.metadata)
        if (!existing || existing.task.status !== 'completed') {
          throw new EditorAiInvalidMetadataError(
            'Message has no completed editor AI task metadata',
          )
        }
        const parsed = editorAiTaskMessageMetadataSchema.safeParse({
          ...existing,
          task: {
            ...existing.task,
            changeSet: { ...existing.task.changeSet, state },
          },
        })
        if (!parsed.success) throw new EditorAiInvalidMetadataError()
        const updated = await transaction.aiMessage.update({
          where: { id: message.id },
          data: { metadata: parsed.data },
        })
        return toEditorAiMessageDto(updated)
      }, { isolationLevel: 'Serializable' })
    },

    async updateConversation(userId, conversationId, input) {
      const result = await store.aiConversation.updateMany({
        where: ownedConversationWhere(userId, conversationId),
        data: input,
      })
      if (result.count !== 1) throw new EditorAiNotFoundError('conversation')
      const conversation = await store.aiConversation.findFirst({
        where: ownedConversationWhere(userId, conversationId),
      })
      if (!conversation) throw new EditorAiNotFoundError('conversation')
      return toEditorAiConversationDto(conversation)
    },
  }
}
