import type {
  EditorAiCompletedTaskMetadata,
} from '@mo-gallery/ai-agent'

import type {
  EditorAiConversationRecord,
  EditorAiMessageRecord,
  EditorAiStore,
  EditorAiTransactionClient,
} from '../editor-ai-repository'

export const COMPLETED_EDITOR_AI_TASK_METADATA = {
  taskId: 'task-1',
  capability: 'narrative',
  taskType: 'instruction',
  target: { documentId: 'document-1' },
  model: 'openai:gpt-5.6',
  visualMode: 'structure_only',
  summary: ['Updated the selected text'],
  warningCodes: [],
  operationSummary: [{ type: 'replace_text', targetIds: ['node-1'] }],
  baseRevision: 'revision-1',
  durationMs: 25,
  status: 'completed',
  changeSet: {
    taskId: 'task-1',
    targetLabel: 'Selected text',
    entries: [{
      operation: 'replace_text',
      targetId: 'node-1',
      targetLabel: 'Paragraph',
      category: 'content',
      before: 'Before',
      after: 'After',
    }],
    warnings: [],
    state: 'applied',
  },
  resultRevision: 'revision-2',
} satisfies EditorAiCompletedTaskMetadata

interface FakeEditorAiSeed {
  conversations?: EditorAiConversationRecord[]
  messages?: EditorAiMessageRecord[]
}

type ConversationWhere = Parameters<EditorAiStore['aiConversation']['findFirst']>[0]['where']
type MessageWhere = Parameters<EditorAiStore['aiMessage']['findFirst']>[0]['where']

function applyDefined<T extends object>(target: T, data: object): void {
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) Object.assign(target, { [key]: structuredClone(value) })
  }
}

export class FakeEditorAiStore implements EditorAiStore {
  readonly conversations = new Map<string, EditorAiConversationRecord>()
  readonly messages = new Map<string, EditorAiMessageRecord>()
  transactionCount = 0
  failConversationUpdate = false
  failConversationUpdateMany = false
  beforeMessageCreate?: () => void

  private conversationSequence = 0
  private messageSequence = 0

  constructor(seed: FakeEditorAiSeed = {}) {
    for (const conversation of seed.conversations ?? []) {
      this.conversations.set(conversation.id, structuredClone(conversation))
    }
    for (const message of seed.messages ?? []) {
      this.messages.set(message.id, structuredClone(message))
    }
  }

  private matchesConversation(
    conversation: EditorAiConversationRecord,
    where: ConversationWhere,
  ): boolean {
    return (where.id === undefined || conversation.id === where.id)
      && (where.userId === undefined || conversation.userId === where.userId)
      && (where.scopeId === undefined || conversation.scopeId === where.scopeId)
  }

  private matchesMessage(message: EditorAiMessageRecord, where: MessageWhere): boolean {
    const conversation = this.conversations.get(message.conversationId)
    return (where.id === undefined || message.id === where.id)
      && (where.conversationId === undefined || message.conversationId === where.conversationId)
      && (where.conversation === undefined || conversation?.userId === where.conversation.userId)
      && (where.role === undefined || where.role.in.includes(message.role))
      && (where.status === undefined || where.status.in.includes(message.status))
  }

  readonly aiConversation: EditorAiStore['aiConversation'] = {
    create: async ({ data }) => {
      const now = new Date()
      const conversation: EditorAiConversationRecord = {
        id: `conversation-${++this.conversationSequence}`,
        userId: data.userId,
        scopeId: data.scopeId,
        title: data.title ?? null,
        summary: null,
        lastModel: null,
        systemPrompt: data.systemPrompt ?? null,
        createdAt: now,
        updatedAt: now,
      }
      this.conversations.set(conversation.id, conversation)
      return structuredClone(conversation)
    },

    findFirst: async ({ where }) => {
      const conversation = [...this.conversations.values()]
        .find((candidate) => this.matchesConversation(candidate, where))
      return conversation ? structuredClone(conversation) : null
    },

    findMany: async ({ where }) => [...this.conversations.values()]
      .filter((conversation) => this.matchesConversation(conversation, where))
      .sort((left, right) => {
        const updatedDifference = right.updatedAt.getTime() - left.updatedAt.getTime()
        return updatedDifference === 0
          ? right.createdAt.getTime() - left.createdAt.getTime()
          : updatedDifference
      })
      .map((conversation) => structuredClone(conversation)),

    update: async ({ where, data }) => {
      if (this.failConversationUpdate) {
        throw new Error('injected conversation update failure')
      }
      const conversation = this.conversations.get(where.id)
      if (!conversation) throw new Error('conversation update target missing')
      applyDefined(conversation, data)
      return structuredClone(conversation)
    },

    updateMany: async ({ where, data }) => {
      if (this.failConversationUpdateMany) {
        throw new Error('injected conversation updateMany failure')
      }
      let count = 0
      for (const conversation of this.conversations.values()) {
        if (!this.matchesConversation(conversation, where)) continue
        applyDefined(conversation, data)
        count += 1
      }
      return { count }
    },

    deleteMany: async ({ where }) => {
      const ids = [...this.conversations.values()]
        .filter((conversation) => this.matchesConversation(conversation, where))
        .map(({ id }) => id)
      for (const id of ids) {
        this.conversations.delete(id)
        for (const [messageId, message] of this.messages) {
          if (message.conversationId === id) this.messages.delete(messageId)
        }
      }
      return { count: ids.length }
    },
  }

  readonly aiMessage: EditorAiStore['aiMessage'] = {
    create: async ({ data }) => {
      this.beforeMessageCreate?.()
      const message: EditorAiMessageRecord = {
        id: `message-${++this.messageSequence}`,
        conversationId: data.conversationId,
        role: data.role,
        content: data.content,
        status: data.status,
        model: data.model ?? null,
        action: data.action ?? null,
        metadata: data.metadata === undefined ? null : structuredClone(data.metadata),
        error: data.error ?? null,
        createdAt: new Date(),
      }
      this.messages.set(message.id, message)
      return structuredClone(message)
    },

    findFirst: async ({ where }) => {
      const message = [...this.messages.values()]
        .find((candidate) => this.matchesMessage(candidate, where))
      return message ? structuredClone(message) : null
    },

    findMany: async ({ where, orderBy, take }) => [...this.messages.values()]
      .filter((message) => this.matchesMessage(message, where))
      .sort((left, right) => orderBy.createdAt === 'asc'
        ? left.createdAt.getTime() - right.createdAt.getTime()
        : right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, take)
      .map((message) => structuredClone(message)),

    update: async ({ where, data }) => {
      const message = this.messages.get(where.id)
      if (!message) throw new Error('message update target missing')
      applyDefined(message, data)
      return structuredClone(message)
    },

    deleteMany: async ({ where }) => {
      const ids = [...this.messages.values()]
        .filter((message) => this.matchesMessage(message, where))
        .map(({ id }) => id)
      for (const id of ids) this.messages.delete(id)
      return { count: ids.length }
    },
  }

  async $transaction<T>(
    callback: (transaction: EditorAiTransactionClient) => Promise<T>,
    options: { isolationLevel: 'Serializable' },
  ): Promise<T> {
    void options
    this.transactionCount += 1
    const conversationSnapshot = structuredClone(this.conversations)
    const messageSnapshot = structuredClone(this.messages)
    try {
      return await callback(this)
    } catch (error) {
      this.conversations.clear()
      this.messages.clear()
      for (const [id, conversation] of conversationSnapshot) {
        this.conversations.set(id, conversation)
      }
      for (const [id, message] of messageSnapshot) this.messages.set(id, message)
      throw error
    }
  }
}
