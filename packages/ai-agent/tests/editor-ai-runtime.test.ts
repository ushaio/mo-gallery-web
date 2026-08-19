import assert from 'node:assert/strict'

import { MockLanguageModelV4, simulateReadableStream } from 'ai/test'

import * as publicApi from '../src/index'
import { runEditorAgentWithRuntime } from '../src/agent'
import { toOpenAiChatMessages } from '../src/prompt'
import { createEditorDocumentSnapshot } from '../src/domain/document'
import { getTextReplacementOperation } from '../src/domain/proposals'
import { VercelAiEditorAgentRuntime } from '../src/runtime/vercel-ai/editor-agent'
import { toVercelAiModelInput } from '../src/runtime/vercel-ai/messages'
import { streamVercelAiText } from '../src/runtime/vercel-ai/text'
import {
  reduceEditorAiTrace,
  type EditorAiStreamEvent,
  type EditorAiTraceBlock,
} from '../src/stream'

type MockStreamPart = Awaited<ReturnType<MockLanguageModelV4['doStream']>>['stream'] extends ReadableStream<infer Part>
  ? Part
  : never
type MockCallOptions = Parameters<MockLanguageModelV4['doStream']>[0]

const usage = {
  inputTokens: {
    total: 3,
    noCache: 1,
    cacheRead: 2,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 10,
    text: 10,
    reasoning: undefined,
  },
}

function finish(unified: 'stop' | 'tool-calls'): MockStreamPart {
  return {
    type: 'finish',
    finishReason: { unified, raw: undefined },
    usage,
  }
}

function mockModel(
  responses: MockStreamPart[][],
  onCall?: (options: MockCallOptions) => void,
): MockLanguageModelV4 {
  let callIndex = 0
  return new MockLanguageModelV4({
    doStream: async (options) => {
      onCall?.(options)
      const chunks = responses[callIndex]
      callIndex += 1
      if (!chunks) throw new Error(`Unexpected model call ${callIndex}`)
      return {
        stream: simulateReadableStream({ chunks, initialDelayInMs: null }),
      }
    },
  })
}

async function test(name: string, run: () => void | Promise<void>): Promise<void> {
  await run()
  console.log(`✓ ${name}`)
}

await test('exports both editor agent runtime paths from the package root', () => {
  assert.equal(typeof publicApi.runEditorAgent, 'function')
  assert.equal(typeof publicApi.runEditorAgentWithRuntime, 'function')
  assert.equal(typeof publicApi.runDirectEditAgent, 'function')
  assert.equal(typeof publicApi.runDirectEditAgentWithRuntime, 'function')
})

await test('converts project messages at the Vercel AI SDK boundary', () => {
  const input = toVercelAiModelInput([
    { role: 'system', text: 'system one' },
    { role: 'system', text: 'system two' },
    {
      role: 'user',
      text: 'describe image',
      images: ['data:image/png;base64,QUJD'],
    },
    { role: 'assistant', text: 'done' },
  ])

  assert.equal(input.instructions, 'system one\n\nsystem two')
  assert.equal(input.messages.length, 2)
  const user = input.messages[0]
  assert.equal(user.role, 'user')
  assert.ok(Array.isArray(user.content))
  if (Array.isArray(user.content)) {
    assert.equal(user.content[1]?.type, 'file')
    if (user.content[1]?.type === 'file') {
      assert.equal(user.content[1].mediaType, 'image/png')
    }
  }
})

