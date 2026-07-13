import assert from 'node:assert/strict'

import {
  EditorAiInvalidMetadataError,
  EditorAiNotFoundError,
  createEditorAiRepository,
} from './editor-ai-repository'
import {
  COMPLETED_EDITOR_AI_TASK_METADATA,
  FakeEditorAiStore,
} from './testing/fake-editor-ai-store'

const BASE_TIME = new Date('2026-07-12T10:00:00.000Z')

function createFixtureStore() {
  return new FakeEditorAiStore({
    conversations: [
      {
        id: 'owned-new', userId: 'user-a', scopeId: 'story:1', title: 'Owned new',
        summary: 'keep', lastModel: 'old-model', systemPrompt: 'system',
        createdAt: new Date(BASE_TIME.getTime() + 1_000),
        updatedAt: new Date(BASE_TIME.getTime() + 3_000),
      },
      {
        id: 'owned-old', userId: 'user-a', scopeId: 'story:1', title: 'Owned old',
        summary: null, lastModel: null, systemPrompt: null,
        createdAt: BASE_TIME,
        updatedAt: new Date(BASE_TIME.getTime() + 2_000),
      },
      {
        id: 'other', userId: 'user-b', scopeId: 'story:1', title: 'Other',
        summary: null, lastModel: null, systemPrompt: null,
        createdAt: BASE_TIME, updatedAt: new Date(BASE_TIME.getTime() + 4_000),
      },
      {
        id: 'legacy-null', userId: null, scopeId: 'story:1', title: 'Legacy',
        summary: null, lastModel: null, systemPrompt: null,
        createdAt: BASE_TIME, updatedAt: new Date(BASE_TIME.getTime() + 5_000),
      },
      {
        id: 'other-scope', userId: 'user-a', scopeId: 'story:2', title: 'Other scope',
        summary: null, lastModel: null, systemPrompt: null,
        createdAt: BASE_TIME, updatedAt: BASE_TIME,
      },
    ],
    messages: [
      {
        id: 'system', conversationId: 'owned-new', role: 'system', content: 'rules',
        status: 'completed', model: null, action: null, metadata: null, error: null,
        createdAt: BASE_TIME,
      },
      {
        id: 'user-old', conversationId: 'owned-new', role: 'user', content: 'question',
        status: 'completed', model: null, action: null, metadata: null, error: null,
        createdAt: new Date(BASE_TIME.getTime() + 1_000),
      },
      {
        id: 'assistant-stream', conversationId: 'owned-new', role: 'assistant', content: 'partial',
        status: 'streaming', model: null, action: null, metadata: null, error: null,
        createdAt: new Date(BASE_TIME.getTime() + 2_000),
      },
      {
        id: 'assistant-failed', conversationId: 'owned-new', role: 'assistant', content: 'bad',
        status: 'failed', model: null, action: null, metadata: null, error: 'failed',
        createdAt: new Date(BASE_TIME.getTime() + 3_000),
      },
      {
        id: 'other-message', conversationId: 'other', role: 'assistant', content: 'secret',
        status: 'completed', model: null, action: null, metadata: null, error: null,
        createdAt: BASE_TIME,
      },
    ],
  })
}

async function expectNotFound(
  action: () => Promise<unknown>,
  resource: 'conversation' | 'message',
) {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof EditorAiNotFoundError)
    assert.equal(error.resource, resource)
    assert.equal(error.message, `${resource} not found`)
    assert.equal(error.message.includes('user-a'), false)
    return true
  })
}

