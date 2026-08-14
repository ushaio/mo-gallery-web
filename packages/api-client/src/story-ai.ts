import { apiRequest, apiRequestData, buildApiUrl, buildQuery, extractErrorMessage } from './core'
import type { AiChangeSetState } from '@mo-gallery/ai-agent'

import type {
  AiImageUploadResult,
  EditorAiConversationCreateInput,
  EditorAiConversationDto,
  EditorAiConversationUpdateInput,
  EditorAiConversationWithMessagesDto,
  EditorAiGenerateInput,
  EditorAiImageGenerateInput,
  EditorAiImageSaveResult,
  EditorAiMessageAppendInput,
  EditorAiMessageDto,
  EditorAiMessageFinishInput,
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

export async function generateEditorAiImage(
  token: string,
  input: EditorAiImageGenerateInput,
): Promise<EditorAiConversationWithMessagesDto> {
  return apiRequestData<EditorAiConversationWithMessagesDto>(
    '/api/admin/editor-ai/generate-image',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    token,
  )
}

export async function getEditorAiConversations(token: string, scopeId?: string): Promise<EditorAiConversationDto[]> {
  const query = scopeId ? buildQuery({ scopeId }) : ''
  return apiRequestData<EditorAiConversationDto[]>(
    `/api/admin/editor-ai/conversations${query}`,
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

export async function updateEditorAiConversation(token: string, conversationId: string, input: EditorAiConversationUpdateInput): Promise<EditorAiConversationDto> {
  return apiRequestData<EditorAiConversationDto>(`/api/admin/editor-ai/conversations/${conversationId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }, token)
}

export async function generateEditorAiConversationTitle(
  token: string,
  conversationId: string,
  model?: string,
): Promise<EditorAiConversationDto> {
  return apiRequestData<EditorAiConversationDto>(
    `/api/admin/editor-ai/conversations/${conversationId}/generate-title`,
    {
      method: 'POST',
      body: JSON.stringify({ ...(model ? { model } : {}) }),
    },
    token,
  )
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

export function appendEditorAiMessage(
  token: string,
  conversationId: string,
  input: EditorAiMessageAppendInput,
): Promise<EditorAiMessageDto> {
  return apiRequestData<EditorAiMessageDto>(
    `/api/admin/editor-ai/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    token,
  )
}

export function finishEditorAiMessage(
  token: string,
  messageId: string,
  input: EditorAiMessageFinishInput,
): Promise<EditorAiMessageDto> {
  return apiRequestData<EditorAiMessageDto>(
    `/api/admin/editor-ai/messages/${encodeURIComponent(messageId)}/finish`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    token,
  )
}

export function updateEditorAiTaskState(
  token: string,
  messageId: string,
  state: AiChangeSetState,
): Promise<EditorAiMessageDto> {
  return apiRequestData<EditorAiMessageDto>(
    `/api/admin/editor-ai/messages/${encodeURIComponent(messageId)}/task-state`,
    {
      method: 'PATCH',
      body: JSON.stringify({ state }),
    },
    token,
  )
}

export async function uploadAiImage(token: string, file: File): Promise<AiImageUploadResult> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(buildApiUrl('/api/admin/editor-ai/upload'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(extractErrorMessage(payload) ?? 'Image upload failed')
  }

  const result = await response.json() as { success: boolean; data: AiImageUploadResult }
  return result.data
}


export async function saveEditorAiMessageImage(
  token: string,
  messageId: string,
  imageUrl: string,
): Promise<EditorAiImageSaveResult> {
  return apiRequestData<EditorAiImageSaveResult>(
    `/api/admin/editor-ai/messages/${encodeURIComponent(messageId)}/images/save`,
    {
      method: 'POST',
      body: JSON.stringify({ imageUrl }),
    },
    token,
  )
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
