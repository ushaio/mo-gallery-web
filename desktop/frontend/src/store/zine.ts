import { toast } from 'sonner'
import { create } from 'zustand'

import { cloneSpreads } from '@/lib/zine/history'
import { getSpreadSize } from '@/lib/zine/page-sizes'
import { getZineProject, saveZineProject } from '@/lib/zine/project'
import { buildSpreadFromTemplate } from '@/lib/zine/templates'
import type { Slot, Spread, ZineAsset, ZinePageSize, ZineProject } from '@/lib/zine/types'

const DEFAULT_TEMPLATE_ID = 'single-photo-full'
const HISTORY_LIMIT = 50
const AUTOSAVE_DELAY_MS = 300

let autosaveTimer: number | null = null

function createZineId() {
  return crypto.randomUUID?.() ?? `zine_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function scheduleAutosave() {
  if (typeof window === 'undefined') return

  if (autosaveTimer !== null) {
    window.clearTimeout(autosaveTimer)
  }

  autosaveTimer = window.setTimeout(() => {
    autosaveTimer = null
    void useZineStore.getState().save()
  }, AUTOSAVE_DELAY_MS)
}

function markDirty() {
  scheduleAutosave()
  return { dirty: true }
}

function withUpdatedProject(project: ZineProject, patch: Partial<ZineProject>): ZineProject {
  return { ...project, ...patch, updatedAt: Date.now() }
}

interface ZineState {
  project: ZineProject | null
  activeSpreadId: string | null
  selectedSlotId: string | null
  dirty: boolean
  saving: boolean
  undoStack: Spread[][]
  redoStack: Spread[][]
  createProject: (title: string, createdBy?: string, pageSize?: ZinePageSize) => ZineProject
  loadProject: (id: string) => Promise<void>
  setProject: (project: ZineProject) => void
  setActiveSpread: (id: string) => void
  selectSlot: (id: string | null) => void
  updateSlot: (spreadId: string, slotId: string, patch: Partial<Slot>) => void
  addSpread: (templateId?: string) => void
  removeSpread: (id: string) => void
  addAsset: (asset: ZineAsset) => void
  rename: (title: string) => void
  pushHistory: () => void
  undo: () => void
  redo: () => void
  save: () => Promise<void>
}

export const useZineStore = create<ZineState>()((set, get) => ({
  project: null,
  activeSpreadId: null,
  selectedSlotId: null,
  dirty: false,
  saving: false,
  undoStack: [],
  redoStack: [],
  createProject: (title, createdBy = 'local', pageSize = 'a5') => {
    const now = Date.now()
    const { pageW, pageH } = getSpreadSize(pageSize)
    const firstSpread = buildSpreadFromTemplate(DEFAULT_TEMPLATE_ID, pageW, pageH)
    const project: ZineProject = {
      id: createZineId(),
      title,
      pageSize,
      pageOrientation: 'portrait',
      createdBy,
      createdAt: now,
      updatedAt: now,
      spreads: [firstSpread],
      assets: [],
    }

    set({ project, activeSpreadId: firstSpread.id, selectedSlotId: null, dirty: true, undoStack: [], redoStack: [] })
    scheduleAutosave()
    return project
  },
  loadProject: async (id) => {
    const project = await getZineProject(id)
    set({ project, activeSpreadId: project?.spreads[0]?.id ?? null, selectedSlotId: null, dirty: false, undoStack: [], redoStack: [] })
  },
  setProject: (project) => set({ project, activeSpreadId: project.spreads[0]?.id ?? null, selectedSlotId: null, dirty: false, undoStack: [], redoStack: [] }),
  setActiveSpread: (id) => set({ activeSpreadId: id, selectedSlotId: null }),
  selectSlot: (id) => set({ selectedSlotId: id }),
  updateSlot: (spreadId, slotId, patch) => {
    const project = get().project
    const spread = project?.spreads.find((spread) => spread.id === spreadId)

    if (!spread?.slots.some((slot) => slot.id === slotId)) return

    get().pushHistory()
    set((state) => {
      if (!state.project) return state

      const spreads = state.project.spreads.map((spread) => {
        if (spread.id !== spreadId) return spread
        return {
          ...spread,
          slots: spread.slots.map((slot) => (slot.id === slotId ? ({ ...slot, ...patch } as Slot) : slot)),
        }
      })

      return { project: withUpdatedProject(state.project, { spreads }), redoStack: [], ...markDirty() }
    })
  },
  addSpread: (templateId = DEFAULT_TEMPLATE_ID) => {
    get().pushHistory()
    set((state) => {
      if (!state.project) return state

      const { pageW, pageH } = getSpreadSize(state.project.pageSize, state.project.pageOrientation)
      const spread = buildSpreadFromTemplate(templateId, pageW, pageH)

      return {
        project: withUpdatedProject(state.project, { spreads: [...state.project.spreads, spread] }),
        activeSpreadId: spread.id,
        selectedSlotId: null,
        redoStack: [],
        ...markDirty(),
      }
    })
  },
  removeSpread: (id) => {
    const project = get().project
    if (!project || project.spreads.length <= 1 || !project.spreads.some((spread) => spread.id === id)) return

    get().pushHistory()
    set((state) => {
      if (!state.project) return state

      const spreads = state.project.spreads.filter((spread) => spread.id !== id)
      const activeSpreadId = state.activeSpreadId === id ? spreads[0]?.id ?? null : state.activeSpreadId

      return { project: withUpdatedProject(state.project, { spreads }), activeSpreadId, selectedSlotId: null, redoStack: [], ...markDirty() }
    })
  },
  addAsset: (asset) => {
    set((state) => {
      if (!state.project) return state
      return { project: withUpdatedProject(state.project, { assets: [...state.project.assets, asset] }), ...markDirty() }
    })
  },
  rename: (title) => {
    set((state) => {
      if (!state.project) return state
      return { project: withUpdatedProject(state.project, { title }), ...markDirty() }
    })
  },
  pushHistory: () => {
    const project = get().project
    if (!project) return

    set((state) => ({ undoStack: [...state.undoStack, cloneSpreads(project.spreads)].slice(-HISTORY_LIMIT), redoStack: [] }))
  },
  undo: () => {
    set((state) => {
      if (!state.project || state.undoStack.length === 0) return state

      const previous = state.undoStack[state.undoStack.length - 1]
      const undoStack = state.undoStack.slice(0, -1)
      const redoStack = [...state.redoStack, cloneSpreads(state.project.spreads)].slice(-HISTORY_LIMIT)
      const activeSpreadId = previous.some((spread) => spread.id === state.activeSpreadId) ? state.activeSpreadId : previous[0]?.id ?? null

      return { project: withUpdatedProject(state.project, { spreads: cloneSpreads(previous) }), activeSpreadId, selectedSlotId: null, undoStack, redoStack, ...markDirty() }
    })
  },
  redo: () => {
    set((state) => {
      if (!state.project || state.redoStack.length === 0) return state

      const next = state.redoStack[state.redoStack.length - 1]
      const redoStack = state.redoStack.slice(0, -1)
      const undoStack = [...state.undoStack, cloneSpreads(state.project.spreads)].slice(-HISTORY_LIMIT)
      const activeSpreadId = next.some((spread) => spread.id === state.activeSpreadId) ? state.activeSpreadId : next[0]?.id ?? null

      return { project: withUpdatedProject(state.project, { spreads: cloneSpreads(next) }), activeSpreadId, selectedSlotId: null, undoStack, redoStack, ...markDirty() }
    })
  },
  save: async () => {
    const project = get().project
    if (!project) return

    set({ saving: true })

    try {
      await saveZineProject(project)
      set((state) => ({
        dirty: state.project?.id === project.id && state.project.updatedAt === project.updatedAt ? false : state.dirty,
        saving: false,
      }))
    } catch {
      set({ saving: false })
      toast.error('Zine 草稿保存失败')
    }
  },
}))
