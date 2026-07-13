import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import type { EditorAiMessageMetadata } from '@mo-gallery/ai-agent'

import type {
  EditorAiMessageAppendInput,
  EditorAiMessageDto,
  EditorAiMessageFinishInput,
  StoryAiModelOption,
} from '../src/lib/api/types'
const storyAiServer = await (async () => {
  const require = createRequire(import.meta.url)
  const serverOnlyPath = require.resolve('server-only')
  const cachedServerOnly = require.cache[serverOnlyPath]
  const serverOnlyStub = new Module(serverOnlyPath)
  serverOnlyStub.filename = serverOnlyPath
  serverOnlyStub.loaded = true
  serverOnlyStub.exports = {}
  require.cache[serverOnlyPath] = serverOnlyStub
  try {
    return await import('../server/lib/story-ai')
  } finally {
    if (cachedServerOnly) require.cache[serverOnlyPath] = cachedServerOnly
    else delete require.cache[serverOnlyPath]
  }
})()
const {
  fetchStoryAiModels,
  parseStoryAiModelCapabilityConfig,
  resolveStoryAiModelCapabilities,
} = storyAiServer

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false
type Expect<Value extends true> = Value

type MessageRoleIsExact = Expect<Equal<
  EditorAiMessageDto['role'],
  'system' | 'user' | 'assistant'
>>
type MessageStatusIsExact = Expect<Equal<
  EditorAiMessageDto['status'],
  'pending' | 'streaming' | 'completed' | 'failed' | 'stopped'
>>
type MessageMetadataUsesSharedContract = Expect<Equal<
  EditorAiMessageDto['metadata'],
  EditorAiMessageMetadata | undefined
>>
type AppendInputOmitsConversationId = Expect<Equal<
  'conversationId' extends keyof EditorAiMessageAppendInput ? true : false,
  false
>>
void (null as unknown as MessageRoleIsExact)
void (null as unknown as MessageStatusIsExact)
void (null as unknown as MessageMetadataUsesSharedContract)
void (null as unknown as AppendInputOmitsConversationId)

const stopped: EditorAiMessageDto['status'] = 'stopped'
const appendInput: EditorAiMessageAppendInput = {
  role: 'assistant',
  content: '',
  status: 'streaming',
}
const finishInput: EditorAiMessageFinishInput = {
  status: 'stopped',
  error: 'Stopped by user',
}
const completedFinishInput: EditorAiMessageFinishInput = {
  status: 'completed',
  content: 'Completed response',
}
// @ts-expect-error completed messages require content
const completedWithoutContent: EditorAiMessageFinishInput = { status: 'completed' }
// @ts-expect-error failed messages require an error
const failedWithoutError: EditorAiMessageFinishInput = { status: 'failed' }
// @ts-expect-error stopped messages require an error
const stoppedWithoutError: EditorAiMessageFinishInput = { status: 'stopped' }
const model: StoryAiModelOption = {
  id: 'openai:gpt-5.6',
  label: 'gpt-5.6',
  capabilities: ['chat'],
  vision: false,
  tools: false,
  structuredOutput: false,
  contextWindow: 8192,
}
void [
  stopped,
  appendInput,
  finishInput,
  completedFinishInput,
  completedWithoutContent,
  failedWithoutError,
  stoppedWithoutError,
  model,
]

const emptyCapabilityConfig = {
  visionModels: new Set<string>(),
  toolModels: new Set<string>(),
  structuredOutputModels: new Set<string>(),
  contextWindows: new Map<string, number>(),
}

assert.deepEqual(
  resolveStoryAiModelCapabilities('unknown-model', emptyCapabilityConfig),
  {
    vision: false,
    tools: false,
    structuredOutput: false,
    contextWindow: 8192,
  },
)

assert.deepEqual(
  resolveStoryAiModelCapabilities('gpt-5.6', {
    visionModels: new Set(['gpt-5.6']),
    toolModels: new Set(['gpt-5.6']),
    structuredOutputModels: new Set(['gpt-5.6']),
    contextWindows: new Map([['gpt-5.6', 128000]]),
  }),
  {
    vision: true,
    tools: true,
    structuredOutput: true,
    contextWindow: 128000,
  },
)

