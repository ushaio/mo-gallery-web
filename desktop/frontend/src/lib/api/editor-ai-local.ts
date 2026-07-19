/**
 * 编辑器 AI 的 desktop 本地实现。
 *
 * 取代此前"直连远程 web 服务器"的链路（原 story-ai.ts HTTP 版）：
 * - 编排/prompt：共享包 @mo-gallery/ai-agent（与 web 服务端同一份实现，
 *   上下文字段 currentParagraph / contextBefore / contextAfter 完整）
 * - 模型访问：本地 Go 代理 /v1/chat/completions（密钥在 Go 侧注入）
 * - 会话与消息持久化：Wails 绑定 → 本地数据库
 *
 * 断网 / 未登录远程服务器时编辑器 AI 依然完全可用。
 */

import {
  buildConversationTitleMessages,
  buildEditorAiMessages,
  buildPromptPolishMessages,
  generateEditorAiText,
  normalizeConversationTitle,
  streamEditorAiText,
  type AiChangeSetState,
  type EditorAiAction,
  type EditorAiEndpoint,
  type EditorAiHistoryMessage,
  type EditorAiMessageMetadata,
} from '@mo-gallery/ai-agent'
import type { EditorAiApi } from '@mo-gallery/tiptap-editor'
import type {
  EditorAiConversationCreateInput,
  EditorAiConversationDto,
  EditorAiConversationUpdateInput,
  EditorAiConversationWithMessagesDto,
  EditorAiGenerateInput,
  EditorAiMessageAppendInput,
  EditorAiMessageDto,
  EditorAiMessageFinishInput,
  EditorAiMessageRole,
  EditorAiMessageStatus,
  StoryAiModelsResponse,
} from './types'
import type { StoryAiStreamHandlers } from './story-ai'
import {
  encodeEditorAiMetadataTransport,
  filterPersistableEditorAiImageReferences,
} from './editor-ai-metadata'
import {
  AppendEditorAiMessage,
  ClearEditorAiConversation,
  CreateEditorAiConversation,
  DeleteEditorAiConversation,
  FinishEditorAiMessage,
  GetAiHttpPort,
  GetEditorAiConversation,
  GetEditorAiConversations,
  GetStoryAiModels,
  UpdateEditorAiConversation,
  UpdateEditorAiTaskState,
} from '../../../wailsjs/go/main/App'

interface EditorAiMessageWireDto {
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

function isEditorAiMessageRole(value: string): value is EditorAiMessageRole {
  return value === 'system' || value === 'user' || value === 'assistant'
}

function isEditorAiMessageStatus(value: string): value is EditorAiMessageStatus {
  return value === 'pending'
    || value === 'streaming'
    || value === 'completed'
    || value === 'failed'
    || value === 'stopped'
}

function isEditorAiMessageMetadata(value: unknown): value is EditorAiMessageMetadata {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isEditorAiMessageMetadata)
  if (typeof value !== 'object') return false

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  return Object.values(value as Record<string, unknown>).every(isEditorAiMessageMetadata)
}

export function mapEditorAiMessageDto(message: EditorAiMessageWireDto): EditorAiMessageDto {
  if (!isEditorAiMessageRole(message.role)) {
    throw new Error(`Invalid editor AI message role: ${message.role}`)
  }
  if (!isEditorAiMessageStatus(message.status)) {
    throw new Error(`Invalid editor AI message status: ${message.status}`)
  }
  if (message.metadata !== undefined && !isEditorAiMessageMetadata(message.metadata)) {
    throw new Error('Invalid editor AI message metadata')
  }

  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    status: message.status,
    model: message.model,
    action: message.action,
    metadata: message.metadata,
    error: message.error,
    createdAt: message.createdAt,
  }
}

function isModelCapability(value: string): value is 'chat' | 'image' {
  return value === 'chat' || value === 'image'
}

let storyAiModelsRequest: Promise<StoryAiModelsResponse> | null = null

export async function getLocalStoryAiModels(): Promise<StoryAiModelsResponse> {
  if (storyAiModelsRequest) return await storyAiModelsRequest

  const request = GetStoryAiModels().then((response) => ({
    defaultModel: response.defaultModel,
    defaultImageModel: response.defaultImageModel,
    models: response.models.map((model) => ({
      id: model.id,
      label: model.label,
      provider: model.provider,
      model: model.model,
      capabilities: model.capabilities?.filter(isModelCapability),
      vision: model.vision,
      tools: model.tools,
      structuredOutput: model.structuredOutput,
      contextWindow: model.contextWindow,
    })),
  }))
  storyAiModelsRequest = request

  try {
    return await request
  } finally {
    if (storyAiModelsRequest === request) storyAiModelsRequest = null
  }
}

