import type { FilePart, ModelMessage, TextPart } from 'ai'

import { normalizeEditorAiMultipart, type EditorAiChatMessage } from '../../types'

export interface VercelAiModelInput {
  instructions?: string
  messages: ModelMessage[]
}

function imageMediaType(url: string): string {
  const match = /^data:([^;,]+)[;,]/i.exec(url)
  return match?.[1] || 'image/jpeg'
}

function filePart(dataUrl: string, mediaType: string): FilePart {
  return {
    type: 'file',
    mediaType,
    data: new URL(dataUrl),
  }
}

function multipartMessage(
  role: 'user' | 'assistant',
  content: Array<TextPart | FilePart>,
): ModelMessage {
  if (role === 'assistant') return { role, content }
  return { role, content }
}

/** 项目消息协议到 AI SDK 消息的唯一适配边界。 */
export function toVercelAiModelInput(
  messages: EditorAiChatMessage[],
): VercelAiModelInput {
  const instructions = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.text.trim())
    .filter(Boolean)
    .join('\n\n')

  const modelMessages = messages.flatMap((message): ModelMessage[] => {
    if (message.role === 'system') return []

    const { content, images } = normalizeEditorAiMultipart(message)
    if (content.length === 0 && images.length === 0) {
      return [{ role: message.role, content: message.text }]
    }

    return [multipartMessage(message.role, [
        { type: 'text', text: message.text },
        ...content.map((part) => part.type === 'text'
          ? { type: 'text' as const, text: part.text }
          : filePart(part.dataUrl, part.mediaType)),
        ...images.map((url) => filePart(url, imageMediaType(url))),
      ])]
  })

  return {
    ...(instructions ? { instructions } : {}),
    messages: modelMessages,
  }
}
