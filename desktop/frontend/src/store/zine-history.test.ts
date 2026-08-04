import assert from 'node:assert/strict'

import type { ZineProject } from '@/lib/zine/types'
import { useZineStore } from './zine'

const project: ZineProject = {
  id: 'history-project',
  title: 'History',
  pageSize: 'a5',
  pageOrientation: 'portrait',
  geometryVersion: 2,
  createdBy: 'test',
  createdAt: 1,
  updatedAt: 1,
  assets: [],
  spreads: [{
    id: 'spread-1',
    templateId: 'test',
    slots: [{
      id: 'slot-1',
      kind: 'image',
      page: 'left',
      x: 10,
      y: 10,
      w: 40,
      h: 30,
      rotation: 0,
      zIndex: 1,
      assetId: null,
      imageTransform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 },
    }],
  }],
}

useZineStore.setState({
  project: structuredClone(project),
  activeSpreadId: 'spread-1',
  selectedSlotId: 'slot-1',
  dirty: false,
  saving: false,
  saveStatus: 'saved',
  aiTaskId: null,
  undoStack: [],
  redoStack: [],
})

useZineStore.getState().updateSlot('spread-1', 'slot-1', {
  page: 'right',
  x: 160,
  y: 18,
  w: 48,
  h: 36,
  rotation: 45,
})

const committed = useZineStore.getState()
assert.equal(committed.undoStack.length, 1, 'one complete gesture creates one history snapshot')
assert.equal(committed.dirty, true)
assert.equal(committed.saveStatus, 'unsaved')
assert.equal(committed.project?.spreads[0]?.slots[0]?.x, 160)

committed.undo()
const undone = useZineStore.getState()
assert.equal(undone.project?.spreads[0]?.slots[0]?.x, 10)
assert.equal(undone.project?.spreads[0]?.slots[0]?.rotation, 0)
assert.equal(undone.redoStack.length, 1)

console.log('✓ Zine gesture commit produces one undo step and marks the project unsaved')
