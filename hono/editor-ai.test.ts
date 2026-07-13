import assert from 'node:assert/strict'
import Module, { createRequire } from 'node:module'

import jwt from 'jsonwebtoken'

import type { EditorAiCompletedTaskMetadata } from '@mo-gallery/ai-agent'

import type { EditorAiRouteDependencies } from './editor-ai'
import type {
  EditorAiConversationDto,
  EditorAiConversationUpdateInput,
  EditorAiMessageAppendInput,
  EditorAiMessageFinishInput,
  EditorAiRepository,
} from '~/server/lib/editor-ai'

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve('server-only')
const cachedServerOnly = require.cache[serverOnlyPath]
const serverOnlyStub = new Module(serverOnlyPath)
serverOnlyStub.filename = serverOnlyPath
serverOnlyStub.loaded = true
serverOnlyStub.exports = {}
let editorAiRouterFactory: typeof import('./editor-ai').createEditorAiRouter | undefined
let EditorAiInvalidMetadataError: typeof import('~/server/lib/editor-ai-repository').EditorAiInvalidMetadataError
let EditorAiNotFoundError: typeof import('~/server/lib/editor-ai-repository').EditorAiNotFoundError

async function loadEditorAiRouterFactory() {
  require.cache[serverOnlyPath] = serverOnlyStub
  try {
    const [editorAiModule, repositoryModule] = await Promise.all([
      import('./editor-ai'),
      import('~/server/lib/editor-ai-repository'),
    ])
    editorAiRouterFactory = editorAiModule.createEditorAiRouter
    EditorAiInvalidMetadataError = repositoryModule.EditorAiInvalidMetadataError
    EditorAiNotFoundError = repositoryModule.EditorAiNotFoundError
  } finally {
    if (cachedServerOnly) require.cache[serverOnlyPath] = cachedServerOnly
    else delete require.cache[serverOnlyPath]
  }
}

function createEditorAiRouter(dependencies: EditorAiRouteDependencies) {
  if (!editorAiRouterFactory) throw new Error('Editor AI router factory is not loaded')
  return editorAiRouterFactory(dependencies)
}

const JWT_SECRET = 'editor-ai-route-test-secret'
process.env.JWT_SECRET = JWT_SECRET

const TOKEN = jwt.sign({ sub: 'user-a', username: 'alice' }, JWT_SECRET)
const AUTH_HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
}
const INACCESSIBLE_IDS = ['missing', 'owned-by-b', 'legacy-null'] as const

const COMPLETED_EDITOR_AI_TASK_METADATA = {
  taskId: 'task-1',
  capability: 'narrative',
  taskType: 'instruction',
  target: { documentId: 'document-1' },
  model: 'openai:gpt-5.6',
  visualMode: 'structure_only',
  summary: ['Updated the selected text'],
  warningCodes: [],
  operationSummary: [{ type: 'replace_text', targetIds: ['node-1'] }],
  baseRevision: 'revision-1',
  durationMs: 25,
  status: 'completed',
  changeSet: {
    taskId: 'task-1',
    targetLabel: 'Selected text',
    entries: [{
      operation: 'replace_text',
      targetId: 'node-1',
      targetLabel: 'Paragraph',
      category: 'content',
      before: 'Before',
      after: 'After',
    }],
    warnings: [],
    state: 'applied',
  },
  resultRevision: 'revision-2',
} satisfies EditorAiCompletedTaskMetadata

type TestTaskMetadata = {
  type: 'editor_ai_task'
  task: Omit<typeof COMPLETED_EDITOR_AI_TASK_METADATA, 'changeSet'> & {
    changeSet: Omit<typeof COMPLETED_EDITOR_AI_TASK_METADATA.changeSet, 'state'> & {
      state: Parameters<EditorAiRepository['updateTaskState']>[2]
    }
  }
}

const COMPLETED_TASK_METADATA: TestTaskMetadata = {
  type: 'editor_ai_task',
  task: structuredClone(COMPLETED_EDITOR_AI_TASK_METADATA),
}

type RepositoryCall = {
  method: string
  userId: string
  id?: string
  args: unknown[]
}

function conversation(id: string): EditorAiConversationDto {
  return {
    id,
    scopeId: 'story:1',
    title: id,
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
  }
}

