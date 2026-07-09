import { toast } from 'sonner'
import { create } from 'zustand'

import { cloneSpreads } from '@/lib/zine/history'
import { clampCustomSizeMm, getSpreadSize } from '@/lib/zine/page-sizes'
import { DEFAULT_BLEED_MM, getProjectBleedMm, hasCoverSpread, isCoverSpread } from '@/lib/zine/print'
import { getZineAssetBlob, getZineProject, saveZineProject } from '@/lib/zine/project'
import { buildSpreadFromTemplate, createImageSlot, createTextSlot, ZINE_COVER_TEMPLATE } from '@/lib/zine/templates'
import type { Slot, SlotKind, Spread, ZineAsset, ZineCustomSizeMm, ZinePageNumberSettings, ZinePageOrientation, ZinePageSize, ZineProject } from '@/lib/zine/types'

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

async function hydrateLocalAssets(project: ZineProject): Promise<ZineProject> {
  const assets = await Promise.all(
    project.assets.map(async (asset) => {
      if (asset.source !== 'local' || !asset.blobId) return asset

      try {
        const blob = await getZineAssetBlob(asset.blobId)
        if (!blob) {
          console.warn(`Local zine asset blob not found: ${asset.blobId}`)
          return { ...asset, previewUrl: '', fullUrl: '' }
        }

        const objectUrl = URL.createObjectURL(blob)
        return { ...asset, previewUrl: objectUrl, fullUrl: objectUrl }
      } catch (error) {
        console.warn(`Failed to hydrate local zine asset: ${asset.blobId}`, error)
        return { ...asset, previewUrl: '', fullUrl: '' }
      }
    }),
  )

  return { ...project, assets }
}

interface CreateProjectOptions {
  createdBy?: string
  pageSize?: ZinePageSize
  pageOrientation?: ZinePageOrientation
  customSizeMm?: ZineCustomSizeMm
}