await test('preserves ordered explicit content before legacy images at both adapter boundaries', () => {
  const messages = [{
    role: 'user' as const,
    text: 'primary context',
    content: [
      { type: 'text' as const, text: 'mapping one' },
      { type: 'file' as const, dataUrl: 'data:image/png;base64,ONE', mediaType: 'image/png' },
      { type: 'text' as const, text: 'mapping two' },
      { type: 'file' as const, dataUrl: 'data:image/webp;base64,TWO', mediaType: 'image/webp' },
    ],
    images: ['data:image/jpeg;base64,LEGACY'],
  }]

  const vercel = toVercelAiModelInput(messages).messages[0]
  assert.equal(vercel.role, 'user')
  assert.ok(Array.isArray(vercel.content))
  if (Array.isArray(vercel.content)) {
    assert.deepEqual(vercel.content.map((part) => part.type), ['text', 'text', 'file', 'text', 'file', 'file'])
    assert.equal(vercel.content[0]?.type === 'text' ? vercel.content[0].text : '', 'primary context')
    assert.equal(vercel.content[2]?.type === 'file' ? vercel.content[2].mediaType : '', 'image/png')
    assert.equal(vercel.content[4]?.type === 'file' ? vercel.content[4].mediaType : '', 'image/webp')
  }

  const openAi = toOpenAiChatMessages(messages)[0]
  assert.ok(Array.isArray(openAi.content))
  if (Array.isArray(openAi.content)) {
    assert.deepEqual(openAi.content.map((part) => part.type), ['text', 'text', 'image_url', 'text', 'image_url', 'image_url'])
    assert.equal(openAi.content.filter((part) => part.type === 'text' && part.text === 'primary context').length, 1)
    assert.deepEqual(openAi.content.filter((part) => part.type === 'image_url').map((part) => part.image_url.url), [
      'data:image/png;base64,ONE',
      'data:image/webp;base64,TWO',
      'data:image/jpeg;base64,LEGACY',
    ])
  }
})

await test('deduplicates only the canonical leading primary text at both adapter boundaries', () => {
  const messages = [{
    role: 'user' as const,
    text: 'primary',
    content: [
      { type: 'text' as const, text: 'primary' },
      { type: 'text' as const, text: 'secondary' },
      { type: 'text' as const, text: 'primary' },
    ],
  }]

  const vercel = toVercelAiModelInput(messages).messages[0]
  assert.equal(vercel.role, 'user')
  assert.ok(Array.isArray(vercel.content))
  if (Array.isArray(vercel.content)) {
    assert.deepEqual(vercel.content, [
      { type: 'text', text: 'primary' },
      { type: 'text', text: 'secondary' },
      { type: 'text', text: 'primary' },
    ])
  }

  const openAi = toOpenAiChatMessages(messages)[0]
  assert.deepEqual(openAi, {
    role: 'user',
    content: [
      { type: 'text', text: 'primary' },
      { type: 'text', text: 'secondary' },
      { type: 'text', text: 'primary' },
    ],
  })
})

await test('preserves assistant multipart content and legacy images at both adapter boundaries', () => {
  const messages = [{
    role: 'assistant' as const,
    text: 'primary',
    content: [
      { type: 'text' as const, text: 'primary' },
      { type: 'text' as const, text: 'detail' },
      { type: 'file' as const, dataUrl: 'data:image/png;base64,EXPLICIT', mediaType: 'image/png' },
    ],
    images: ['data:image/webp;base64,LEGACY'],
  }]

  const vercel = toVercelAiModelInput(messages).messages[0]
  assert.equal(vercel.role, 'assistant')
  assert.ok(Array.isArray(vercel.content))
  if (Array.isArray(vercel.content)) {
    assert.deepEqual(vercel.content.map((part) => part.type), ['text', 'text', 'file', 'file'])
    assert.deepEqual(vercel.content.filter((part) => part.type === 'text').map((part) => part.text), ['primary', 'detail'])
    assert.deepEqual(vercel.content.filter((part) => part.type === 'file').map((part) => part.mediaType), ['image/png', 'image/webp'])
    assert.deepEqual(vercel.content.filter((part) => part.type === 'file').map((part) => String(part.data)), [
      'data:image/png;base64,EXPLICIT',
      'data:image/webp;base64,LEGACY',
    ])
  }

  const openAi = toOpenAiChatMessages(messages)[0]
  assert.ok(Array.isArray(openAi.content))
  if (Array.isArray(openAi.content)) {
    assert.deepEqual(openAi.content.map((part) => part.type), ['text', 'text', 'image_url', 'image_url'])
    assert.deepEqual(openAi.content.filter((part) => part.type === 'text').map((part) => part.text), ['primary', 'detail'])
    assert.deepEqual(openAi.content.filter((part) => part.type === 'image_url').map((part) => part.image_url.url), [
      'data:image/png;base64,EXPLICIT',
      'data:image/webp;base64,LEGACY',
    ])
  }
})