for (const modelId of ['prefix-gpt-5.6', 'gpt-5.6-suffix', 'GPT-5.6']) {
  assert.deepEqual(
    resolveStoryAiModelCapabilities(modelId, {
      visionModels: new Set(['gpt-5.6']),
      toolModels: new Set(['gpt-5.6']),
      structuredOutputModels: new Set(['gpt-5.6']),
      contextWindows: new Map([['gpt-5.6', 128000]]),
    }),
    {
      vision: false,
      tools: false,
      structuredOutput: false,
      contextWindow: 8192,
    },
  )
}

const parsedCapabilityConfig = parseStoryAiModelCapabilityConfig({
  visionModels: ' gpt-5.6, gpt-5.6, vision-only ',
  toolModels: 'gpt-5.6',
  structuredOutputModels: ' gpt-5.6 ',
  contextWindows: '{"gpt-5.6":128000,"vision-only":16384}',
})
assert.deepEqual([...parsedCapabilityConfig.visionModels], ['gpt-5.6', 'vision-only'])
assert.deepEqual([...parsedCapabilityConfig.toolModels], ['gpt-5.6'])
assert.deepEqual([...parsedCapabilityConfig.structuredOutputModels], ['gpt-5.6'])
assert.deepEqual([...parsedCapabilityConfig.contextWindows], [
  ['gpt-5.6', 128000],
  ['vision-only', 16384],
])

for (const contextWindows of [
  '{',
  'null',
  '[]',
  '{"":8192}',
  '{"model":"8192"}',
  '{"model":8192.5}',
  '{"model":0}',
  '{"model":-1}',
]) {
  assert.throws(
    () => parseStoryAiModelCapabilityConfig({ contextWindows }),
    /AI_MODEL_CONTEXT_WINDOWS/,
  )
}

const capabilityEnvKeys = [
  'AI_BASE_URL',
  'AI_API_KEY',
  'AI_MODEL',
  'AI_IMAGE_MODEL',
  'AI_IMAGE_MODELS',
  'AI_VISION_MODELS',
  'AI_TOOL_MODELS',
  'AI_STRUCTURED_OUTPUT_MODELS',
  'AI_MODEL_CONTEXT_WINDOWS',
] as const
const originalCapabilityEnv = Object.fromEntries(
  capabilityEnvKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof capabilityEnvKeys)[number], string | undefined>
const originalModelFetch = globalThis.fetch

