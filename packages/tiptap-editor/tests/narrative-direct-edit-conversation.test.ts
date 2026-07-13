import assert from 'node:assert/strict'

import type { RunDirectEditAgentResult } from '@mo-gallery/ai-agent'

import {
  runPersistedNarrativeDirectEdit,
  runPersistedTaskHistoryAction,
} from '../src/tiptap-editor/narrative-direct-edit-conversation'
import type { EditorAiMessageDto } from '../src/runtime'

function message(id: string, role: string, status: string, content = '', metadata?: unknown): EditorAiMessageDto {
  return {
    id,
    conversationId: 'conversation-1',
    role,
    status,
    content,
    metadata,
    createdAt: '2026-07-13T00:00:00.000Z',
  }
}

const directResult: RunDirectEditAgentResult = {
  mode: 'direct_edit',
  metadata: {
    taskId: 'task-1',
    capability: 'narrative',
    taskType: 'instruction',
    target: { documentId: 'story-1' },
    model: 'model-1',
    visualMode: 'structure_only',
    summary: ['Updated the opening'],
    warningCodes: [],
    operationSummary: [{ type: 'replace_text', targetIds: ['node-1'] }],
    baseRevision: 'revision-1',
    durationMs: 10,
    status: 'completed',
    changeSet: {
      taskId: 'task-1',
      targetLabel: 'Story',
      entries: [{
        operation: 'replace_text',
        targetId: 'node-1',
        targetLabel: 'text',
        category: 'content',
        before: 'Old',
        after: 'New',
      }],
      warnings: [],
      state: 'applied',
    },
    resultRevision: 'revision-2',
  },
  commit: {
    resultRevision: 'revision-2',
    historyEntryId: 'history-1',
    saved: true,
  },
}

{
  const calls: string[] = []
  let finishMetadata: unknown
  const result = await runPersistedNarrativeDirectEdit({
    api: {
      appendEditorAiMessage: async (_token, _conversationId, input) => {
        calls.push(`append:${input.role}:${input.status}`)
        return message(input.role === 'user' ? 'user-1' : 'assistant-1', input.role, input.status ?? 'pending')
      },
      finishEditorAiMessage: async (_token, messageId, input) => {
        calls.push(`finish:${messageId}:${input.status}`)
        finishMetadata = input.metadata
        return message(messageId, 'assistant', input.status, input.content ?? '', input.metadata)
      },
    },
    token: 'token',
    conversationId: 'conversation-1',
    instruction: 'Improve the opening',
    model: 'model-1',
    runner: async () => {
      calls.push('run')
      return directResult
    },
    onEvent: () => undefined,
  })

  assert.deepEqual(calls, [
    'append:user:completed',
    'append:assistant:streaming',
    'run',
    'finish:assistant-1:completed',
  ])
  assert.deepEqual(finishMetadata, { type: 'editor_ai_task', task: directResult.metadata })
  assert.equal(result.assistantMessage.content, 'Updated the opening')
}

{
  let terminalStatus = ''
  const expected = new DOMException('Stopped', 'AbortError')
  await assert.rejects(
    runPersistedNarrativeDirectEdit({
      api: {
        appendEditorAiMessage: async (_token, _conversationId, input) => (
          message(input.role === 'user' ? 'user-2' : 'assistant-2', input.role, input.status ?? 'pending')
        ),
        finishEditorAiMessage: async (_token, messageId, input) => {
          terminalStatus = input.status
          return message(messageId, 'assistant', input.status)
        },
      },
      token: 'token',
      conversationId: 'conversation-1',
      instruction: 'Stop this task',
      runner: async () => { throw expected },
      onEvent: () => undefined,
    }),
    (error) => error === expected,
  )
  assert.equal(terminalStatus, 'stopped')
}

{
  let metadata: unknown = 'unset'
  const suggestion: RunDirectEditAgentResult = {
    mode: 'suggestion_only',
    suggestion: 'Try a shorter opening.',
    degradations: [],
  }
  const result = await runPersistedNarrativeDirectEdit({
    api: {
      appendEditorAiMessage: async (_token, _conversationId, input) => (
        message(input.role === 'user' ? 'user-3' : 'assistant-3', input.role, input.status ?? 'pending')
      ),
      finishEditorAiMessage: async (_token, messageId, input) => {
        metadata = input.metadata
        return message(messageId, 'assistant', input.status, input.content ?? '', input.metadata)
      },
    },
    token: 'token',
    conversationId: 'conversation-1',
    instruction: 'Suggest an opening',
    runner: async () => suggestion,
    onEvent: () => undefined,
  })
  assert.equal(result.assistantMessage.content, suggestion.suggestion)
  assert.equal(metadata, undefined, 'suggestion-only completion does not fabricate a ChangeSet')
}

{
  const calls: string[] = []
  let localCompleted: EditorAiMessageDto | undefined
  const persistenceError = new Error('Completion persistence failed')

  await assert.rejects(
    runPersistedNarrativeDirectEdit({
      api: {
        appendEditorAiMessage: async (_token, _conversationId, input) => (
          message(input.role === 'user' ? 'user-4' : 'assistant-4', input.role, input.status ?? 'pending')
        ),
        finishEditorAiMessage: async () => {
          calls.push('persist-completion')
          throw persistenceError
        },
      },
      token: 'token',
      conversationId: 'conversation-1',
      instruction: 'Apply this edit',
      runner: async () => directResult,
      onEvent: () => undefined,
      onExecutionCompleted: (assistantMessage) => {
        calls.push('local-completion')
        localCompleted = assistantMessage
      },
    }),
    (error) => error === persistenceError,
  )

  assert.deepEqual(calls, ['local-completion', 'persist-completion'])
  assert.equal(localCompleted?.status, 'completed')
  assert.deepEqual(localCompleted?.metadata, { type: 'editor_ai_task', task: directResult.metadata })
}

{
  const calls: string[] = []
  const persisted = await runPersistedTaskHistoryAction({
    api: {
      updateEditorAiTaskState: async (_token, messageId, state) => {
        calls.push(`persist:${messageId}:${state}`)
        return message(messageId, 'assistant', 'completed')
      },
    },
    history: {
      undoTask: (taskId) => {
        calls.push(`undo:${taskId}`)
        return true
      },
      redoTask: () => false,
    },
    token: 'token',
    messageId: 'assistant-4',
    taskId: 'task-1',
    state: 'undone',
  })
  assert.ok(persisted)
  assert.deepEqual(calls, ['undo:task-1', 'persist:assistant-4:undone'])

  calls.length = 0
  const unchanged = await runPersistedTaskHistoryAction({
    api: {
      updateEditorAiTaskState: async () => {
        calls.push('unexpected-persist')
        return message('assistant-4', 'assistant', 'completed')
      },
    },
    history: { undoTask: () => false, redoTask: () => false },
    token: 'token',
    messageId: 'assistant-4',
    taskId: 'task-1',
    state: 'redone',
  })
  assert.equal(unchanged, null)
  assert.deepEqual(calls, [], 'failed native history action never updates persisted task state')
}

console.log('✓ persisted narrative direct-edit conversation lifecycle')