await test('keeps legacy text-only and system messages compatible', () => {
  assert.deepEqual(toOpenAiChatMessages([{ role: 'user', text: 'plain' }]), [{ role: 'user', content: 'plain' }])
  const legacyImageMessage = { role: 'user' as const, text: '', images: ['data:image/png;base64,LEGACY'] }
  const legacyVercel = toVercelAiModelInput([legacyImageMessage]).messages[0]
  assert.equal(legacyVercel.role, 'user')
  assert.ok(Array.isArray(legacyVercel.content))
  if (Array.isArray(legacyVercel.content)) {
    assert.deepEqual(legacyVercel.content.map((part) => part.type), ['text', 'file'])
    assert.equal(legacyVercel.content[0]?.type === 'text' ? legacyVercel.content[0].text : undefined, '')
  }
  assert.deepEqual(toOpenAiChatMessages([legacyImageMessage]), [{
    role: 'user',
    content: [
      { type: 'text', text: '' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,LEGACY', detail: 'auto' } },
    ],
  }])
  const systemMessage = { role: 'system' as const, text: 'instructions', content: [{ type: 'file' as const, dataUrl: 'data:image/png;base64,DROP', mediaType: 'image/png' }], images: ['data:image/webp;base64,DROP'] }
  assert.deepEqual(toOpenAiChatMessages([systemMessage]), [{ role: 'system', content: 'instructions' }])
  const input = toVercelAiModelInput([systemMessage])
  assert.equal(input.instructions, 'instructions')
  assert.deepEqual(input.messages, [])
})

await test('streams text through the project-owned generation API', async () => {
  let callOptions: MockCallOptions | undefined
  const model = mockModel([[
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: 'Hello' },
    { type: 'text-delta', id: 'text-1', delta: ' world' },
    { type: 'text-end', id: 'text-1' },
    finish('stop'),
  ]], options => { callOptions = options })
  const chunks: string[] = []
  const usages: publicApi.EditorAiUsage[] = []

  const text = await streamVercelAiText({
    endpoint: { baseURL: 'http://localhost/v1' },
    model: 'mock-model',
    messages: [{ role: 'user', text: 'hello' }],
    temperature: 0.2,
    reasoningEffort: 'high',
    languageModel: model,
    onChunk: (chunk) => chunks.push(chunk),
    onUsage: value => usages.push(value),
  })

  assert.equal(text, 'Hello world')
  assert.deepEqual(chunks, ['Hello', ' world'])
  assert.equal(callOptions?.providerOptions?.['mo-gallery']?.reasoningEffort, 'high')
  assert.deepEqual(usages, [{
    inputTokens: 3,
    outputTokens: 10,
    reasoningTokens: undefined,
    cacheReadTokens: 2,
  }])
})

await test('exposes reasoning and tool lifecycle events without replacing text streaming', async () => {
  const model = mockModel([[
    { type: 'reasoning-start', id: 'reason-1' },
    { type: 'reasoning-delta', id: 'reason-1', delta: '先检查工具' },
    { type: 'tool-input-start', id: 'tool-1', toolName: 'lookup' },
    { type: 'tool-input-delta', id: 'tool-1', delta: '{"q":"x"}' },
    { type: 'tool-input-end', id: 'tool-1' },
    { type: 'tool-call', toolCallId: 'tool-1', toolName: 'lookup', input: '{"q":"x"}', dynamic: true },
    { type: 'tool-result', toolCallId: 'tool-1', toolName: 'lookup', result: 'ok', dynamic: true },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: '完成' },
    { type: 'text-end', id: 'text-1' },
    finish('stop'),
  ]])
  const events: EditorAiStreamEvent[] = []
  const text = await streamVercelAiText({
    endpoint: { baseURL: 'http://localhost/v1' },
    model: 'mock-model',
    messages: [{ role: 'user', text: 'hello' }],
    temperature: 0.2,
    languageModel: model,
    onChunk: () => {},
    onEvent: event => events.push(event),
  })

  assert.equal(text, '完成')
  assert.deepEqual(events.map(event => event.type), [
    'response-start', 'reasoning-delta', 'tool-input-start', 'tool-input-delta', 'tool-call', 'tool-error', 'tool-result', 'text-delta', 'response-end',
  ])
  const trace = events.reduce<EditorAiTraceBlock[]>(
    (blocks, event) => reduceEditorAiTrace(blocks, event),
    [],
  )
  assert.deepEqual(trace, [
    { type: 'reasoning', id: 'reason-1', text: '先检查工具' },
    {
      type: 'tool', id: 'tool-1', name: 'lookup', status: 'completed',
      inputText: '{"q":"x"}', input: { q: 'x' }, output: 'ok',
    },
    { type: 'text', id: 'text-1', text: '完成' },
  ])
})

