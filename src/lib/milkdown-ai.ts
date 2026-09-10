import { EDITOR_AI_SYSTEM_PROMPT } from '@mo-gallery/ai-agent'
import type { MilkdownAiProvider } from '@mo-gallery/milkdown'
import { createEditorAiConversation, streamStoryAiGenerate } from '@/lib/api/story-ai'

/** Adapt the existing authenticated API stream to Milkdown's inline AI. */
export function createMilkdownAiProvider(token: string, documentId: string, title?: string): MilkdownAiProvider {
  let conversationId: string | undefined

  return async function* (context, signal) {
    signal.throwIfAborted()
    if (!conversationId) {
      const conversation = await createEditorAiConversation(token, {
        scopeId: documentId,
        title,
        systemPrompt: EDITOR_AI_SYSTEM_PROMPT,
      })
      conversationId = conversation.id
    }
    signal.throwIfAborted()

    const controller = new AbortController()
    const abort = () => controller.abort(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    const chunks: string[] = []
    let complete = false
    let failure: unknown
    let wake: (() => void) | undefined
    const stream = streamStoryAiGenerate(token, {
      conversationId,
      action: 'custom',
      title,
      prompt: context.instruction,
      selectedText: context.selection || undefined,
      currentParagraph: context.selection ? undefined : context.document || undefined,
      contextBefore: context.selection ? context.document : undefined,
    }, {
      signal: controller.signal,
      onChunk: (chunk) => { chunks.push(chunk); wake?.() },
    }).catch((error: unknown) => { failure = error }).finally(() => { complete = true; wake?.() })

    try {
      while (!complete || chunks.length > 0) {
        signal.throwIfAborted()
        if (chunks.length > 0) {
          yield chunks.shift()!
        } else {
          await new Promise<void>((resolve) => { wake = resolve })
        }
      }
      if (failure) throw failure
    } finally {
      signal.removeEventListener('abort', abort)
      controller.abort()
      await stream
    }
  }
}
