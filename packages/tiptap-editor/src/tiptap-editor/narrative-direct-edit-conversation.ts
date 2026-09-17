import {
  createEditorAgentTaskId,
  editorAiMessageMetadataSchema,
  editorAiTaskMessageMetadataSchema,
  type DirectEditTaskStatus,
  type EditorAiUnsuccessfulTaskMetadata,
  DirectEditAgentEvent,
  NarrativeDocumentSnapshot,
  type RunDirectEditAgentResult,
} from '@mo-gallery/ai-agent'

import type { EditorAiApi, EditorAiMessageDto } from '../runtime'

interface NarrativeTaskHistoryActions {
  undoTask(taskId: string): boolean
  redoTask(taskId: string): boolean
}

export interface NarrativeDirectEditRunnerOptions {
  taskId: string
  instruction: string
  model?: string
  signal?: AbortSignal
  onEvent: (event: DirectEditAgentEvent<NarrativeDocumentSnapshot>) => void
}

export type NarrativeDirectEditRunner = (
  options: NarrativeDirectEditRunnerOptions,
) => Promise<RunDirectEditAgentResult>

interface RunPersistedNarrativeDirectEditOptions {
  api: Pick<EditorAiApi, 'appendEditorAiMessage' | 'finishEditorAiMessage'>
  token: string
  conversationId: string
  instruction: string
  model?: string
  signal?: AbortSignal
  runner: NarrativeDirectEditRunner
  onEvent: NarrativeDirectEditRunnerOptions['onEvent']
  onPending?: (userMessage: EditorAiMessageDto, assistantMessage: EditorAiMessageDto) => void
  onTerminal?: (assistantMessage: EditorAiMessageDto) => void
  onExecutionCompleted?: (assistantMessage: EditorAiMessageDto, result: RunDirectEditAgentResult) => void
  createUnsuccessfulMetadata?: (input: {
    taskId: string
    status: Extract<DirectEditTaskStatus, 'failed' | 'stopped'>
    model?: string
    durationMs: number
  }) => EditorAiUnsuccessfulTaskMetadata
}

export interface PersistedNarrativeDirectEditResult {
  userMessage: EditorAiMessageDto
  assistantMessage: EditorAiMessageDto
  result: RunDirectEditAgentResult
}

interface RunPersistedTaskHistoryActionOptions {
  api: Pick<EditorAiApi, 'updateEditorAiTaskState'>
  history: NarrativeTaskHistoryActions
  token: string
  messageId: string
  taskId: string
  state: 'undone' | 'redone'
}

export async function runPersistedTaskHistoryAction({
  api,
  history,
  token,
  messageId,
  taskId,
  state,
}: RunPersistedTaskHistoryActionOptions): Promise<EditorAiMessageDto | null> {
  const changed = state === 'undone'
    ? history.undoTask(taskId)
    : history.redoTask(taskId)
  if (!changed) return null
  return await api.updateEditorAiTaskState(token, messageId, state)
}

function completedContent(result: RunDirectEditAgentResult): string {
  if (result.mode === 'suggestion_only') return result.suggestion
  return result.metadata.summary.join('\n')
}

export async function runPersistedNarrativeDirectEdit({
  api,
  token,
  conversationId,
  instruction,
  model,
  signal,
  runner,
  onEvent,
  onPending,
  onTerminal,
  onExecutionCompleted,
  createUnsuccessfulMetadata,
}: RunPersistedNarrativeDirectEditOptions): Promise<PersistedNarrativeDirectEditResult> {
  const taskId = createEditorAgentTaskId()
  const startedAt = Date.now()
  const userMessage = await api.appendEditorAiMessage(token, conversationId, {
    role: 'user',
    content: instruction,
    status: 'completed',
    model,
    action: 'custom',
  })
  const pendingAssistant = await api.appendEditorAiMessage(token, conversationId, {
    role: 'assistant',
    content: '',
    status: 'streaming',
    model,
    action: 'custom',
  })
  onPending?.(userMessage, pendingAssistant)

  let result: RunDirectEditAgentResult
  let partialContent = ''
  try {
    result = await runner({
      taskId,
      instruction,
      model,
      signal,
      onEvent: (event) => {
        if (event.type === 'text_delta') partialContent += event.text
        onEvent(event)
      },
    })
  } catch (error) {
    const stopped = error instanceof Error && error.name === 'AbortError'
    const message = error instanceof Error ? error.message : 'Narrative direct-edit failed'
    const unsuccessful = createUnsuccessfulMetadata?.({
      taskId,
      status: stopped ? 'stopped' : 'failed',
      model,
      durationMs: Math.max(0, Date.now() - startedAt),
    })
    const metadata = unsuccessful
      ? editorAiMessageMetadataSchema.parse(editorAiTaskMessageMetadataSchema.parse({
          type: 'editor_ai_task',
          task: unsuccessful,
        }))
      : undefined
    const terminalMessage = await api.finishEditorAiMessage(token, pendingAssistant.id, {
      status: stopped ? 'stopped' : 'failed',
      content: partialContent,
      model,
      ...(metadata === undefined ? {} : { metadata }),
      error: message,
    }).catch(() => undefined)
    if (terminalMessage) onTerminal?.(terminalMessage)
    throw error
  }

  const content = completedContent(result)
  const metadata = result.mode === 'direct_edit'
    ? editorAiMessageMetadataSchema.parse(editorAiTaskMessageMetadataSchema.parse({
        type: 'editor_ai_task',
        task: result.metadata,
      }))
    : undefined
  const localCompletedMessage: EditorAiMessageDto = {
    ...pendingAssistant,
    status: 'completed',
    content,
    model,
    ...(metadata === undefined ? {} : { metadata }),
  }
  onExecutionCompleted?.(localCompletedMessage, result)

  const assistantMessage = await api.finishEditorAiMessage(token, pendingAssistant.id, {
    status: 'completed',
    content,
    model,
    ...(metadata === undefined ? {} : { metadata }),
  })
  onTerminal?.(assistantMessage)

  return { userMessage, assistantMessage, result }
}