interface ZineState {
  project: ZineProject | null
  activeSpreadId: string | null
  selectedSlotId: string | null
  dirty: boolean
  saving: boolean
  undoStack: Spread[][]
  redoStack: Spread[][]
  createProject: (title: string, options?: CreateProjectOptions) => ZineProject
  loadProject: (id: string) => Promise<void>
  setProject: (project: ZineProject) => void
  setActiveSpread: (id: string) => void
  selectSlot: (id: string | null) => void
  updateSlot: (spreadId: string, slotId: string, patch: Partial<Slot>) => void
  addSlot: (spreadId: string, kind: SlotKind) => void
  removeSlot: (spreadId: string, slotId: string) => void
  addSpread: (templateId?: string) => void
  addCoverSpread: () => void
  moveSpread: (id: string, direction: -1 | 1) => void
  removeSpread: (id: string) => void
  addAsset: (asset: ZineAsset) => void
  rename: (title: string) => void
  setPageNumbers: (settings: ZinePageNumberSettings) => void
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
  createProject: (title, options = {}) => {
    const now = Date.now()
    const pageSize = options.pageSize ?? 'a5'
    const pageOrientation = options.pageOrientation ?? 'portrait'
    const customSizeMm = pageSize === 'custom' ? clampCustomSizeMm(options.customSizeMm ?? { width: 148, height: 210 }) : undefined
    const { pageW, pageH } = getSpreadSize(pageSize, pageOrientation, customSizeMm)
    const coverSpread = buildSpreadFromTemplate(ZINE_COVER_TEMPLATE.id, pageW, pageH, { role: 'cover', bleedMm: DEFAULT_BLEED_MM })
    const firstSpread = buildSpreadFromTemplate(DEFAULT_TEMPLATE_ID, pageW, pageH, { bleedMm: DEFAULT_BLEED_MM })
    const project: ZineProject = {
      id: createZineId(),
      title,
      pageSize,
      pageOrientation,
      ...(customSizeMm ? { customSizeMm } : {}),
      bleedMm: DEFAULT_BLEED_MM,
      createdBy: options.createdBy ?? 'local',
      createdAt: now,
      updatedAt: now,
      spreads: [coverSpread, firstSpread],
      assets: [],
    }

    set({ project, activeSpreadId: coverSpread.id, selectedSlotId: null, dirty: true, undoStack: [], redoStack: [] })
    scheduleAutosave()
    return project
  },
  loadProject: async (id) => {
    const project = await getZineProject(id)
    const hydratedProject = project ? await hydrateLocalAssets(project) : null
    set({ project: hydratedProject, activeSpreadId: hydratedProject?.spreads[0]?.id ?? null, selectedSlotId: null, dirty: false, undoStack: [], redoStack: [] })
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
  addSlot: (spreadId, kind) => {
    const project = get().project
    const spread = project?.spreads.find((spread) => spread.id === spreadId)
    if (!project || !spread) return

    get().pushHistory()
    set((state) => {
      if (!state.project) return state

      const { pageW, pageH } = getSpreadSize(state.project.pageSize, state.project.pageOrientation, state.project.customSizeMm)
      const nextZIndex = Math.max(0, ...spread.slots.map((slot) => slot.zIndex)) + 1
      const slot = kind === 'text' ? createTextSlot('left', pageW, pageH, nextZIndex) : createImageSlot('left', pageW, pageH, nextZIndex)
      const spreads = state.project.spreads.map((item) => (item.id === spreadId ? { ...item, slots: [...item.slots, slot] } : item))

      return { project: withUpdatedProject(state.project, { spreads }), selectedSlotId: slot.id, redoStack: [], ...markDirty() }
    })
  },
  removeSlot: (spreadId, slotId) => {
    const project = get().project
    const spread = project?.spreads.find((spread) => spread.id === spreadId)
    if (!spread?.slots.some((slot) => slot.id === slotId)) return

    get().pushHistory()
    set((state) => {
      if (!state.project) return state

      const spreads = state.project.spreads.map((item) => (item.id === spreadId ? { ...item, slots: item.slots.filter((slot) => slot.id !== slotId) } : item))
      const selectedSlotId = state.selectedSlotId === slotId ? null : state.selectedSlotId

      return { project: withUpdatedProject(state.project, { spreads }), selectedSlotId, redoStack: [], ...markDirty() }
    })
  },
  addSpread: (templateId = DEFAULT_TEMPLATE_ID) => {
    get().pushHistory()
    set((state) => {
      if (!state.project) return state

      const { pageW, pageH } = getSpreadSize(state.project.pageSize, state.project.pageOrientation, state.project.customSizeMm)
      const spread = buildSpreadFromTemplate(templateId, pageW, pageH, { bleedMm: getProjectBleedMm(state.project) })

      return {
        project: withUpdatedProject(state.project, { spreads: [...state.project.spreads, spread] }),
        activeSpreadId: spread.id,
        selectedSlotId: null,
        redoStack: [],
        ...markDirty(),
      }
    })
  },
  addCoverSpread: () => {
    const project = get().project
    if (!project || hasCoverSpread(project)) return

    get().pushHistory()
    set((state) => {
      if (!state.project || hasCoverSpread(state.project)) return state

      const { pageW, pageH } = getSpreadSize(state.project.pageSize, state.project.pageOrientation, state.project.customSizeMm)
      const spread = buildSpreadFromTemplate(ZINE_COVER_TEMPLATE.id, pageW, pageH, { role: 'cover', bleedMm: getProjectBleedMm(state.project) })

      return {
        project: withUpdatedProject(state.project, { spreads: [spread, ...state.project.spreads] }),
        activeSpreadId: spread.id,
        selectedSlotId: null,
        redoStack: [],
        ...markDirty(),
      }
    })
  },
  moveSpread: (id, direction) => {
    const project = get().project
    if (!project) return

    const index = project.spreads.findIndex((spread) => spread.id === id)
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= project.spreads.length) return
    // 封面固定在首位：封面自身不可移动，内页也不可移到封面之前
    if (isCoverSpread(project.spreads[index]) || isCoverSpread(project.spreads[targetIndex])) return

    get().pushHistory()
    set((state) => {
      if (!state.project) return state

      const spreads = [...state.project.spreads]
      const [moved] = spreads.splice(index, 1)
      spreads.splice(targetIndex, 0, moved)

      return { project: withUpdatedProject(state.project, { spreads }), redoStack: [], ...markDirty() }
    })
  },
  removeSpread: (id) => {
    const project = get().project
    const target = project?.spreads.find((spread) => spread.id === id)
    if (!project || !target) return
    // 至少保留一个内页跨页；封面随时可删（可通过添加封面恢复）
    const contentCount = project.spreads.filter((spread) => !isCoverSpread(spread)).length
    if (!isCoverSpread(target) && contentCount <= 1) return

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
  setPageNumbers: (settings) => {
    set((state) => {
      if (!state.project) return state
      return { project: withUpdatedProject(state.project, { pageNumbers: settings }), ...markDirty() }
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
