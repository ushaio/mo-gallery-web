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
  buildEditorAiMessages,
  buildPromptPolishMessages,
  generateEditorAiText,
  streamEditorAiText,
  type EditorAiAction,
  type EditorAiEndpoint,
  type EditorAiHistoryMessage,
} from '@mo-gallery/ai-agent'
import type { EditorAiApi } from '@mo-gallery/tiptap-editor'
import type {
  EditorAiConversationCreateInput,
  EditorAiConversationDto,
  EditorAiConversationWithMessagesDto,
  EditorAiGenerateInput,
  StoryAiModelsResponse,
} from './types'
import type { StoryAiStreamHandlers } from './story-ai'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const go = () => (window as any).go.main.App

async function getLocalEndpoint(): Promise<EditorAiEndpoint> {
  const port: number = await go().GetAiHttpPort()
  if (!port) throw new Error('本地 AI 服务未启动，请检查 AI 配置')
  return { baseURL: `http://127.0.0.1:${port}/v1` }
}

async function resolveModelId(selected?: string): Promise<string> {
  if (selected && selected.trim()) return selected.trim()
  const models: StoryAiModelsResponse = await go().GetStoryAiModels()
  if (!models?.defaultModel) throw new Error('未配置默认 AI 模型')
  return models.defaultModel
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getStoryAiModels(_token: string): Promise<StoryAiModelsResponse> {
  return await go().GetStoryAiModels()
}

async function getEditorAiConversations(_token: string, scopeId?: string): Promise<EditorAiConversationDto[]> {
  return (await go().GetEditorAiConversations(scopeId ?? '')) ?? []
}

async function createEditorAiConversation(
  _token: string,
  input: EditorAiConversationCreateInput,
): Promise<EditorAiConversationDto> {
  return await go().CreateEditorAiConversation(input)
}

async function getEditorAiConversation(
  _token: string,
  conversationId: string,
): Promise<EditorAiConversationWithMessagesDto> {
  const conversation = await go().GetEditorAiConversation(conversationId)
  return { ...conversation, messages: conversation?.messages ?? [] }
}

async function deleteEditorAiConversation(_token: string, conversationId: string): Promise<void> {
  await go().DeleteEditorAiConversation(conversationId)
}

async function clearEditorAiConversation(
  _token: string,
  conversationId: string,
): Promise<EditorAiConversationDto> {
  return await go().ClearEditorAiConversation(conversationId)
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
  const conversation = await go().GetEditorAiConversation(input.conversationId)
  const historyMessages: EditorAiHistoryMessage[] = (conversation?.messages ?? [])
    .filter((m: { role: string; status: string; content?: string }) =>
      (m.role === 'user' || m.role === 'assistant') && m.status === 'completed' && !!m.content?.trim())
    .slice(-8)
    .map((m: { role: 'user' | 'assistant'; content: string }) => ({ role: m.role, content: m.content }))

  // 持久化用户消息 + assistant 流式占位（内容选择与 web 端一致）
  await go().AppendEditorAiMessage({
    conversationId: input.conversationId,
    role: 'user',
    content: input.prompt?.trim() || input.selectedText?.trim() || input.currentParagraph?.trim() || action,
    status: 'completed',
    model,
    action,
  })
  const assistantMessage = await go().AppendEditorAiMessage({
    conversationId: input.conversationId,
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

  try {
    const fullContent = await streamEditorAiText({
      endpoint,
      model,
      messages,
      signal: handlers.signal,
      onChunk: handlers.onChunk,
    })
    await go().FinishEditorAiMessage({ messageId: assistantMessage.id, content: fullContent, model })
    handlers.onDone?.()
  } catch (error) {
    const message = error instanceof DOMException && error.name === 'AbortError'
      ? '生成已中断'
      : error instanceof Error ? error.message : 'AI 生成失败'
    await go().FinishEditorAiMessage({ messageId: assistantMessage.id, error: message, model }).catch(() => {})
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
  polishStoryAiPrompt,
  streamStoryAiGenerate,
}
