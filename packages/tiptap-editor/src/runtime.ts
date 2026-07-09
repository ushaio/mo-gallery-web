/**
 * 编辑器运行时注入接口。
 *
 * 共享包不直接依赖任何应用侧模块（API client、i18n、主题上下文）；
 * web 与 desktop 各自在薄包装层（src/components/NarrativeTipTapEditor.tsx）
 * 里构造 NarrativeEditorRuntime 传入。类型按结构兼容设计：应用侧的
 * StoryDto / EditorAi*Dto 只要字段兼容即可直接赋值，无需引用本文件类型。
 */

// ── 故事链接卡片所需的最小故事结构 ─────────────────────

export interface EditorStoryPhoto {
  id: string
  url: string
  thumbnailUrl?: string
}

export interface EditorStory {
  id: string
  title: string
  content: string
  coverPhotoId?: string
  isPublished: boolean
  storyDate: string
  createdAt: string
  photos: EditorStoryPhoto[]
}

// ── AI 助手所需的数据结构（与应用侧 lib/api/types.ts 保持结构一致） ──

export type StoryAiAction =
  | 'rewrite'
  | 'expand'
  | 'shorten'
  | 'continue'
  | 'summarize'
  | 'custom'

export interface StoryAiGenerateInput {
  action?: StoryAiAction
  model?: string
  prompt?: string
  title?: string
  selectedText?: string
  currentParagraph?: string
  contextBefore?: string
  contextAfter?: string
  images?: string[]
}

export type EditorAiGenerateInput = StoryAiGenerateInput & {
  conversationId: string
}

export interface StoryAiModelOption {
  id: string
  label: string
}

export interface StoryAiModelsResponse {
  defaultModel: string
  models: StoryAiModelOption[]
}

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
  metadata?: unknown
  error?: string
  createdAt: string
}

export interface EditorAiConversationCreateInput {
  scopeId: string
  title?: string
  systemPrompt?: string
}

export interface StoryAiStreamHandlers {
  onChunk: (chunk: string) => void
  onDone?: () => void
  signal?: AbortSignal
}

// ── 注入接口 ─────────────────────────────────────────

/** Agent 模式的模型端点（desktop：本地 Go 代理；web：Hono 代理路由） */
export interface EditorAgentEndpoint {
  baseURL: string
  apiKey?: string
  headers?: Record<string, string>
}

/** TipTap AI 助手需要的后端接口（签名与应用侧 lib/api/story-ai.ts 一致） */
export interface EditorAiApi {
  getStoryAiModels(token: string): Promise<StoryAiModelsResponse>
  getEditorAiConversations(token: string, scopeId?: string): Promise<EditorAiConversationDto[]>
  createEditorAiConversation(token: string, input: EditorAiConversationCreateInput): Promise<EditorAiConversationDto>
  getEditorAiConversation(token: string, conversationId: string): Promise<EditorAiConversationWithMessagesDto>
  deleteEditorAiConversation(token: string, conversationId: string): Promise<void>
  clearEditorAiConversation(token: string, conversationId: string): Promise<EditorAiConversationDto>
  polishStoryAiPrompt(
    token: string,
    input: { text: string; action?: StoryAiAction; hasSelection?: boolean; model?: string },
  ): Promise<{ text: string }>
  streamStoryAiGenerate(token: string, input: EditorAiGenerateInput, handlers: StoryAiStreamHandlers): Promise<void>
}

/** 编辑器对宿主应用的全部依赖 */
export interface NarrativeEditorRuntime {
  /** i18n 翻译函数 */
  t: (key: string) => string
  /** 当前解析后的主题（决定 tiptap-dark / tiptap-light 类名） */
  resolvedTheme?: 'light' | 'dark'
  /** 粘贴故事链接时拉取故事详情，用于渲染链接卡片 */
  getAdminStory: (token: string, storyId: string) => Promise<EditorStory>
  /** AI 助手后端接口 */
  ai: EditorAiApi
  /**
   * Agent 模式（/agent 指令）使用的 OpenAI 兼容端点；不提供则不启用
   * Agent。desktop 返回本地 Go 代理，web 返回带鉴权头的 Hono 代理路由。
   */
  getAgentEndpoint?: (token: string) => Promise<EditorAgentEndpoint>
}