class RecordingRepository implements EditorAiRepository {
  readonly calls: RepositoryCall[] = []
  readonly conversationOwners = new Map<string, string | null>([
    ['owned', 'user-a'],
    ['owned-empty', 'user-a'],
    ['owned-by-b', 'user-b'],
    ['legacy-null', null],
  ])
  listResponse: EditorAiConversationDto[] = [conversation('owned')]
  messagesByConversation = new Map<string, Awaited<ReturnType<EditorAiRepository['listMessages']>>>([
    ['owned-empty', []],
  ])
  readonly messageOwners = new Map<string, string | null>([
    ['owned-message', 'user-a'],
    ['owned-task', 'user-a'],
    ['malformed-task', 'user-a'],
    ['noncompleted-task', 'user-a'],
    ['non-task', 'user-a'],
    ['message-owned-by-b', 'user-b'],
    ['message-legacy-null', null],
  ])
  readonly taskMetadata = new Map<string, unknown>([
    ['owned-task', structuredClone(COMPLETED_TASK_METADATA)],
    ['malformed-task', { type: 'editor_ai_task', task: {} }],
    ['noncompleted-task', {
      type: 'editor_ai_task',
      task: { ...structuredClone(COMPLETED_TASK_METADATA.task), status: 'failed' },
    }],
    ['non-task', { trace: 'not-a-task' }],
  ])

  private canAccess(userId: string, id: string) {
    return this.conversationOwners.get(id) === userId
  }

  async createConversation(userId: string, input: Parameters<EditorAiRepository['createConversation']>[1]) {
    this.calls.push({ method: 'createConversation', userId, args: [input] })
    return conversation('created')
  }

  async listConversations(userId: string, scopeId?: string) {
    this.calls.push({ method: 'listConversations', userId, args: [scopeId] })
    return this.listResponse
  }

  async getConversation(userId: string, id: string) {
    this.calls.push({ method: 'getConversation', userId, id, args: [id] })
    return this.canAccess(userId, id) ? conversation(id) : null
  }

  async getConversationWithMessages(userId: string, id: string) {
    this.calls.push({ method: 'getConversationWithMessages', userId, id, args: [id] })
    return this.canAccess(userId, id) ? { ...conversation(id), messages: [] } : null
  }

  async deleteConversation(userId: string, id: string) {
    this.calls.push({ method: 'deleteConversation', userId, id, args: [id] })
    if (!this.canAccess(userId, id)) throw new EditorAiNotFoundError('conversation')
  }

  async clearConversation(userId: string, id: string) {
    this.calls.push({ method: 'clearConversation', userId, id, args: [id] })
    if (!this.canAccess(userId, id)) throw new EditorAiNotFoundError('conversation')
    return conversation(id)
  }

  async listMessages(userId: string, id: string) {
    this.calls.push({ method: 'listMessages', userId, id, args: [id] })
    return this.messagesByConversation.get(id) ?? []
  }

  async buildHistory(userId: string, id: string, limit?: number) {
    this.calls.push({ method: 'buildHistory', userId, id, args: [id, limit] })
    return []
  }

  async hasMessage(userId: string, id: string) {
    this.calls.push({ method: 'hasMessage', userId, id, args: [id] })
    return this.messageOwners.get(id) === userId
  }

  async appendMessage(userId: string, input: EditorAiMessageAppendInput) {
    this.calls.push({ method: 'appendMessage', userId, id: input.conversationId, args: [input] })
    if (!this.canAccess(userId, input.conversationId)) {
      throw new EditorAiNotFoundError('conversation')
    }
    return {
      id: 'message', conversationId: input.conversationId, role: input.role,
      content: input.content, status: input.status ?? 'completed',
      model: input.model, action: input.action, metadata: input.metadata, error: input.error,
      createdAt: '2026-07-12T00:00:00.000Z',
    }
  }

  async finishMessage(userId: string, id: string, input: EditorAiMessageFinishInput) {
    this.calls.push({ method: 'finishMessage', userId, id, args: [id, input] })
    if (this.messageOwners.get(id) !== userId) throw new EditorAiNotFoundError('message')
    return {
      id, conversationId: 'owned', role: 'assistant', content: input.content ?? '',
      status: input.status, model: input.model, metadata: input.metadata,
      error: input.status === 'completed' ? undefined : input.error,
      createdAt: '2026-07-12T00:00:00.000Z',
    }
  }

