import assert from 'node:assert/strict'

import type { EditorOperationBatch, ZineEditorOperation } from '@mo-gallery/ai-agent'

import { createZineDirectEditHost } from './zine-direct-edit-host'
import type { ZineProject } from './types'
import { useZineStore } from '@/store/zine'

function currentTextContent() {
  const slot = useZineStore.getState().project?.spreads[0]?.slots[0]
  return slot?.kind === 'text' ? slot.content : undefined
}

const project: ZineProject = {
  id: 'project-1',
  title: 'Test Zine',
  pageSize: 'a5',
  pageOrientation: 'portrait',
  createdBy: 'local',
  createdAt: 1,
  updatedAt: 1,
  spreads: [{
    id: 'spread-1',
    templateId: 'text-left-photo-right',
    slots: [
      {
        id: 'text-1',
        kind: 'text',
        page: 'left',
        x: 12,
        y: 12,
        w: 80,
        h: 30,
        rotation: 0,
        zIndex: 1,
        content: 'Old title',
        align: 'left',
        fontSize: 18,
        lineHeight: 1.25,
        color: '#111111',
        fontFamily: 'serif',
      },
      {
        id: 'image-1',
        kind: 'image',
        page: 'right',
        x: 12,
        y: 12,
        w: 80,
        h: 100,
        rotation: 0,
        zIndex: 2,
        assetId: null,
        imageTransform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 },
      },
    ],
  }],
  assets: [{
    id: 'asset-1',
    source: 'local',
    fileName: 'photo.jpg',
    width: 1600,
    height: 1200,
    previewUrl: 'blob:preview',
    fullUrl: 'blob:full',
    createdAt: 1,
  }],
}

useZineStore.setState({
  project: structuredClone(project),
  activeSpreadId: 'spread-1',
  selectedSlotId: null,
  dirty: false,
  saving: false,
  aiTaskId: null,
  undoStack: [],
  redoStack: [],
  save: async () => true,
})

const host = createZineDirectEditHost('project-1', 'spread-1')
const snapshot = await host.captureSnapshot()
assert.equal(snapshot.capability, 'zine')
assert.equal(snapshot.projectId, 'project-1')
assert.equal(snapshot.targetSpreadId, 'spread-1')
assert.equal(snapshot.assetCandidates[0]?.assetId, 'asset-1')

const invalidSimulation = await host.simulate(snapshot, [{
  operationId: 'assign-missing-photo',
  type: 'assign_asset',
  spreadId: 'spread-1',
  slotId: 'image-1',
  assetId: 'missing-asset',
}])
assert.equal(invalidSimulation.issues.length, 1)
assert.equal(currentTextContent(), 'Old title', 'invalid simulation leaves the live store unchanged')

const operations: ZineEditorOperation[] = [
  {
    operationId: 'change-title',
    type: 'set_slot_attrs',
    spreadId: 'spread-1',
    slotId: 'text-1',
    attrs: { content: 'New title', align: 'center' },
  },
  {
    operationId: 'assign-photo',
    type: 'assign_asset',
    spreadId: 'spread-1',
    slotId: 'image-1',
    assetId: 'asset-1',
  },
]
const simulation = await host.simulate(snapshot, operations)
assert.deepEqual(simulation.issues, [])
assert.equal(simulation.changeEntries.length, 2)
assert.notEqual(simulation.resultRevision, snapshot.revision)
assert.equal(
  currentTextContent(),
  'Old title',
  'simulation does not mutate the live store',
)

const batch: EditorOperationBatch<'zine', ZineEditorOperation> = {
  taskId: 'task-1',
  capability: 'zine',
  baseRevision: snapshot.revision,
  target: { documentId: 'project-1', spreadId: 'spread-1' },
  operations,
  summary: ['Updated the title and assigned a photo'],
}

host.lock(batch.taskId)
const commit = await host.commit(batch, simulation)
host.unlock(batch.taskId)
assert.equal(commit.saved, true)
assert.equal(commit.resultRevision, simulation.resultRevision)
assert.equal(useZineStore.getState().undoStack.length, 1, 'AI commit creates one history entry')

const appliedSpread = useZineStore.getState().project?.spreads[0]
const appliedText = appliedSpread?.slots.find((slot) => slot.id === 'text-1')
const appliedImage = appliedSpread?.slots.find((slot) => slot.id === 'image-1')
assert.equal(appliedText?.kind === 'text' ? appliedText.content : undefined, 'New title')
assert.equal(appliedImage?.kind === 'image' ? appliedImage.assetId : undefined, 'asset-1')
assert.deepEqual(host.getTaskHistoryState('task-1'), {
  state: 'applied',
  canUndo: true,
  canRedo: false,
})

assert.equal(host.undoTask('task-1'), true)
assert.equal(
  currentTextContent(),
  'Old title',
)
assert.equal(host.redoTask('task-1'), true)
assert.equal(
  currentTextContent(),
  'New title',
)

host.lock('lock-contract')
useZineStore.getState().updateSlot('spread-1', 'text-1', { content: 'Blocked manual edit' })
assert.equal(currentTextContent(), 'New title', 'manual mutations are blocked while the AI task owns the editor')
host.unlock('lock-contract')

console.log('✓ Zine direct-edit snapshot, atomic commit, and task history')
