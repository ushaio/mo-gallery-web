import type { ZineProject } from './types'

export interface ZineSaveResultState {
  dirty: boolean
  saveStatus: 'saved' | 'unsaved' | 'failed'
}

export function resolveZineSaveSuccess(savedProject: ZineProject, currentProject: ZineProject | null, currentDirty: boolean): ZineSaveResultState {
  // Store mutations replace the project object. Timestamps can collide when
  // several edits land in one millisecond and must not identify a revision.
  const savedCurrentRevision = currentProject === savedProject
  return {
    dirty: savedCurrentRevision ? false : currentDirty,
    saveStatus: savedCurrentRevision ? 'saved' : 'unsaved',
  }
}

export function resolveZineSaveFailure(): ZineSaveResultState {
  return { dirty: true, saveStatus: 'failed' }
}