async function testOwnedConversationQueries() {
  const repository = createEditorAiRepository(createFixtureStore())
  assert.deepEqual(
    (await repository.listConversations('user-a', 'story:1')).map(({ id }) => id),
    ['owned-new', 'owned-old'],
  )
  assert.deepEqual(
    (await repository.listConversations('user-a')).map(({ id }) => id),
    ['owned-new', 'owned-old', 'other-scope'],
  )
  assert.equal(await repository.getConversation('user-a', 'other'), null)
  assert.equal(await repository.getConversation('user-a', 'legacy-null'), null)
  assert.equal(await repository.getConversation('user-a', 'missing'), null)
  assert.equal(await repository.getConversationWithMessages('user-a', 'other'), null)

  const conversation = await repository.getConversationWithMessages('user-a', 'owned-new')
  assert.deepEqual(conversation?.messages.map(({ id }) => id), [
    'system', 'user-old', 'assistant-stream', 'assistant-failed',
  ])
}

async function testHasMessageUsesNestedOwnerScope() {
  const repository = createEditorAiRepository(createFixtureStore())
  assert.equal(await repository.hasMessage('user-a', 'system'), true)
  assert.equal(await repository.hasMessage('user-a', 'other-message'), false)
  assert.equal(await repository.hasMessage('user-a', 'missing'), false)
}

async function testCreateAppendListAndHistory() {
  const store = createFixtureStore()
  const repository = createEditorAiRepository(store)
  const created = await repository.createConversation('user-a', {
    scopeId: 'story:new', title: 'New', systemPrompt: 'prompt',
  })
  assert.equal(store.conversations.get(created.id)?.userId, 'user-a')

  const appended = await repository.appendMessage('user-a', {
    conversationId: 'owned-new', role: 'assistant', content: 'answer',
  })
  assert.equal(appended.status, 'completed')
  assert.equal(store.messages.get(appended.id)?.status, 'completed')
  await expectNotFound(
    () => repository.appendMessage('user-a', {
      conversationId: 'other', role: 'user', content: 'no access',
    }),
    'conversation',
  )
  assert.equal([...store.messages.values()].some(({ content }) => content === 'no access'), false)

  assert.deepEqual(
    (await repository.listMessages('user-a', 'owned-new', 2)).map(({ id }) => id),
    ['system', 'user-old'],
  )
  assert.deepEqual(await repository.listMessages('user-a', 'other'), [])
  assert.deepEqual(await repository.buildHistory('user-a', 'owned-new', 2), [
    { role: 'assistant', content: 'partial' },
    { role: 'assistant', content: 'answer' },
  ])
  assert.deepEqual(await repository.buildHistory('user-a', 'other'), [])
}

async function testAppendMessageRollsBackOwnershipRace() {
  const store = createFixtureStore()
  const repository = createEditorAiRepository(store)
  const conversationSnapshot = structuredClone(store.conversations.get('owned-new'))
  const messagesSnapshot = structuredClone(store.messages)

  store.beforeMessageCreate = () => {
    const conversation = store.conversations.get('owned-new')
    assert.ok(conversation)
    conversation.userId = 'user-b'
    throw new Error('injected ownership serialization conflict')
  }

  await assert.rejects(
    repository.appendMessage('user-a', {
      conversationId: 'owned-new', role: 'user', content: 'must rollback',
    }),
    /injected ownership serialization conflict/,
  )
  assert.deepEqual(store.conversations.get('owned-new'), conversationSnapshot)
  assert.deepEqual(store.messages, messagesSnapshot)
  assert.equal(store.transactionCount, 1)
}