/** 本地 Go 代理端点（编辑器 Agent 模式也经此访问模型） */
export async function getLocalEndpoint(): Promise<EditorAiEndpoint> {
  const port: number = await GetAiHttpPort()
  if (!port) throw new Error('本地 AI 服务未启动，请检查 AI 配置')
  return { baseURL: `http://127.0.0.1:${port}/v1` }
}

async function resolveModelId(selected?: string): Promise<string> {
  if (selected && selected.trim()) return selected.trim()
  const models = await getLocalStoryAiModels()
  if (!models?.defaultModel) throw new Error('未配置默认 AI 模型')
  return models.defaultModel
}

async function getStoryAiModels(): Promise<StoryAiModelsResponse> {
  return await getLocalStoryAiModels()
}

async function getEditorAiConversations(_token: string, scopeId?: string): Promise<EditorAiConversationDto[]> {
  return (await GetEditorAiConversations(scopeId ?? '')) ?? []
}

async function createEditorAiConversation(
  _token: string,
  input: EditorAiConversationCreateInput,
): Promise<EditorAiConversationDto> {
  return await CreateEditorAiConversation(input)
}

async function getEditorAiConversation(
  _token: string,
  conversationId: string,
): Promise<EditorAiConversationWithMessagesDto> {
  const conversation = await GetEditorAiConversation(conversationId)
  return {
    ...conversation,
    messages: (conversation?.messages ?? []).map(mapEditorAiMessageDto),
  }
}

export async function getLocalEditorAiConversation(
  conversationId: string,
): Promise<EditorAiConversationWithMessagesDto> {
  return await getEditorAiConversation('', conversationId)
}

export async function updateLocalEditorAiConversation(
  conversationId: string,
  input: EditorAiConversationUpdateInput,
): Promise<EditorAiConversationDto> {
  return await UpdateEditorAiConversation(conversationId, {
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(typeof input.systemPrompt === 'string' ? { systemPrompt: input.systemPrompt } : {}),
  })
}

async function deleteEditorAiConversation(_token: string, conversationId: string): Promise<void> {
  await DeleteEditorAiConversation(conversationId)
}

async function clearEditorAiConversation(
  _token: string,
  conversationId: string,
): Promise<EditorAiConversationDto> {
  return await ClearEditorAiConversation(conversationId)
}

export async function generateEditorAiConversationTitle(
  conversationId: string,
  selectedModel?: string,
): Promise<EditorAiConversationDto> {
  const conversation = await GetEditorAiConversation(conversationId)
  const historyMessages: EditorAiHistoryMessage[] = (conversation?.messages ?? [])
    .filter((message: { role: string; status: string; content?: string }) => (
      (message.role === 'user' || message.role === 'assistant')
      && message.status === 'completed'
      && Boolean(message.content?.trim())
    ))
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    }))

  if (historyMessages.length === 0) throw new Error('AI_CONVERSATION_EMPTY')

  const [endpoint, model] = await Promise.all([
    getLocalEndpoint(),
    resolveModelId(selectedModel),
  ])
  const generated = await generateEditorAiText({
    endpoint,
    model,
    temperature: 0.2,
    messages: buildConversationTitleMessages(historyMessages),
  })
  const title = normalizeConversationTitle(generated)
  if (!title) throw new Error('AI_TITLE_EMPTY')

  return await UpdateEditorAiConversation(conversationId, { title })
}

export async function appendLocalEditorAiMessage(
  conversationId: string,
  input: EditorAiMessageAppendInput,
): Promise<EditorAiMessageDto> {
  const { metadata, ...appendInput } = input
  return mapEditorAiMessageDto(await AppendEditorAiMessage({
    conversationId,
    ...appendInput,
    ...(metadata === undefined ? {} : { metadata: encodeEditorAiMetadataTransport(metadata) }),
  }))
}

