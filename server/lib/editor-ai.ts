import 'server-only'

import { Prisma } from '@/generated/prisma/client'

import { db } from '~/server/lib/db'

import {
  createEditorAiRepository,
  type EditorAiStore,
} from './editor-ai-repository'

export {
  EditorAiInvalidMetadataError,
  EditorAiNotFoundError,
  type EditorAiConversationDto,
  type EditorAiConversationUpdateInput,
  type EditorAiConversationWithMessagesDto,
  type EditorAiHistoryMessage,
  type EditorAiMessageAppendInput,
  type EditorAiMessageDto,
  type EditorAiMessageFinishInput,
  type EditorAiMessageRole,
  type EditorAiMessageStatus,
  type EditorAiRepository,
} from './editor-ai-repository'

export interface EditorAiContextSnapshot {
  title?: string
  selectedText?: string
  currentParagraph?: string
  contextBefore?: string
  contextAfter?: string
}

type PrismaEditorAiClient = Pick<typeof db, 'aiConversation' | 'aiMessage'>
type EditorAiClient = Pick<EditorAiStore, 'aiConversation' | 'aiMessage'>

function createPrismaEditorAiClient(client: PrismaEditorAiClient): EditorAiClient {
  return {
    aiConversation: {
      create: ({ data }) => client.aiConversation.create({ data }),
      findFirst: ({ where }) => client.aiConversation.findFirst({ where }),
      findMany: ({ where, orderBy }) => client.aiConversation.findMany({ where, orderBy }),
      update: ({ where, data }) => client.aiConversation.update({ where, data }),
      updateMany: ({ where, data }) => client.aiConversation.updateMany({ where, data }),
      deleteMany: ({ where }) => client.aiConversation.deleteMany({ where }),
    },
    aiMessage: {
      create: ({ data }) => client.aiMessage.create({
        data: {
          ...data,
          metadata: data.metadata === null ? Prisma.JsonNull : data.metadata,
        },
      }),
      findFirst: ({ where }) => client.aiMessage.findFirst({ where }),
      findMany: ({ where, orderBy, take }) => client.aiMessage.findMany({
        where,
        orderBy,
        take,
      }),
      update: ({ where, data }) => client.aiMessage.update({
        where,
        data: {
          ...data,
          metadata: data.metadata === null ? Prisma.JsonNull : data.metadata,
        },
      }),
      deleteMany: ({ where }) => client.aiMessage.deleteMany({ where }),
    },
  }
}

const editorAiStore: EditorAiStore = {
  ...createPrismaEditorAiClient(db),
  $transaction(callback, options) {
    return db.$transaction(
      (transaction) => callback(createPrismaEditorAiClient(transaction)),
      options,
    )
  },
}

const repository = createEditorAiRepository(editorAiStore)

export const ensureEditorAiConversation = repository.createConversation
export const listEditorAiConversations = repository.listConversations
export const getEditorAiConversation = repository.getConversation
export const getEditorAiConversationWithMessages = repository.getConversationWithMessages
export const deleteEditorAiConversation = repository.deleteConversation
export const clearEditorAiConversationMessages = repository.clearConversation
export const listEditorAiMessages = repository.listMessages
export const buildEditorAiHistoryMessages = repository.buildHistory
export const hasEditorAiMessage = repository.hasMessage
export const createEditorAiMessage = repository.appendMessage
export const finishEditorAiMessage = repository.finishMessage
export const updateEditorAiTaskState = repository.updateTaskState
export const touchEditorAiConversation = repository.updateConversation
export const updateEditorAiConversation = repository.updateConversation
