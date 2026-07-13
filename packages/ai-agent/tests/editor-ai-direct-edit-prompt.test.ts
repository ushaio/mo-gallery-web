import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  EDITOR_AI_ACTION_INSTRUCTIONS,
  EDITOR_AI_SYSTEM_PROMPT,
  buildDirectEditMessages,
  buildEditorAiMessages,
  buildEditorAiUserPrompt,
  buildNarrativeDirectEditMessages,
  buildZineDirectEditMessages,
  createZineDocumentSnapshot,
  toOpenAiChatMessages,
} from '../src/index'
import { toVercelAiModelInput } from '../src/runtime/vercel-ai/messages'

import type {
  DirectEditAgentTask,
  EditorAiChatContentPart,
  NarrativeDocumentSnapshot,
  ResolvedEditorAiCapabilities,
  ZineDocumentSnapshot,
} from '../src/index'

function test(name: string, run: () => void): void {
  try {
    run()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

const VISION: ResolvedEditorAiCapabilities = {
  visualMode: 'vision',
  executionMode: 'direct_edit',
  degradations: [],
}
const STRUCTURE_ONLY: ResolvedEditorAiCapabilities = {
  visualMode: 'structure_only',
  executionMode: 'direct_edit',
  degradations: [{ code: 'vision_unavailable', message: 'No vision' }],
}
const SUGGESTION_ONLY: ResolvedEditorAiCapabilities = {
  visualMode: 'structure_only',
  executionMode: 'suggestion_only',
  degradations: [{ code: 'tool_calling_unavailable', message: 'No tools' }],
}

function narrativeSnapshot(): NarrativeDocumentSnapshot {
  return {
    capability: 'narrative',
    documentId: 'story-42',
    documentKind: 'story',
    title: 'Quiet Light',
    root: {
      type: 'doc',
      metadataMarker: 'data:first',
      plainTextData: 'data:text/plain,ordinary narrative metadata',
      content: [{ type: 'paragraph', dataUrl: 'data:image/png;base64,HIDDEN_ROOT' }],
    },
    nodes: [{
      id: 'node-opening',
      type: 'paragraph',
      index: 0,
      depth: 1,
      text: 'Opening text',
      attrs: { sourceDataUrl: 'data:image/png;base64,ordinary-legacy-metadata' },
      marks: [],
      childIds: [],
    }],
    editorWidth: 960,
    visualSegments: [
      {
        id: 'segment-top',
        image: { id: 'render-top', dataUrl: 'data:image/png;base64,TOP', mediaType: 'image/png', width: 960, height: 400, byteLength: 3 },
        nodeIds: ['node-opening'],
        startY: 0,
        endY: 400,
      },
      {
        id: 'segment-bottom',
        image: { id: 'render-bottom', dataUrl: 'data:image/jpeg;base64,BOTTOM', mediaType: 'image/jpeg', width: 960, height: 500, byteLength: 6 },
        nodeIds: ['node-closing'],
        startY: 400,
        endY: 900,
      },
    ],
    revision: 'narrative-revision-42',
  }
}

function zineSnapshot(): ZineDocumentSnapshot {
  return {
    capability: 'zine',
    projectId: 'project-7',
    targetSpreadId: 'spread-current',
    project: {
      projectId: 'project-7',
      settings: {
        pageWidth: 2400,
        metadataMarker: 'data:first',
        plainTextData: 'data:text/plain,ordinary project metadata',
      },
      spreadOrder: ['spread-left', 'spread-current', 'spread-right'],
      spreadSummaries: { 'spread-current': { title: 'Feature' } },
    },
    currentSpread: {
      spreadId: 'spread-current',
      index: 1,
      structure: { slots: [{ id: 'slot-1', x: 20, y: 30, width: 800, height: 600 }] },
      summary: { slotCount: 1 },
      preview: { id: 'preview-current', dataUrl: 'data:image/png;base64,CURRENT', mediaType: 'image/png', width: 1200, height: 800, byteLength: 7 },
    },
    adjacentSpreads: [
      {
        spreadId: 'spread-left', index: 0, structure: { slots: [] }, summary: { slotCount: 0 },
        preview: { id: 'preview-left', dataUrl: 'data:image/png;base64,LEFT', mediaType: 'image/png', width: 1200, height: 800, byteLength: 4 },
      },
      {
        spreadId: 'spread-right', index: 2, structure: { slots: [] }, summary: { slotCount: 0 },
        preview: { id: 'preview-right', dataUrl: 'data:image/jpeg;base64,RIGHT', mediaType: 'image/jpeg', width: 1200, height: 800, byteLength: 5 },
      },
    ],
    assetCandidates: [
      {
        assetId: 'asset-a', metadata: { width: 6000, height: 4000 },
        thumbnail: { id: 'thumb-a', dataUrl: 'data:image/webp;base64,ASSETA', mediaType: 'image/webp', width: 320, height: 240, byteLength: 6 },
      },
      {
        assetId: 'asset-b', metadata: { width: 5000, height: 3000 },
        thumbnail: { id: 'thumb-b', dataUrl: 'data:image/png;base64,ASSETB', mediaType: 'image/png', width: 320, height: 240, byteLength: 6 },
      },
    ],
    revision: 'zine-revision-7',
  }
}

function narrativeTask(allowDelete = false): DirectEditAgentTask<NarrativeDocumentSnapshot> {
  return {
    id: 'task-narrative',
    taskType: 'instruction',
    instruction: 'Improve the complete story without relying on a selection.',
    snapshot: narrativeSnapshot(),
    authorization: { allowDelete, deleteTargetIds: allowDelete ? ['node-opening'] : [] },
    modelCapabilities: { vision: true, structuredOutput: true, toolCalling: true },
  }
}

function zineTask(taskType: 'instruction' | 'page_audit' = 'page_audit'): DirectEditAgentTask<ZineDocumentSnapshot> {
  return {
    id: 'task-zine',
    taskType,
    instruction: 'Audit and safely improve this spread.',
    snapshot: zineSnapshot(),
    authorization: {
      allowDelete: true,
      deleteTargetIds: ['slot-1'],
      targetSpreadId: 'spread-current',
      projectAssetIds: ['asset-a', 'asset-b'],
    },
    modelCapabilities: { vision: true, structuredOutput: true, toolCalling: true },
  }
}

function parts(messages: ReturnType<typeof buildDirectEditMessages>): readonly EditorAiChatContentPart[] {
  return messages[1]?.content ?? []
}

function fileParts(messages: ReturnType<typeof buildDirectEditMessages>) {
  return parts(messages).filter((part) => part.type === 'file')
}

function allText(messages: ReturnType<typeof buildDirectEditMessages>): string {
  return messages.flatMap((message) => [message.text, ...(message.content ?? []).flatMap((part) => part.type === 'text' ? [part.text] : [])]).join('\n')
}

function structuredContext(messages: ReturnType<typeof buildDirectEditMessages>): Record<string, unknown> {
  const userText = messages.find((message) => message.role === 'user')?.text ?? ''
  const match = userText.match(/<DIRECT_EDIT_CONTEXT_JSON>\n([\s\S]*?)\n<\/DIRECT_EDIT_CONTEXT_JSON>/)
  assert.ok(match, 'expected one tagged structured context payload')
  assert.equal(userText.match(/<DIRECT_EDIT_CONTEXT_JSON>/g)?.length, 1)
  return JSON.parse(match[1]) as Record<string, unknown>
}

function assertNoDataUrlKeys(value: unknown): void {
  if (Array.isArray(value)) value.forEach(assertNoDataUrlKeys)
  if (value && typeof value === 'object') {
    assert.equal(Object.hasOwn(value, 'dataUrl'), false)
    Object.values(value).forEach(assertNoDataUrlKeys)
  }
}

function countOccurrences(value: string, search: string): number {
  return value.split(search).length - 1
}

function assertOrderedVisualParts(
  messages: ReturnType<typeof buildDirectEditMessages>,
  expected: readonly { dataUrl: string; mediaType: string; labelIds: readonly string[] }[],
): void {
  const content = parts(messages)
  assert.equal(content.length, expected.length * 2)
  expected.forEach(({ dataUrl, mediaType, labelIds }, index) => {
    const label = content[index * 2]
    const file = content[index * 2 + 1]
    assert.equal(label?.type, 'text')
    assert.equal(file?.type, 'file')
    if (label?.type === 'text') {
      for (const id of labelIds) assert.equal(countOccurrences(label.text, id), 1)
    }
    if (file?.type === 'file') {
      assert.deepEqual(file, { type: 'file', dataUrl, mediaType })
    }
    assert.equal(fileParts(messages).filter((part) => part.type === 'file' && part.dataUrl === dataUrl).length, 1)
  })
}

test('narrative direct-edit messages encode stable structure and deterministic vision segments', () => {
  const task = narrativeTask()
  const messages = buildNarrativeDirectEditMessages({ task, capabilities: VISION })
  const text = allText(messages)

  assert.deepEqual(messages.map((message) => message.role), ['system', 'user'])
  assert.match(text, /complete current editable structure/i)
  assert.match(text, /stable node IDs/i)
  assert.match(text, /node-relative text offsets/i)
  assert.match(text, /no selection-based assumption/i)
  assert.match(text, /no arbitrary CSS/i)
  assert.match(text, /no whole-document replacement/i)
  assert.match(text, /supported structure and style operations/i)
  assert.match(text, /do not invent nodes, assets, or IDs/i)
  assert.match(text, /delete operations and delete tools are unavailable/i)
  assert.match(text, /story-42/)
  assert.match(text, /narrative-revision-42/)
  assertOrderedVisualParts(messages, [
    { dataUrl: 'data:image/png;base64,TOP', mediaType: 'image/png', labelIds: ['segment-top', 'render-top', 'node-opening'] },
    { dataUrl: 'data:image/jpeg;base64,BOTTOM', mediaType: 'image/jpeg', labelIds: ['segment-bottom', 'render-bottom', 'node-closing'] },
  ])
  assert.match(text, /segment-top.*node-opening/i)
  assert.match(text, /segment-bottom.*node-closing/i)
  assert.equal(text.includes('HIDDEN_ROOT'), false)
  assert.match(text, /data:image\/png;base64,ordinary-legacy-metadata/)
})

test('builders are deterministic and emit one parseable structured snapshot payload', () => {
  for (const [task, build] of [
    [narrativeTask(), buildNarrativeDirectEditMessages],
    [zineTask(), buildZineDirectEditMessages],
  ] as const) {
    const input = { task, capabilities: VISION }
    const first = build(input as never)
    const second = build(input as never)
    assert.deepEqual(first, second)
    assert.deepEqual(first.map(({ role }) => role), ['system', 'user'])
    assert.equal(first.filter(({ role }) => role === 'system').length, 1)
    assert.equal(first.filter(({ role }) => role === 'user').length, 1)

    const context = structuredContext(first)
    assert.equal(context.taskId, task.id)
    assert.equal(context.taskType, task.taskType)
    assert.equal(context.instruction, task.instruction)
    assert.equal(context.revision, task.snapshot.revision)
    assert.deepEqual(context.authorization, task.authorization)
    assert.equal((context.capabilities as { visualMode: string }).visualMode, 'vision')
    assert.equal((context.capabilities as { executionMode: string }).executionMode, 'direct_edit')
    assert.deepEqual(context.target, task.snapshot.capability === 'narrative'
      ? { capability: 'narrative', documentId: 'story-42', documentKind: 'story' }
      : { capability: 'zine', projectId: 'project-7', targetSpreadId: 'spread-current' })
    assertNoDataUrlKeys(context)
  }
})

test('structured projection preserves ordinary data strings and stable image metadata', () => {
  const narrative = structuredContext(buildNarrativeDirectEditMessages({ task: narrativeTask(), capabilities: VISION }))
  const zine = structuredContext(buildZineDirectEditMessages({ task: zineTask(), capabilities: VISION }))
  const narrativeJson = JSON.stringify(narrative)
  const zineJson = JSON.stringify(zine)

  assert.match(narrativeJson, /data:first/)
  assert.match(narrativeJson, /data:text\/plain,ordinary narrative metadata/)
  assert.match(narrativeJson, /data:image\/png;base64,ordinary-legacy-metadata/)
  assert.match(zineJson, /data:first/)
  assert.match(zineJson, /data:text\/plain,ordinary project metadata/)
  const narrativeImage = (((narrative.snapshot as { visualSegments: unknown[] }).visualSegments[0] as { image: unknown }).image)
  const zineImage = ((((zine.snapshot as { currentSpread: unknown }).currentSpread as { preview: unknown }).preview))
  assert.deepEqual(narrativeImage, { byteLength: 3, height: 400, id: 'render-top', mediaType: 'image/png', width: 960 })
  assert.deepEqual(zineImage, { byteLength: 7, height: 800, id: 'preview-current', mediaType: 'image/png', width: 1200 })
  assert.equal(narrativeJson.includes('HIDDEN_ROOT'), false)
})

test('structured projection preserves own __proto__ metadata without prototype mutation', () => {
  const build = (specialValue: string) => {
    const task = narrativeTask()
    const root = task.snapshot.root as Record<string, unknown>
    Object.defineProperty(root, '__proto__', {
      enumerable: true,
      configurable: true,
      writable: true,
      value: { marker: specialValue, dataUrl: 'data:image/png;base64,HIDDEN_SPECIAL' },
    })
    const inputJson = JSON.stringify(task)
    const inputPrototype = Object.getPrototypeOf(root)

    const messages = buildNarrativeDirectEditMessages({ task, capabilities: STRUCTURE_ONLY })
    const context = structuredContext(messages)
    const projectedRoot = (context.snapshot as { root: Record<string, unknown> }).root

    assert.equal(Object.hasOwn(projectedRoot, '__proto__'), true)
    assert.deepEqual(projectedRoot.__proto__, { marker: specialValue })
    assert.equal(Object.getPrototypeOf(projectedRoot), Object.prototype)
    assert.equal(Object.getPrototypeOf(root), inputPrototype)
    assert.equal(JSON.stringify(task), inputJson)
    assert.equal(JSON.stringify(context).includes('HIDDEN_SPECIAL'), false)

    return messages[1]?.text
  }

  const first = build('alpha')
  assert.equal(first, build('alpha'))
  assert.notEqual(first, build('beta'))
})

test('delete authorization lists only exact targets and page audit limits fixes', () => {
  const narrative = buildNarrativeDirectEditMessages({ task: narrativeTask(true), capabilities: VISION })
  const zine = buildZineDirectEditMessages({ task: zineTask(), capabilities: VISION })
  assert.match(allText(narrative), /delete[\s\S]*exact authorized target IDs[\s\S]*node-opening/i)
  assert.match(allText(zine), /page_audit[\s\S]*safe fixes[\s\S]*non-fixable findings[\s\S]*warnings/i)
  assert.match(allText(zine), /delete[\s\S]*exact authorized slot IDs[\s\S]*slot-1/i)
})

test('Zine vision order and policy keep one spread writable and project assets allowlisted', () => {
  const messages = buildZineDirectEditMessages({ task: zineTask(), capabilities: VISION })
  const text = allText(messages)

  assert.match(text, /targetSpreadId[\s\S]*spread-current[\s\S]*only writable spread/i)
  assert.match(text, /project and adjacent spreads.*read-only design references/i)
  assert.match(text, /every Zine write operation includes the exact field\/value spreadId: "spread-current"/i)
  assert.match(text, /assetCandidates[\s\S]*project asset allowlist[\s\S]*asset-a[\s\S]*asset-b/i)
  assert.match(text, /no filesystem[\s\S]*external gallery[\s\S]*generation[\s\S]*import[\s\S]*delete[\s\S]*project assets/i)
  assert.match(text, /no arbitrary CSS/i)
  assert.match(text, /no whole-project replacement/i)
  assertOrderedVisualParts(messages, [
    { dataUrl: 'data:image/png;base64,CURRENT', mediaType: 'image/png', labelIds: ['preview-current', 'spread-current'] },
    { dataUrl: 'data:image/png;base64,LEFT', mediaType: 'image/png', labelIds: ['preview-left', 'spread-left'] },
    { dataUrl: 'data:image/jpeg;base64,RIGHT', mediaType: 'image/jpeg', labelIds: ['preview-right', 'spread-right'] },
    { dataUrl: 'data:image/webp;base64,ASSETA', mediaType: 'image/webp', labelIds: ['thumb-a', 'asset-a'] },
    { dataUrl: 'data:image/png;base64,ASSETB', mediaType: 'image/png', labelIds: ['thumb-b', 'asset-b'] },
  ])
})

test('vision builder output survives both adapters exactly once and in order', () => {
  for (const messages of [
    buildNarrativeDirectEditMessages({ task: narrativeTask(), capabilities: VISION }),
    buildZineDirectEditMessages({ task: zineTask(), capabilities: VISION }),
  ]) {
    const expectedFiles = fileParts(messages)
    const expectedText = [messages[1]?.text, ...parts(messages).flatMap((part) => part.type === 'text' ? [part.text] : [])]

    const vercelUser = toVercelAiModelInput(messages).messages[0]
    assert.ok(Array.isArray(vercelUser.content))
    if (Array.isArray(vercelUser.content)) {
      assert.deepEqual(vercelUser.content.filter((part) => part.type === 'file').map((part) => [part.mediaType, part.data.toString()]), expectedFiles.map((part) => [part.mediaType, part.dataUrl]))
      assert.deepEqual(vercelUser.content.filter((part) => part.type === 'text').map((part) => part.text), expectedText)
    }

    const openAiUser = toOpenAiChatMessages(messages)[1]
    assert.ok(Array.isArray(openAiUser.content))
    if (Array.isArray(openAiUser.content)) {
      assert.deepEqual(openAiUser.content.filter((part) => part.type === 'image_url').map((part) => part.image_url.url), expectedFiles.map((part) => part.dataUrl))
      assert.deepEqual(openAiUser.content.filter((part) => part.type === 'text').map((part) => part.text), expectedText)
    }
  }
})

test('structure-only builder output has no adapter visual parts', () => {
  const messages = buildZineDirectEditMessages({ task: zineTask(), capabilities: STRUCTURE_ONLY })
  const vercelUser = toVercelAiModelInput(messages).messages[0]
  const openAiUser = toOpenAiChatMessages(messages)[1]
  assert.equal(Array.isArray(vercelUser.content), false)
  assert.equal(Array.isArray(openAiUser.content), false)
})

test('constructor-accepted special IDs are represented as exact JSON values in policy and labels', () => {
  const specialSpreadId = 'spread-"quoted",`tick`\nnext'
  const specialSlotIds = ['slot-"one"', 'slot,two', 'slot`three`\nnext']
  const specialAssetIds = ['asset-"one"', 'asset,two', 'asset`three`\nnext']
  const base = zineSnapshot()
  const snapshot = createZineDocumentSnapshot({
    projectId: base.projectId,
    targetSpreadId: specialSpreadId,
    project: { ...base.project, spreadOrder: [specialSpreadId] },
    currentSpread: { ...base.currentSpread, spreadId: specialSpreadId },
    adjacentSpreads: [],
    assetCandidates: specialAssetIds.map((assetId, index) => ({
      assetId,
      metadata: {},
      thumbnail: { id: `thumb-${index}`, dataUrl: `data:image/png;base64,${index}`, mediaType: 'image/png', width: 1, height: 1, byteLength: 1 },
    })),
  })
  const task: DirectEditAgentTask<ZineDocumentSnapshot> = {
    ...zineTask('instruction'),
    snapshot,
    authorization: { allowDelete: true, deleteTargetIds: specialSlotIds, targetSpreadId: specialSpreadId, projectAssetIds: specialAssetIds },
  }
  const messages = buildZineDirectEditMessages({ task, capabilities: VISION })
  const system = messages[0]?.text ?? ''
  const labels = parts(messages).flatMap((part) => part.type === 'text' ? [part.text] : [])

  assert.match(system, new RegExp(`spreadId: ${JSON.stringify(specialSpreadId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  assert.ok(system.includes(`exact authorized slot IDs: ${JSON.stringify(specialSlotIds)}`))
  assert.ok(system.includes(`project asset allowlist: ${JSON.stringify(specialAssetIds)}`))
  for (const assetId of specialAssetIds) {
    assert.ok(labels.some((label) => label.includes(`asset ID ${JSON.stringify(assetId)}`)))
  }
})

test('structure-only messages contain no visual payload and prohibit semantic visual judgments', () => {
  const narrative = buildNarrativeDirectEditMessages({ task: narrativeTask(), capabilities: STRUCTURE_ONLY })
  const zine = buildZineDirectEditMessages({ task: zineTask(), capabilities: STRUCTURE_ONLY })
  for (const messages of [narrative, zine]) {
    assert.equal(fileParts(messages).length, 0)
    const context = structuredContext(messages)
    assertNoDataUrlKeys(context)
    assert.equal(JSON.stringify(context).includes('data:image/png;base64,TOP'), false)
    assert.match(allText(messages), /do not perform subject recognition, semantic crop, visual focal-point judgment, or image-content-based asset replacement/i)
  }
  assert.match(JSON.stringify(structuredContext(narrative)), /data:first/)
  assert.match(JSON.stringify(structuredContext(zine)), /data:text\/plain,ordinary project metadata/)
})

test('suggestion-only and generic dispatch preserve inputs and capability-specific output', () => {
  const narrative = narrativeTask()
  const zine = zineTask('instruction')
  const narrativeBefore = structuredClone(narrative)
  const zineBefore = structuredClone(zine)

  const narrativeMessages = buildDirectEditMessages({ task: narrative, capabilities: SUGGESTION_ONLY })
  const zineMessages = buildDirectEditMessages({ task: zine, capabilities: VISION })

  assert.match(allText(narrativeMessages), /return advice only/i)
  assert.match(allText(narrativeMessages), /do not output operations or tool calls/i)
  assert.match(allText(narrativeMessages), /"executionMode":"suggestion_only"/)
  assert.match(allText(zineMessages), /only writable spread/i)
  assert.deepEqual(narrative, narrativeBefore)
  assert.deepEqual(zine, zineBefore)
  assert.deepEqual(narrativeMessages, buildNarrativeDirectEditMessages({ task: narrative, capabilities: SUGGESTION_ONLY }))
  assert.deepEqual(zineMessages, buildZineDirectEditMessages({ task: zine, capabilities: VISION }))
})

test('legacy and direct-edit public prompt exports remain available', () => {
  assert.equal(typeof EDITOR_AI_SYSTEM_PROMPT, 'string')
  assert.equal(typeof EDITOR_AI_ACTION_INSTRUCTIONS.rewrite, 'string')
  assert.equal(typeof buildEditorAiUserPrompt, 'function')
  assert.equal(typeof buildEditorAiMessages, 'function')
  assert.equal(typeof buildDirectEditMessages, 'function')
  assert.equal(typeof buildNarrativeDirectEditMessages, 'function')
  assert.equal(typeof buildZineDirectEditMessages, 'function')
})

test('prompt source is SDK-neutral', () => {
  const source = readFileSync(new URL('../src/direct-edit-prompt.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /from ['"](?:ai|@ai-sdk\/)/)
  assert.doesNotMatch(source, /ModelMessage|LanguageModel/)
})