await test('exposes a waiting activity until the first model output arrives', () => {
  const waiting = reduceEditorAiTrace([], { type: 'response-start', id: 'response-1' })
  assert.deepEqual(waiting, [{ type: 'activity', id: 'response-1', status: 'waiting' }])

  const responding = reduceEditorAiTrace(waiting, { type: 'text-delta', id: 'text-1', text: '开始回复' })
  assert.deepEqual(responding, [{ type: 'text', id: 'text-1', text: '开始回复' }])

  const ended = reduceEditorAiTrace(waiting, { type: 'response-end', id: 'response-1' })
  assert.deepEqual(ended, [])
})

await test('legacy proposal runtime emits proposals and approval requests', async () => {
  const model = mockModel([
    [
      {
        type: 'tool-call',
        toolCallId: 'read-1',
        toolName: 'read_document',
        input: '{}',
      },
      finish('tool-calls'),
    ],
    [
      {
        type: 'tool-call',
        toolCallId: 'edit-1',
        toolName: 'propose_edit',
        input: JSON.stringify({
          originalText: '第二段。',
          newText: '改写后的第二段。',
          reason: '提升叙事节奏',
          confidence: 0.9,
        }),
      },
      finish('tool-calls'),
    ],
    [
      { type: 'text-start', id: 'summary-1' },
      { type: 'text-delta', id: 'summary-1', delta: '已完成一处节奏优化。' },
      { type: 'text-end', id: 'summary-1' },
      finish('stop'),
    ],
  ])
  const document = createEditorDocumentSnapshot({ text: '第一段。\n第二段。' })
  const runtime = new VercelAiEditorAgentRuntime({
    endpoint: { baseURL: 'http://localhost/v1' },
    model: 'mock-model',
    languageModel: model,
  })
  const events: Array<{ type: string; request?: { message?: string } }> = []

  const result = await runEditorAgentWithRuntime({
    endpoint: { baseURL: 'http://localhost/v1' },
    model: 'mock-model',
    instruction: '优化第二段',
    document,
    taskId: 'task-1',
    onEvent: (event) => events.push(event),
  }, runtime)

  assert.equal(result.summary, '已完成一处节奏优化。')
  assert.equal(result.taskId, 'task-1')
  assert.equal(result.documentRevision, document.revision)
  assert.equal(result.proposals.length, 1)
  assert.ok(events.some((event) => event.type === 'tool_started'))
  assert.ok(events.some((event) => event.type === 'tool_completed'))
  assert.ok(events.some((event) => event.type === 'proposal_created'))
  assert.ok(events.some((event) => event.type === 'approval_required'))
  const approval = events.find((event) => event.type === 'approval_required')
  assert.equal(approval?.request?.message, 'Review and approve this proposed edit before applying it.')
  assert.equal(approval?.request?.message?.includes('\uFFFD'), false)
  const proposal = result.proposals[0]
  assert.equal(proposal.baseRevision, document.revision)
  assert.equal(proposal.reason, '提升叙事节奏')
  const operation = getTextReplacementOperation(proposal)
  assert.equal(operation?.match.text, '第二段。')
  assert.equal(operation?.replacement, '改写后的第二段。')
})