export async function finishLocalEditorAiMessage(
  messageId: string,
  input: EditorAiMessageFinishInput,
): Promise<EditorAiMessageDto> {
  const { metadata, ...finishInput } = input
  return mapEditorAiMessageDto(await FinishEditorAiMessage({
    messageId,
    ...finishInput,
    ...(metadata === undefined ? {} : { metadata: encodeEditorAiMetadataTransport(metadata) }),
  }))
}

export async function updateLocalEditorAiTaskState(
  messageId: string,
  state: AiChangeSetState,
): Promise<EditorAiMessageDto> {
  return mapEditorAiMessageDto(await UpdateEditorAiTaskState({ messageId, state }))
}

async function polishStoryAiPrompt(
  _token: string,
  input: { text: string; action?: EditorAiAction; hasSelection?: boolean; model?: string },
): Promise<{ text: string }> {
  const [endpoint, model] = await Promise.all([getLocalEndpoint(), resolveModelId(input.model)])
  const text = await generateEditorAiText({
    endpoint,
    model,
    messages: buildPromptPolishMessages(input),
  })
  return { text }
}

async function streamStoryAiGenerate(
  _token: string,
  input: EditorAiGenerateInput,
  handlers: StoryAiStreamHandlers,
): Promise<void> {
  const action: EditorAiAction = input.action ?? 'custom'
  const [endpoint, model] = await Promise.all([getLocalEndpoint(), resolveModelId(input.model)])

  // 历史消息与会话级系统提示（与 web hono 路由行为一致：取最近 8 条已完成消息）
  const conversation = await GetEditorAiConversation(input.conversationId)
  const historyMessages: EditorAiHistoryMessage[] = (conversation?.messages ?? [])
    .filter((m: { role: string; status: string; content?: string }) =>
      (m.role === 'user' || m.role === 'assistant') && m.status === 'completed' && !!m.content?.trim())
    .slice(-8)
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))

  // 持久化用户消息 + assistant 流式占位（内容选择与 web 端一致）
  const persistedImages = filterPersistableEditorAiImageReferences(input.images ?? [])
  await appendLocalEditorAiMessage(input.conversationId, {
    role: 'user',
    content: input.prompt?.trim() || input.selectedText?.trim() || input.currentParagraph?.trim() || action,
    status: 'completed',
    model,
    action,
    ...(persistedImages.length ? { metadata: { images: persistedImages } } : {}),
  })
  const assistantMessage = await appendLocalEditorAiMessage(input.conversationId, {
    role: 'assistant',
    content: '',
    status: 'streaming',
    model,
    action,
  })

  const messages = buildEditorAiMessages({
    action,
    prompt: input.prompt,
    title: input.title,
    selectedText: input.selectedText,
    currentParagraph: input.currentParagraph,
    contextBefore: input.contextBefore,
    contextAfter: input.contextAfter,
    systemPrompt: conversation?.systemPrompt || undefined,
    images: input.images,
    historyMessages,
  })

  let partialContent = ''
  try {
    const fullContent = await streamEditorAiText({
      endpoint,
      model,
      messages,
      signal: handlers.signal,
      onChunk: (chunk) => {
        partialContent += chunk
        handlers.onChunk(chunk)
      },
    })
    await FinishEditorAiMessage({
      messageId: assistantMessage.id,
      status: 'completed',
      content: fullContent,
      model,
    })
    handlers.onDone?.()
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? '生成已中断'
      : error instanceof Error ? error.message : 'AI 生成失败'
    await FinishEditorAiMessage({
      messageId: assistantMessage.id,
      status: error instanceof Error && error.name === 'AbortError' ? 'stopped' : 'failed',
      content: partialContent,
      error: message,
      model,
    }).catch(() => {})
    throw error
  }
}

/** 注入给共享编辑器的本地 AI 接口实现 */
export const editorAiLocal: EditorAiApi = {
  getStoryAiModels,
  getEditorAiConversations,
  createEditorAiConversation,
  getEditorAiConversation,
  deleteEditorAiConversation,
  clearEditorAiConversation,
  appendEditorAiMessage: async (_token, conversationId, input) => (
    await appendLocalEditorAiMessage(conversationId, input)
  ),
  finishEditorAiMessage: async (_token, messageId, input) => (
    await finishLocalEditorAiMessage(messageId, input)
  ),
  updateEditorAiTaskState: async (_token, messageId, state) => (
    await updateLocalEditorAiTaskState(messageId, state)
  ),
  polishStoryAiPrompt,
  streamStoryAiGenerate,
}
