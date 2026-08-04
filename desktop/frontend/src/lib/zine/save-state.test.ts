import assert from 'node:assert/strict'

import { resolveZineSaveFailure, resolveZineSaveSuccess } from './save-state'
import type { ZineProject } from './types'

const project: ZineProject = {
  id: 'save-project',
  title: 'Save',
  pageSize: 'a5',
  pageOrientation: 'portrait',
  geometryVersion: 2,
  createdBy: 'test',
  createdAt: 1,
  updatedAt: 10,
  spreads: [],
  assets: [],
}

assert.deepEqual(resolveZineSaveSuccess(project, project, true), { dirty: false, saveStatus: 'saved' })
assert.deepEqual(
  resolveZineSaveSuccess(project, { ...project, updatedAt: 11 }, true),
  { dirty: true, saveStatus: 'unsaved' },
  'an older save completion cannot clear newer edits',
)
assert.deepEqual(resolveZineSaveFailure(), { dirty: true, saveStatus: 'failed' })

console.log('✓ Zine save success, stale completion, and failure states')