async function testOwnedConversationMutations() {
  const store = createFixtureStore()
  const repository = createEditorAiRepository(store)
  const updated = await repository.updateConversation('user-a', 'owned-new', {
    title: 'Renamed', systemPrompt: null,
  })
  assert.equal(updated.title, 'Renamed')
  assert.equal(updated.summary, 'keep')
  assert.equal(updated.lastModel, 'old-model')
  assert.equal(updated.systemPrompt, undefined)
  await expectNotFound(
    () => repository.updateConversation('user-a', 'other', { title: 'stolen' }),
    'conversation',
  )
  assert.equal(store.conversations.get('other')?.title, 'Other')

  const cleared = await repository.clearConversation('user-a', 'owned-new')
  assert.equal(cleared.summary, undefined)
  assert.equal(cleared.lastModel, undefined)
  assert.equal([...store.messages.values()].some(({ conversationId }) => conversationId === 'owned-new'), false)
  await expectNotFound(() => repository.clearConversation('user-a', 'other'), 'conversation')
  await expectNotFound(() => repository.clearConversation('user-a', 'missing'), 'conversation')
  await expectNotFound(() => repository.deleteConversation('user-a', 'legacy-null'), 'conversation')
  assert.ok(store.messages.has('other-message'))

  await repository.deleteConversation('user-a', 'owned-old')
  assert.equal(store.conversations.has('owned-old'), false)
  await expectNotFound(() => repository.deleteConversation('user-a', 'other'), 'conversation')
  assert.ok(store.conversations.has('other'))
}

async function testClearConversationRollsBackUpdateFailure() {
  const store = createFixtureStore()
  const repository = createEditorAiRepository(store)
  const conversationsSnapshot = structuredClone(store.conversations)
  const messagesSnapshot = structuredClone(store.messages)
  store.failConversationUpdateMany = true

  await assert.rejects(
    repository.clearConversation('user-a', 'owned-new'),
    /injected conversation updateMany failure/,
  )
  assert.deepEqual(store.conversations, conversationsSnapshot)
  assert.deepEqual(store.messages, messagesSnapshot)
  assert.equal(store.transactionCount, 1)
}

async function testInaccessibleClearConversationDoesNotMutate() {
  const store = createFixtureStore()
  const repository = createEditorAiRepository(store)
  const conversationsSnapshot = structuredClone(store.conversations)
  const messagesSnapshot = structuredClone(store.messages)

  await expectNotFound(
    () => repository.clearConversation('user-a', 'other'),
    'conversation',
  )
  assert.deepEqual(store.conversations, conversationsSnapshot)
  assert.deepEqual(store.messages, messagesSnapshot)
  assert.equal(store.transactionCount, 1)
}

async function testAtomicFinishRules() {
  const store = createFixtureStore()
  const repository = createEditorAiRepository(store)
  const assistant = await repository.appendMessage('user-a', {
    conversationId: 'owned-new', role: 'assistant', content: '', status: 'streaming',
    error: 'stale',
  })
  const completed = await repository.finishMessage('user-a', assistant.id, {
    status: 'completed', content: 'done', model: 'openai:gpt-5.6',
    metadata: { trace: 'kept' },
  })
  assert.equal(completed.status, 'completed')
  assert.equal(completed.error, undefined)
  assert.equal(store.conversations.get('owned-new')?.lastModel, 'openai:gpt-5.6')

  const failed = await repository.appendMessage('user-a', {
    conversationId: 'owned-new', role: 'assistant', content: '', status: 'streaming',
  })
  await repository.finishMessage('user-a', failed.id, {
    status: 'failed', error: 'provider error', model: 'must-not-touch',
  })
  assert.equal(store.messages.get(failed.id)?.error, 'provider error')
  assert.equal(store.conversations.get('owned-new')?.lastModel, 'openai:gpt-5.6')

  const stopped = await repository.appendMessage('user-a', {
    conversationId: 'owned-new', role: 'assistant', content: '', status: 'streaming',
  })
  await repository.finishMessage('user-a', stopped.id, {
    status: 'stopped', content: 'partial', error: 'cancelled',
  })
  assert.equal(store.messages.get(stopped.id)?.status, 'stopped')
  assert.equal(store.messages.get(stopped.id)?.error, 'cancelled')
  assert.equal(store.transactionCount, 6)

  const snapshot = structuredClone(store.messages.get(stopped.id))
  const conversationSnapshot = structuredClone(store.conversations.get('owned-new'))
  store.failConversationUpdate = true
  await assert.rejects(
    repository.finishMessage('user-a', stopped.id, {
      status: 'completed', content: 'should rollback', model: 'rollback-model',
    }),
    /injected conversation update failure/,
  )
  assert.deepEqual(store.messages.get(stopped.id), snapshot)
  assert.deepEqual(store.conversations.get('owned-new'), conversationSnapshot)

  const otherSnapshot = structuredClone(store.messages.get('other-message'))
  await expectNotFound(
    () => repository.finishMessage('user-a', 'other-message', {
      status: 'completed', content: 'stolen',
      metadata: { type: 'editor_ai_task', task: {} } as never,
    }),
    'message',
  )
  assert.deepEqual(store.messages.get('other-message'), otherSnapshot)
}

