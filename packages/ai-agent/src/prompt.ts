/**
 * 编辑器 AI prompt 构建 —— 全仓库唯一实现。
 *
 * 从 web `server/lib/story-ai.ts` / `server/lib/story-ai-prompt.ts` 迁移而来
 * （web 版本是上下文最完整的实现）。desktop Go 服务此前的平行实现缺失
 * currentParagraph / contextBefore / contextAfter，已由本模块取代。
 * 修改提示词只改这里，web 与 desktop 两端自动同步。
 */

import type {
  EditorAiAction,
  EditorAiChatMessage,
  EditorAiPromptPayload,
  OpenAiChatMessage,
  OpenAiContentPart,
  OpenAiImagePart,
  PromptPolishPayload,
} from './types'

export const EDITOR_AI_ACTION_INSTRUCTIONS: Record<EditorAiAction, string> = {
  rewrite: '润色并优化表达，保留原意和叙事节奏。',
  expand: '在不偏离原意的前提下扩写内容，增强画面感和细节。',
  shorten: '压缩内容，让表达更凝练，但保留关键信息和情绪。',
  continue: '基于已有内容自然续写下一段，不重复前文。',
  summarize: '总结成一段适合作为故事摘要的文字。',
  custom: '严格按用户指令完成改写或生成。',
}

export const EDITOR_AI_SYSTEM_PROMPT = '你是一名中文叙事编辑助手，帮助用户编辑摄影故事。只输出最终可直接放进正文的内容，不要解释，不要加引号，不要用”修改如下”之类的前缀。'

export const EDITOR_AI_CHAT_SYSTEM_PROMPT = '你是一名友善的AI写作助手，与用户协作进行摄影叙事创作。请用自然对话的方式回复，可以给建议、讨论想法、回答问题。不要假装成编辑工具——你是聊天伙伴，不是文本处理器。用中文回复。'

export function isConversationalMode(payload: EditorAiPromptPayload): boolean {
  return !payload.selectedText && !payload.currentParagraph
}

export function buildEditorAiUserPrompt(payload: EditorAiPromptPayload): string {
  if (isConversationalMode(payload)) {
    return payload.prompt || ''
  }

  const sections = [
    payload.title ? `标题：${payload.title}` : '',
    payload.selectedText ? `选中文本：\n${payload.selectedText}` : '',
    payload.currentParagraph ? `当前段落：\n${payload.currentParagraph}` : '',
    payload.contextBefore ? `前文参考：\n${payload.contextBefore}` : '',
    payload.contextAfter ? `后文参考：\n${payload.contextAfter}` : '',
    `任务：${EDITOR_AI_ACTION_INSTRUCTIONS[payload.action]}`,
    payload.prompt ? `用户补充要求（必须尽量满足，作为生成约束和参考）：\n${payload.prompt}` : '',
    '输出要求：只输出最终正文内容，不解释你的修改过程，不添加标题或前缀。',
  ].filter(Boolean)

  return sections.join('\n\n')
}

/** 构建完整消息序列（系统提示 + 历史 + 当前用户消息） */
export function buildEditorAiMessages(payload: EditorAiPromptPayload): EditorAiChatMessage[] {
  const systemPrompt = payload.systemPrompt
    || (isConversationalMode(payload) ? EDITOR_AI_CHAT_SYSTEM_PROMPT : EDITOR_AI_SYSTEM_PROMPT)

  const messages: EditorAiChatMessage[] = [
    { role: 'system', text: systemPrompt },
  ]

  for (const history of payload.historyMessages || []) {
    if (!history.content.trim()) continue
    messages.push({ role: history.role, text: history.content.trim() })
  }

  const images = payload.images?.filter(Boolean)
  messages.push({
    role: 'user',
    text: buildEditorAiUserPrompt(payload),
    ...(images && images.length > 0 ? { images } : {}),
  })

  return messages
}

/** 转为 OpenAI /chat/completions wire 格式（web 服务端手写 fetch 使用） */
export function toOpenAiChatMessages(messages: EditorAiChatMessage[]): OpenAiChatMessage[] {
  return messages.map((message) => {
    if (message.images && message.images.length > 0) {
      const parts: OpenAiContentPart[] = [
        { type: 'text', text: message.text },
        ...message.images.map((url): OpenAiImagePart => ({
          type: 'image_url',
          image_url: { url, detail: 'auto' },
        })),
      ]
      return { role: message.role, content: parts }
    }
    return { role: message.role, content: message.text }
  })
}

// ─── 提示词润色 ─────────────────────────────────────

export const PROMPT_POLISH_SYSTEM_PROMPT = '你是一名提示词润色助手，负责把用户写给 MO 助手的需求改写得更清晰、自然、具体、可执行。保留原意，不要擅自扩展超出用户目标的新要求。只输出润色后的需求文本，不要解释，不要加标题，不要加引号。'

export function buildPromptPolishUserMessage(payload: PromptPolishPayload): string {
  const parts = [
    payload.action ? `当前动作：${payload.action}` : '',
    payload.hasSelection === true ? '编辑上下文：当前有选区。' : '编辑上下文：当前以段落为主要上下文。',
    `待润色需求：\n${payload.text.trim()}`,
    '输出要求：保留用户原意，改成更清晰顺滑、适合直接发送给 MO 助手的单段需求文本。',
  ].filter(Boolean)

  return parts.join('\n\n')
}

export function buildPromptPolishMessages(payload: PromptPolishPayload): EditorAiChatMessage[] {
  return [
    { role: 'system', text: PROMPT_POLISH_SYSTEM_PROMPT },
    { role: 'user', text: buildPromptPolishUserMessage(payload) },
  ]
}