try {
  process.env.AI_BASE_URL = 'https://models.example.test/v1'
  process.env.AI_API_KEY = 'private-model-key'
  process.env.AI_MODEL = 'default-chat'
  process.env.AI_IMAGE_MODEL = 'configured-image'
  process.env.AI_IMAGE_MODELS = ' configured-image, configured-image '
  process.env.AI_VISION_MODELS = 'remote-capable, default-chat, configured-image'
  process.env.AI_TOOL_MODELS = 'remote-capable,default-chat'
  process.env.AI_STRUCTURED_OUTPUT_MODELS = 'remote-capable'
  process.env.AI_MODEL_CONTEXT_WINDOWS = JSON.stringify({
    'remote-capable': 128000,
    'default-chat': 32768,
    'configured-image': 16384,
  })
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: [
      { id: 'remote-capable' },
      { id: 'gpt-image-name' },
    ],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

  const fetchedModels = await fetchStoryAiModels()
  assert.equal(fetchedModels.models.length, 4)
  for (const option of fetchedModels.models) {
    assert.deepEqual(Object.keys(option).toSorted(), [
      'capabilities',
      'contextWindow',
      'id',
      'label',
      'structuredOutput',
      'tools',
      'vision',
    ])
  }

  const modelById = new Map(fetchedModels.models.map((option) => [option.id, option]))
  assert.deepEqual(modelById.get('remote-capable'), {
    id: 'remote-capable',
    label: 'remote-capable',
    capabilities: ['chat'],
    vision: true,
    tools: true,
    structuredOutput: true,
    contextWindow: 128000,
  })
  assert.deepEqual(modelById.get('default-chat'), {
    id: 'default-chat',
    label: 'default-chat (default)',
    capabilities: ['chat'],
    vision: true,
    tools: true,
    structuredOutput: false,
    contextWindow: 32768,
  })
  assert.deepEqual(modelById.get('configured-image'), {
    id: 'configured-image',
    label: 'configured-image',
    capabilities: ['image'],
    vision: true,
    tools: false,
    structuredOutput: false,
    contextWindow: 16384,
  })
  assert.deepEqual(modelById.get('gpt-image-name'), {
    id: 'gpt-image-name',
    label: 'gpt-image-name',
    capabilities: ['image'],
    vision: false,
    tools: false,
    structuredOutput: false,
    contextWindow: 8192,
  })
  assert.doesNotMatch(JSON.stringify(fetchedModels), /private-model-key/)
} finally {
  globalThis.fetch = originalModelFetch
  for (const key of capabilityEnvKeys) {
    const value = originalCapabilityEnv[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

const root = fileURLToPath(new URL('..', import.meta.url))
const schemaPath = `${root}/prisma/schema.prisma`
const migrationPath = `${root}/prisma/migrations/20260711180000_add_ai_conversation_owner/migration.sql`

function modelBlock(schema: string, modelName: string): string {
  const match = schema.match(new RegExp(`model\\s+${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`))
  assert.ok(match, `Expected model ${modelName} in Prisma schema`)
  return match[1]
}

const schema = readFileSync(schemaPath, 'utf8')
const userModel = modelBlock(schema, 'User')
const conversationModel = modelBlock(schema, 'AiConversation')

assert.match(userModel, /\baiConversations\s+AiConversation\[\]/)
assert.match(conversationModel, /^\s*userId\s+String\?\s*$/m)
assert.match(
  conversationModel,
  /^\s*user\s+User\?\s+@relation\(fields:\s*\[userId\],\s*references:\s*\[id\],\s*onDelete:\s*SetNull\)\s*$/m,
)
assert.match(conversationModel, /@@index\(\[userId,\s*scopeId,\s*updatedAt\]\)/)

assert.ok(existsSync(migrationPath), `Expected migration at ${migrationPath}`)
const migration = readFileSync(migrationPath, 'utf8')
const statements = migration.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim()

assert.match(statements, /ALTER TABLE "AiConversation" ADD COLUMN "userId" TEXT;/i)
assert.match(
  statements,
  /CREATE INDEX "AiConversation_userId_scopeId_updatedAt_idx" ON "AiConversation"\s*\("userId",\s*"scopeId",\s*"updatedAt"\);/i,
)
assert.match(
  statements,
  /ADD CONSTRAINT "AiConversation_userId_fkey" FOREIGN KEY \("userId"\) REFERENCES "User"\("id"\) ON DELETE SET NULL ON UPDATE CASCADE;/i,
)
assert.doesNotMatch(statements, /\bUPDATE\s+"?AiConversation"?\b/i)
assert.doesNotMatch(statements, /"userId"[^;]*\bNOT NULL\b/i)
assert.doesNotMatch(statements, /"userId"[^;]*\bDEFAULT\b/i)

const requests: Array<{ url: string; init?: RequestInit }> = []
const originalFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  requests.push({ url: String(input), init })
  return new Response(JSON.stringify({
    success: true,
    data: {
      id: 'message-1',
      conversationId: 'conversation-1',
      role: 'assistant',
      content: '',
      status: 'streaming',
      createdAt: '2026-07-12T00:00:00.000Z',
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

try {
  const storyAiApi = await import('../src/lib/api/story-ai')
  await storyAiApi.appendEditorAiMessage('token', 'conversation/with space', appendInput)
  await storyAiApi.finishEditorAiMessage('token', 'message/with space', finishInput)
  await storyAiApi.updateEditorAiTaskState('token', 'task/with space', 'undone')
} finally {
  globalThis.fetch = originalFetch
}

assert.deepEqual(requests.map(({ url, init }) => ({
  url,
  method: init?.method,
  body: init?.body,
})), [
  {
    url: '/api/admin/editor-ai/conversations/conversation%2Fwith%20space/messages',
    method: 'POST',
    body: JSON.stringify(appendInput),
  },
  {
    url: '/api/admin/editor-ai/messages/message%2Fwith%20space/finish',
    method: 'POST',
    body: JSON.stringify(finishInput),
  },
  {
    url: '/api/admin/editor-ai/messages/task%2Fwith%20space/task-state',
    method: 'PATCH',
    body: JSON.stringify({ state: 'undone' }),
  },
])
assert.equal(Object.hasOwn(JSON.parse(String(requests[0]?.init?.body)), 'conversationId'), false)

console.log('PASS editor AI persistence schema and Web client contracts')
