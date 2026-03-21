import { apiRequestData, buildApiUrl, extractErrorMessage } from './core'
import type { StoryAiGenerateInput, StoryAiModelsResponse } from './types'

export interface StoryAiStreamHandlers {
  onChunk: (chunk: string) => void
  onDone?: () => void
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
  input: StoryAiGenerateInput,
  handlers: StoryAiStreamHandlers,
): Promise<void> {
  const response = await fetch(buildApiUrl('/api/admin/stories/ai/generate'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
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

  while (true) {
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
}

export async function getStoryAiModels(token: string): Promise<StoryAiModelsResponse> {
  return apiRequestData<StoryAiModelsResponse>('/api/admin/stories/ai/models', {}, token)
}
