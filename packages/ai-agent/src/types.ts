/**
 * 编辑器 AI 的共享类型。
 * 与 web `hono/editor-ai.ts` 的 GenerateEditorAiSchema、desktop Go 服务的
 * DTO 保持结构兼容（结构化类型，应用侧无需引用本包类型也能赋值）。
 */

export type EditorAiAction =
  | 'rewrite'
  | 'expand'
  | 'shorten'
  | 'continue'
  | 'summarize'
  | 'custom'

export interface EditorAiHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

/** 构建 prompt 所需的完整生成载荷（上下文字段一个不少） */
export interface EditorAiPromptPayload {
  action: EditorAiAction
  prompt?: string
  title?: string
  selectedText?: string
  currentParagraph?: string
  contextBefore?: string
  contextAfter?: string
  /** 会话级自定义系统提示词（覆盖默认） */
  systemPrompt?: string
  /** 图片 URL / data URL 列表（多模态） */
  images?: string[]
  historyMessages?: EditorAiHistoryMessage[]
}

/** 中立的消息表示：由适配层转换为 OpenAI wire 格式或 AI SDK ModelMessage */
export interface EditorAiChatMessage {
  role: 'system' | 'user' | 'assistant'
  text: string
  images?: string[]
}

/** OpenAI /chat/completions wire 格式（web 端手写 fetch 使用） */
export interface OpenAiTextPart {
  type: 'text'
  text: string
}

export interface OpenAiImagePart {
  type: 'image_url'
  image_url: { url: string; detail?: 'auto' | 'low' | 'high' }
}

export type OpenAiContentPart = OpenAiTextPart | OpenAiImagePart

export interface OpenAiChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | OpenAiContentPart[]
}

/** 模型端点：desktop 指向本地 Go 代理，web 服务端直连上游 */
export interface EditorAiEndpoint {
  /** OpenAI 兼容 API 根地址（含 /v1 之类的前缀，末尾不带斜杠） */
  baseURL: string
  apiKey?: string
  headers?: Record<string, string>
}

export interface PromptPolishPayload {
  text: string
  action?: EditorAiAction
  hasSelection?: boolean
  model?: string
}