async function testNarrowTaskStateUpdates() {
  const store = createFixtureStore()
  const repository = createEditorAiRepository(store)
  const task = await repository.appendMessage('user-a', {
    conversationId: 'owned-new', role: 'assistant', content: 'task',
    metadata: { type: 'editor_ai_task', task: COMPLETED_EDITOR_AI_TASK_METADATA },
  })
  const before = structuredClone(store.messages.get(task.id)?.metadata)

  for (const state of ['undone', 'redone', 'applied'] as const) {
    const result = await repository.updateTaskState('user-a', task.id, state)
    assert.equal(
      (result.metadata as { task: { changeSet: { state: string } } }).task.changeSet.state,
      state,
    )
  }
  const after = structuredClone(store.messages.get(task.id)?.metadata) as {
    task: { changeSet: { state: string } }
  }
  const expected = structuredClone(before) as typeof after
  expected.task.changeSet.state = 'applied'
  assert.deepEqual(after, expected)

  const legacy = await repository.appendMessage('user-a', {
    conversationId: 'owned-new', role: 'assistant', content: 'legacy task',
    metadata: COMPLETED_EDITOR_AI_TASK_METADATA,
  })
  const normalized = await repository.updateTaskState('user-a', legacy.id, 'undone')
  assert.equal((normalized.metadata as { type: string }).type, 'editor_ai_task')
  assert.equal(
    (normalized.metadata as { task: { changeSet: { state: string } } }).task.changeSet.state,
    'undone',
  )

  await expectNotFound(
    () => repository.updateTaskState('user-b', task.id, 'redone'),
    'message',
  )
  const invalid = await repository.appendMessage('user-a', {
    conversationId: 'owned-new', role: 'assistant', content: 'invalid', metadata: { bad: true },
  })
  await assert.rejects(
    repository.updateTaskState('user-a', invalid.id, 'undone'),
    EditorAiInvalidMetadataError,
  )
  await assert.rejects(
    repository.appendMessage('user-a', {
      conversationId: 'owned-new',
      role: 'assistant',
      content: 'malformed envelope',
      metadata: { type: 'editor_ai_task', task: {} } as never,
    }),
    EditorAiInvalidMetadataError,
  )
  const taskBase: Record<string, unknown> = {
    ...structuredClone(COMPLETED_EDITOR_AI_TASK_METADATA),
  }
  delete taskBase.changeSet
  delete taskBase.resultRevision
  const incomplete = await repository.appendMessage('user-a', {
    conversationId: 'owned-new', role: 'assistant', content: 'failed task',
    metadata: {
      type: 'editor_ai_task',
      task: { ...taskBase, status: 'failed' },
    } as never,
  })
  await assert.rejects(
    repository.updateTaskState('user-a', incomplete.id, 'redone'),
    EditorAiInvalidMetadataError,
  )
}

async function main() {
  await testOwnedConversationQueries()
  await testHasMessageUsesNestedOwnerScope()
  await testCreateAppendListAndHistory()
  await testAppendMessageRollsBackOwnershipRace()
  await testOwnedConversationMutations()
  await testClearConversationRollsBackUpdateFailure()
  await testInaccessibleClearConversationDoesNotMutate()
  await testAtomicFinishRules()
  await testNarrowTaskStateUpdates()

  console.log('editor AI repository ownership and transaction tests passed')
}

void main()