  async updateTaskState(userId: string, id: string, state: Parameters<EditorAiRepository['updateTaskState']>[2]) {
    this.calls.push({ method: 'updateTaskState', userId, id, args: [id, state] })
    if (this.messageOwners.get(id) !== userId) throw new EditorAiNotFoundError('message')
    const metadata = this.taskMetadata.get(id)
    if (!metadata || id !== 'owned-task') throw new EditorAiInvalidMetadataError()
    const updated = structuredClone(metadata) as typeof COMPLETED_TASK_METADATA
    updated.task.changeSet.state = state
    this.taskMetadata.set(id, updated)
    return {
      id, conversationId: 'owned', role: 'assistant', content: '',
      status: 'completed', metadata: updated,
      createdAt: '2026-07-12T00:00:00.000Z',
    }
  }

  async updateConversation(userId: string, id: string, input: EditorAiConversationUpdateInput) {
    this.calls.push({ method: 'updateConversation', userId, id, args: [id, input] })
    if (!this.canAccess(userId, id)) throw new EditorAiNotFoundError('conversation')
    return { ...conversation(id), ...input, systemPrompt: input.systemPrompt ?? undefined }
  }
}

function createFixture(options?: {
  listResponse?: EditorAiConversationDto[]
  loadRemoteImage?: EditorAiRouteDependencies['loadRemoteImage']
}) {
  const repository = new RecordingRepository()
  if (options?.listResponse) repository.listResponse = options.listResponse
  const saveMessageImageUsers: string[] = []
  const counters = {
    createStream: 0,
    fetchModels: 0,
    generateText: 0,
    generateImage: 0,
    remoteImageFetch: 0,
    getStorage: 0,
    saveMessageImage: 0,
  }
  const dependencies: EditorAiRouteDependencies = {
    repository,
    createStream: async () => {
      counters.createStream += 1
      return new ReadableStream<Uint8Array>()
    },
    fetchModels: async () => {
      counters.fetchModels += 1
      return { defaultModel: 'test-model', models: [] }
    },
    generateText: async () => {
      counters.generateText += 1
      return 'Generated title'
    },
    generateImage: async () => {
      counters.generateImage += 1
      throw new Error('unexpected image generation')
    },
    loadRemoteImage: async (url, loadOptions) => {
      counters.remoteImageFetch += 1
      if (options?.loadRemoteImage) return options.loadRemoteImage(url, loadOptions)
      throw new Error('unexpected remote image fetch')
    },
    getStorage: async () => {
      counters.getStorage += 1
      throw new Error('unexpected storage access')
    },
    saveMessageImage: async (userId) => {
      counters.saveMessageImage += 1
      saveMessageImageUsers.push(userId)
      return { photoId: 'photo', alreadySaved: true }
    },
  }
  return { app: createEditorAiRouter(dependencies), counters, repository, saveMessageImageUsers }
}

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>
}

