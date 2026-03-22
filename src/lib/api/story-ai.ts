import { apiRequest, apiRequestData, buildApiUrl, buildQuery, extractErrorMessage } from './core'
import type {
  EditorAiConversationCreateInput,
  EditorAiConversationDto,
  EditorAiConversationWithMessagesDto,
  EditorAiGenerateInput,
  StoryAiGenerateInput,
  StoryAiModelsResponse,
} from './types'

export interface StoryAiStreamHandlers {
  onChunk: (chunk: string) => void
  onDone?: () => void
  signal?: AbortSignal
}

function parseServerSentEvents(
  chunk: string,
  onEvent: (eventName: string, data: string) => void,
  state: { buffer: string },
) {
  state.buffer += chunk

  while (true) {
    const separatorIndex = state.buffer.indexOf('\n\n')
    if (separatorIndex === -1) {
      break
    }

    const rawEvent = state.buffer.slice(0, separatorIndex)
    state.buffer = state.buffer.slice(separatorIndex + 2)

    let eventName = 'message'
    const dataLines: string[] = []

    for (const line of rawEvent.split('\n')) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim()
        continue
      }
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart())
      }
    }

    onEvent(eventName, dataLines.join('\n'))
  }
}

export async function streamStoryAiGenerate(
  token: string,
  input: EditorAiGenerateInput,
  handlers: StoryAiStreamHandlers,
): Promise<void> {
  const response = await fetch(buildApiUrl('/api/admin/editor-ai/generate'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
    signal: handlers.signal,
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(extractErrorMessage(payload) ?? `Request failed (${response.status})`)
  }

  if (!response.body) {
    throw new Error('AI response stream is unavailable')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const streamState = { buffer: '' }
  const abortSignal = handlers.signal
  const handleAbort = () => {
    void reader.cancel().catch(() => {})
  }

  if (abortSignal) {
    if (abortSignal.aborted) {
      handleAbort()
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
    abortSignal.addEventListener('abort', handleAbort, { once: true })
  }

  try {
    while (true) {
      if (abortSignal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError')
      }

      const { done, value } = await reader.read()
      if (done) {
        break
      }

      parseServerSentEvents(
        decoder.decode(value, { stream: true }),
        (eventName, data) => {
          if (eventName === 'chunk' && data) {
            try {
              handlers.onChunk(JSON.parse(data) as string)
            } catch {
              handlers.onChunk(data)
            }
            return
          }

          if (eventName === 'error' && data) {
            throw new Error(data)
          }

          if (eventName === 'done') {
            handlers.onDone?.()
          }
        },
        streamState,
      )
    }
  } finally {
    abortSignal?.removeEventListener('abort', handleAbort)
  }
}

export async function getStoryAiModels(token: string): Promise<StoryAiModelsResponse> {
  return apiRequestData<StoryAiModelsResponse>('/api/admin/editor-ai/models', {}, token)
}

export async function getEditorAiConversations(token: string, scopeId: string): Promise<EditorAiConversationDto[]> {
  return apiRequestData<EditorAiConversationDto[]>(
    `/api/admin/editor-ai/conversations${buildQuery({ scopeId })}`,
    {},
    token,
  )
}

export async function createEditorAiConversation(token: string, input: EditorAiConversationCreateInput): Promise<EditorAiConversationDto> {
  return apiRequestData<EditorAiConversationDto>('/api/admin/editor-ai/conversations', {
    method: 'POST',
    body: JSON.stringify(input),
  }, token)
}

export async function getEditorAiConversation(token: string, conversationId: string): Promise<EditorAiConversationWithMessagesDto> {
  return apiRequestData<EditorAiConversationWithMessagesDto>(`/api/admin/editor-ai/conversations/${conversationId}`, {}, token)
}

export async function deleteEditorAiConversation(token: string, conversationId: string): Promise<void> {
  await apiRequest(`/api/admin/editor-ai/conversations/${conversationId}`, {
    method: 'DELETE',
  }, token)
}

export async function clearEditorAiConversation(token: string, conversationId: string): Promise<EditorAiConversationDto> {
  return apiRequestData<EditorAiConversationDto>(`/api/admin/editor-ai/conversations/${conversationId}/clear`, {
    method: 'POST',
  }, token)
}

export async function polishStoryAiPrompt(
  token: string,
  input: {
    text: string
    action?: StoryAiGenerateInput['action']
    hasSelection?: boolean
    model?: string
  },
): Promise<{ text: string }> {
  return apiRequestData<{ text: string }>('/api/admin/stories/ai/polish-prompt', {
    method: 'POST',
    body: JSON.stringify(input),
  }, token)
}
