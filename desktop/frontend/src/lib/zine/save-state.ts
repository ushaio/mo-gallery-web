import type { ZineProject } from './types'

export interface ZineSaveResultState {
  dirty: boolean
  saveStatus: 'saved' | 'unsaved' | 'failed'
}

export function resolveZineSaveSuccess(savedProject: ZineProject, currentProject: ZineProject | null, currentDirty: boolean): ZineSaveResultState {
  const savedCurrentRevision = currentProject?.id === savedProject.id && currentProject.updatedAt === savedProject.updatedAt
  return {
    dirty: savedCurrentRevision ? false : currentDirty,
    saveStatus: savedCurrentRevision ? 'saved' : 'unsaved',
  }
}

export function resolveZineSaveFailure(): ZineSaveResultState {
  return { dirty: true, saveStatus: 'failed' }
}