async function testCrudUsesJwtSubject() {
  const { app, repository } = createFixture()
  const created = await app.request('/admin/editor-ai/conversations', {
    method: 'POST', headers: AUTH_HEADERS,
    body: JSON.stringify({ scopeId: 'story:1', title: 'Mine', owner: 'user-b' }),
  })
  assert.equal(created.status, 200)
  assert.deepEqual(await json(created), { success: true, data: conversation('created') })

  const listed = await app.request('/admin/editor-ai/conversations?scopeId=story:1', {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  assert.equal(listed.status, 200)
  assert.deepEqual(await json(listed), { success: true, data: [conversation('owned')] })

  const detail = await app.request('/admin/editor-ai/conversations/owned', {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  assert.equal(detail.status, 200)
  assert.deepEqual(await json(detail), {
    success: true,
    data: { ...conversation('owned'), messages: [] },
  })

  for (const [method, path, body, expected] of [
    ['PATCH', '/admin/editor-ai/conversations/owned', JSON.stringify({ title: 'Updated' }), {
      success: true,
      data: { ...conversation('owned'), title: 'Updated' },
    }],
    ['DELETE', '/admin/editor-ai/conversations/owned', undefined, { success: true }],
    ['POST', '/admin/editor-ai/conversations/owned/clear', undefined, {
      success: true,
      data: conversation('owned'),
    }],
  ] as const) {
    const response = await app.request(path, { method, headers: AUTH_HEADERS, body })
    assert.equal(response.status, 200)
    assert.deepEqual(await json(response), expected)
  }

  assert.deepEqual(repository.calls.map(({ method, userId }) => ({ method, userId })), [
    { method: 'createConversation', userId: 'user-a' },
    { method: 'listConversations', userId: 'user-a' },
    { method: 'getConversationWithMessages', userId: 'user-a' },
    { method: 'updateConversation', userId: 'user-a' },
    { method: 'deleteConversation', userId: 'user-a' },
    { method: 'clearConversation', userId: 'user-a' },
  ])
  const createInput = repository.calls[0]?.args[0]
  assert.equal(createInput && 'owner' in (createInput as object), false)
  assert.deepEqual(repository.calls[1]?.args, ['story:1'])
}

async function testEmptyConversationListEnvelope() {
  const { app, repository } = createFixture({ listResponse: [] })
  const response = await app.request('/admin/editor-ai/conversations', {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await json(response), { success: true, data: [] })
  assert.deepEqual(repository.calls, [{
    method: 'listConversations',
    userId: 'user-a',
    args: [undefined],
  }])
}

async function testNeutralNotFoundResponses() {
  for (const id of INACCESSIBLE_IDS) {
    const { app } = createFixture()
    const response = await app.request(`/admin/editor-ai/conversations/${id}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    })
    assert.equal(response.status, 404)
    assert.deepEqual(await json(response), { error: 'Conversation not found' })
  }

  for (const id of INACCESSIBLE_IDS) {
    for (const [method, suffix, body] of [
      ['PATCH', '', JSON.stringify({ title: 'stolen' })],
      ['DELETE', '', undefined],
      ['POST', '/clear', undefined],
    ] as const) {
      const { app } = createFixture()
      const response = await app.request(`/admin/editor-ai/conversations/${id}${suffix}`, {
        method, headers: AUTH_HEADERS, body,
      })
      assert.equal(response.status, 404)
      assert.deepEqual(await json(response), { error: 'Conversation not found' })
    }
  }
}

async function testMessagesRequireOwnedConversation() {
  for (const id of INACCESSIBLE_IDS) {
    const inaccessible = createFixture()
    const hidden = await inaccessible.app.request(`/admin/editor-ai/conversations/${id}/messages`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    })
    assert.equal(hidden.status, 404)
    assert.deepEqual(await json(hidden), { error: 'Conversation not found' })
    assert.deepEqual(inaccessible.repository.calls, [{
      method: 'getConversation',
      userId: 'user-a',
      id,
      args: [id],
    }])
    assert.equal(inaccessible.repository.calls.some(({ method }) => method === 'listMessages'), false)
  }

  const owned = createFixture()
  const empty = await owned.app.request('/admin/editor-ai/conversations/owned-empty/messages', {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  assert.equal(empty.status, 200)
  assert.deepEqual(await json(empty), { success: true, data: [] })
  assert.deepEqual(owned.repository.calls.map(({ method, userId }) => ({ method, userId })), [
    { method: 'getConversation', userId: 'user-a' },
    { method: 'listMessages', userId: 'user-a' },
  ])
}

async function testAuthPrecedesAllWork() {
  const { app, counters, repository } = createFixture()
  for (const [path, authorization] of [
    ['/admin/editor-ai/models', undefined],
    ['/admin/editor-ai/upload', 'Bearer malformed'],
    ['/admin/editor-ai/proxy/chat/completions', undefined],
  ] as const) {
    const response = await app.request(path, {
      method: path.includes('models') ? 'GET' : 'POST',
      headers: authorization ? { Authorization: authorization } : undefined,
    })
    assert.equal(response.status, 401)
  }
  assert.equal(repository.calls.length, 0)
  assert.deepEqual(counters, {
    createStream: 0, fetchModels: 0, generateText: 0, generateImage: 0,
    remoteImageFetch: 0, getStorage: 0, saveMessageImage: 0,
  })
}

async function testImageSaverReceivesJwtSubject() {
  const { app, saveMessageImageUsers } = createFixture()
  const response = await app.request('/admin/editor-ai/messages/owned-message/images/save', {
    method: 'POST', headers: AUTH_HEADERS,
    body: JSON.stringify({ imageUrl: '/uploads/generated.png' }),
  })
  assert.equal(response.status, 200)
  assert.deepEqual(saveMessageImageUsers, ['user-a'])
}

async function testOwnedLookupPrecedesGenerationWork() {
  for (const id of INACCESSIBLE_IDS) {
    for (const [path, body] of [
      [`/admin/editor-ai/conversations/${id}/generate-title`, {}],
      ['/admin/editor-ai/generate', { conversationId: id }],
      ['/admin/editor-ai/generate-image', { conversationId: id, prompt: 'secret' }],
    ] as const) {
      const { app, counters, repository } = createFixture()
      const response = await app.request(path, {
        method: 'POST', headers: AUTH_HEADERS, body: JSON.stringify(body),
      })
      assert.equal(response.status, 404)
      assert.deepEqual(await json(response), { error: 'Conversation not found' })
      assert.deepEqual(repository.calls, [{
        method: 'getConversation',
        userId: 'user-a',
        id,
        args: [id],
      }])
      assert.deepEqual(counters, {
        createStream: 0, fetchModels: 0, generateText: 0, generateImage: 0,
        remoteImageFetch: 0, getStorage: 0, saveMessageImage: 0,
      })
    }
  }
}

async function testUnsafeReferenceImageStopsBeforeStorageModelAndMessages() {
  const { app, counters, repository } = createFixture({
    loadRemoteImage: async () => {
      throw new Error('Remote image host must resolve only to public IP addresses')
    },
  })
  const response = await app.request('/admin/editor-ai/generate-image', {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({
      conversationId: 'owned',
      prompt: 'Use this reference',
      images: ['https://metadata.example/latest/meta-data'],
    }),
  })

  assert.equal(response.status, 500)
  assert.match(String((await json(response)).error), /public IP addresses/)
  assert.deepEqual(repository.calls, [{
    method: 'getConversation',
    userId: 'user-a',
    id: 'owned',
    args: ['owned'],
  }])
  assert.deepEqual(counters, {
    createStream: 0,
    fetchModels: 0,
    generateText: 0,
    generateImage: 0,
    remoteImageFetch: 1,
    getStorage: 0,
    saveMessageImage: 0,
  })
}

async function testInlineImageSourcesAreNotPersisted() {
  const { app, counters, repository } = createFixture()
  const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
  const response = await app.request('/admin/editor-ai/generate', {
    method: 'POST', headers: AUTH_HEADERS,
    body: JSON.stringify({ conversationId: 'owned', images: [dataUrl], prompt: 'Use it' }),
  })
  assert.equal(response.status, 200)
  assert.equal(counters.createStream, 1)
  const userAppend = repository.calls.find(({ method }) => method === 'appendMessage')
  const input = userAppend?.args[0] as EditorAiMessageAppendInput
  assert.equal(JSON.stringify(input.metadata).includes('data:image/'), false)
}

async function testNoIdRoutesDoNotLookupOwnership() {
  const models = createFixture()
  const response = await models.app.request('/admin/editor-ai/models', {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  assert.equal(response.status, 200)
  assert.equal(models.counters.fetchModels, 1)
  assert.equal(models.repository.calls.length, 0)

  const upload = createFixture()
  const uploadResponse = await upload.app.request('/admin/editor-ai/upload', {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` },
    body: new FormData(),
  })
  assert.equal(uploadResponse.status, 400)
  assert.equal(upload.repository.calls.length, 0)
  assert.equal(upload.counters.getStorage, 0)
}

async function testAppendMessageEndpoint() {
  const { app, repository } = createFixture()
  const body = {
    role: 'assistant',
    content: '',
    status: 'streaming',
    model: 'openai:gpt-5.6',
    action: 'direct_edit',
  }
  const response = await app.request('/admin/editor-ai/conversations/owned/messages', {
    method: 'POST', headers: AUTH_HEADERS, body: JSON.stringify(body),
  })
  assert.equal(response.status, 201)
  assert.deepEqual(await json(response), {
    success: true,
    data: {
      id: 'message', conversationId: 'owned', ...body,
      createdAt: '2026-07-12T00:00:00.000Z',
    },
  })
  assert.deepEqual(repository.calls, [{
    method: 'appendMessage', userId: 'user-a', id: 'owned',
    args: [{ conversationId: 'owned', ...body }],
  }])

  for (const status of ['pending', 'streaming', 'completed', 'failed', 'stopped'] as const) {
    const fixture = createFixture()
    const statusResponse = await fixture.app.request('/admin/editor-ai/conversations/owned/messages', {
      method: 'POST', headers: AUTH_HEADERS,
      body: JSON.stringify({ role: 'user', content: 'status', status }),
    })
    assert.equal(statusResponse.status, 201)
    assert.equal(((await json(statusResponse)).data as { status: string }).status, status)
  }
}

async function testAppendMessageValidationAndOwnership() {
  for (const body of [
    { role: 'assistant', content: '', conversationId: 'owned-by-b' },
    { role: 'tool', content: '' },
    { role: 'assistant', content: 'x'.repeat(200_001) },
    { role: 'assistant', content: '', metadata: { image: 'data:image/png;base64,AA==' } },
    { role: 'assistant', content: '', metadata: { note: 'x'.repeat(300_000) } },
  ]) {
    const { app, repository } = createFixture()
    const response = await app.request('/admin/editor-ai/conversations/owned/messages', {
      method: 'POST', headers: AUTH_HEADERS, body: JSON.stringify(body),
    })
    assert.equal(response.status, 400)
    assert.equal(repository.calls.length, 0)
  }

  for (const id of INACCESSIBLE_IDS) {
    const { app } = createFixture()
    const response = await app.request(`/admin/editor-ai/conversations/${id}/messages`, {
      method: 'POST', headers: AUTH_HEADERS,
      body: JSON.stringify({ role: 'user', content: 'hidden' }),
    })
    assert.equal(response.status, 404)
    assert.deepEqual(await json(response), { error: 'Conversation not found' })
  }
}

async function testFinishMessageEndpointAndValidation() {
  for (const input of [
    {
      status: 'completed', content: 'Applied 3 changes.', model: 'openai:gpt-5.6',
      metadata: COMPLETED_TASK_METADATA,
    },
    { status: 'failed', content: 'partial', error: 'provider error' },
    { status: 'stopped', error: 'Stopped by user' },
  ] as const) {
    const { app, repository } = createFixture()
    const response = await app.request('/admin/editor-ai/messages/owned-message/finish', {
      method: 'POST', headers: AUTH_HEADERS, body: JSON.stringify(input),
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await json(response), {
      success: true,
      data: {
        id: 'owned-message', conversationId: 'owned', role: 'assistant',
        content: 'content' in input ? input.content : '', status: input.status,
        ...('model' in input ? { model: input.model } : {}),
        ...('metadata' in input ? { metadata: input.metadata } : {}),
        ...('error' in input ? { error: input.error } : {}),
        createdAt: '2026-07-12T00:00:00.000Z',
      },
    })
    assert.deepEqual(repository.calls, [{
      method: 'finishMessage', userId: 'user-a', id: 'owned-message',
      args: ['owned-message', input],
    }])
  }

  for (const input of [
    { status: 'completed' },
    { status: 'completed', content: '', error: 'extra' },
    { status: 'failed' },
    { status: 'stopped', error: '   ' },
    { status: 'failed', error: 'x', extra: true },
    { status: 'completed', content: 'x'.repeat(200_001) },
    { status: 'failed', error: 'x'.repeat(4_001) },
    { status: 'completed', content: '', metadata: { image: 'data:image/png;base64,AA==' } },
    { status: 'completed', content: '', metadata: { note: 'x'.repeat(300_000) } },
  ]) {
    const { app, repository } = createFixture()
    const response = await app.request('/admin/editor-ai/messages/owned-message/finish', {
      method: 'POST', headers: AUTH_HEADERS, body: JSON.stringify(input),
    })
    assert.equal(response.status, 400)
    assert.equal(repository.calls.length, 0)
  }
}

async function testTaskStateEndpoint() {
  const { app, repository } = createFixture()
  for (const state of ['undone', 'redone', 'applied'] as const) {
    const before = structuredClone(repository.taskMetadata.get('owned-task')) as typeof COMPLETED_TASK_METADATA
    const response = await app.request('/admin/editor-ai/messages/owned-task/task-state', {
      method: 'PATCH', headers: AUTH_HEADERS, body: JSON.stringify({ state }),
    })
    assert.equal(response.status, 200)
    const result = (await json(response)).data as { metadata: typeof COMPLETED_TASK_METADATA }
    const expected = structuredClone(before)
    expected.task.changeSet.state = state
    assert.deepEqual(result.metadata, expected)
  }

  for (const id of ['malformed-task', 'noncompleted-task', 'non-task']) {
    const fixture = createFixture()
    const response = await fixture.app.request(`/admin/editor-ai/messages/${id}/task-state`, {
      method: 'PATCH', headers: AUTH_HEADERS, body: JSON.stringify({ state: 'undone' }),
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await json(response), { error: 'Invalid editor AI message metadata' })
  }
  for (const body of [{ state: 'invalid' }, { state: 'undone', extra: true }]) {
    const fixture = createFixture()
    const response = await fixture.app.request('/admin/editor-ai/messages/owned-task/task-state', {
      method: 'PATCH', headers: AUTH_HEADERS, body: JSON.stringify(body),
    })
    assert.equal(response.status, 400)
    assert.equal(fixture.repository.calls.length, 0)
  }
}

async function testMessageMutationNotFoundResponses() {
  for (const id of ['missing', 'message-owned-by-b', 'message-legacy-null']) {
    for (const [method, suffix, body] of [
      ['POST', '/finish', { status: 'completed', content: 'hidden' }],
      ['PATCH', '/task-state', { state: 'undone' }],
    ] as const) {
      const { app } = createFixture()
      const response = await app.request(`/admin/editor-ai/messages/${id}${suffix}`, {
        method, headers: AUTH_HEADERS, body: JSON.stringify(body),
      })
      assert.equal(response.status, 404)
      assert.deepEqual(await json(response), { error: 'Message not found' })
    }
  }
}

async function testImageSavePreflight() {
  for (const id of ['missing', 'message-owned-by-b', 'message-legacy-null']) {
    const { app, counters, repository } = createFixture()
    const response = await app.request(`/admin/editor-ai/messages/${id}/images/save`, {
      method: 'POST', headers: AUTH_HEADERS,
      body: JSON.stringify({ imageUrl: 'https://remote.example/image.png' }),
    })
    assert.equal(response.status, 404)
    assert.deepEqual(await json(response), { error: 'Message not found' })
    assert.deepEqual(repository.calls, [{ method: 'hasMessage', userId: 'user-a', id, args: [id] }])
    assert.equal(counters.saveMessageImage, 0)
    assert.equal(counters.getStorage, 0)
    assert.equal(counters.remoteImageFetch, 0)
  }

  const owned = createFixture()
  const response = await owned.app.request('/admin/editor-ai/messages/owned-message/images/save', {
    method: 'POST', headers: AUTH_HEADERS,
    body: JSON.stringify({ imageUrl: 'data:image/png;base64,AA==' }),
  })
  assert.equal(response.status, 200)
  assert.deepEqual(owned.saveMessageImageUsers, ['user-a'])
  assert.deepEqual(owned.repository.calls, [{
    method: 'hasMessage', userId: 'user-a', id: 'owned-message', args: ['owned-message'],
  }])
}

async function main() {
  await loadEditorAiRouterFactory()
  await testCrudUsesJwtSubject()
  await testEmptyConversationListEnvelope()
  await testNeutralNotFoundResponses()
  await testMessagesRequireOwnedConversation()
  await testAuthPrecedesAllWork()
  await testImageSaverReceivesJwtSubject()
  await testOwnedLookupPrecedesGenerationWork()
  await testUnsafeReferenceImageStopsBeforeStorageModelAndMessages()
  await testInlineImageSourcesAreNotPersisted()
  await testNoIdRoutesDoNotLookupOwnership()
  await testAppendMessageEndpoint()
  await testAppendMessageValidationAndOwnership()
  await testFinishMessageEndpointAndValidation()
  await testTaskStateEndpoint()
  await testMessageMutationNotFoundResponses()
  await testImageSavePreflight()

  console.log('editor-ai route tests passed')
}

void main()