await test('legacy proposal runtime rejects ambiguous text without proposals', async () => {
  const model = mockModel([
    [
      {
        type: 'tool-call',
        toolCallId: 'edit-duplicate',
        toolName: 'propose_edit',
        input: JSON.stringify({ originalText: '重复', newText: '替换' }),
      },
      finish('tool-calls'),
    ],
    [
      { type: 'text-start', id: 'summary-2' },
      { type: 'text-delta', id: 'summary-2', delta: '无法唯一定位原文。' },
      { type: 'text-end', id: 'summary-2' },
      finish('stop'),
    ],
  ])
  const runtime = new VercelAiEditorAgentRuntime({
    endpoint: { baseURL: 'http://localhost/v1' },
    model: 'mock-model',
    languageModel: model,
  })
  const toolOutputs: unknown[] = []

  const result = await runEditorAgentWithRuntime({
    endpoint: { baseURL: 'http://localhost/v1' },
    model: 'mock-model',
    instruction: '替换重复内容',
    document: createEditorDocumentSnapshot({ text: '重复\n重复' }),
    onEvent: (event) => {
      if (event.type === 'tool_completed') toolOutputs.push(event.output)
    },
  }, runtime)

  assert.equal(result.proposals.length, 0)
  assert.deepEqual(toolOutputs[0], {
    ok: false,
    error: {
      code: 'text_not_unique',
      message: '原文片段在文档中出现多次，请扩大引用范围直到可以唯一定位。',
    },
  })
})

await test('legacy proposal runtime rejects overlapping proposals', async () => {
  const model = mockModel([
    [
      {
        type: 'tool-call',
        toolCallId: 'edit-overlap-1',
        toolName: 'propose_edit',
        input: JSON.stringify({ originalText: '第二段', newText: '新的第二段' }),
      },
      finish('tool-calls'),
    ],
    [
      {
        type: 'tool-call',
        toolCallId: 'edit-overlap-2',
        toolName: 'propose_edit',
        input: JSON.stringify({
          originalText: '一段。\n第二',
          newText: '跨段替换',
        }),
      },
      finish('tool-calls'),
    ],
    [
      { type: 'text-start', id: 'summary-overlap' },
      { type: 'text-delta', id: 'summary-overlap', delta: '已保留一条非重叠提案。' },
      { type: 'text-end', id: 'summary-overlap' },
      finish('stop'),
    ],
  ])
  const runtime = new VercelAiEditorAgentRuntime({
    endpoint: { baseURL: 'http://localhost/v1' },
    model: 'mock-model',
    languageModel: model,
  })
  const outputs: unknown[] = []

  const result = await runEditorAgentWithRuntime({
    endpoint: { baseURL: 'http://localhost/v1' },
    model: 'mock-model',
    instruction: '检查重叠修改',
    document: createEditorDocumentSnapshot({ text: '第一段。\n第二段。' }),
    onEvent: (event) => {
      if (event.type === 'tool_completed' && event.toolName === 'propose_edit') {
        outputs.push(event.output)
      }
    },
  }, runtime)

  assert.equal(result.proposals.length, 1)
  assert.equal((outputs[1] as { error?: { code?: string } }).error?.code, 'overlapping_edit')
})

await test('legacy proposal runtime maps an already-aborted task to AbortError', async () => {
  const controller = new AbortController()
  controller.abort('用户停止生成')
  const runtime = new VercelAiEditorAgentRuntime({
    endpoint: { baseURL: 'http://localhost/v1' },
    model: 'mock-model',
    languageModel: mockModel([]),
  })

  await assert.rejects(
    runEditorAgentWithRuntime({
      endpoint: { baseURL: 'http://localhost/v1' },
      model: 'mock-model',
      instruction: '检查文档',
      document: createEditorDocumentSnapshot({ text: '正文' }),
      signal: controller.signal,
    }, runtime),
    (error: unknown) => error instanceof Error && error.name === 'AbortError',
  )
})
