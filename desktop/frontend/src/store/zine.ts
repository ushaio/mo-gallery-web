import { toast } from 'sonner'
import { create } from 'zustand'

import { ZINE_GEOMETRY_VERSION, getSlotPageSide, migrateProjectGeometry } from '@/lib/zine/geometry'
import { cloneSpreads } from '@/lib/zine/history'
import { clampCustomSizeMm, getSpreadSize } from '@/lib/zine/page-sizes'
import { DEFAULT_BLEED_MM, getProjectBleedMm, hasCoverSpread, isCoverSpread } from '@/lib/zine/print'
import { getZineAssetBlob, getZineProject, saveZineProject } from '@/lib/zine/project'
import { resolveZineSaveFailure, resolveZineSaveSuccess } from '@/lib/zine/save-state'
import { buildSpreadFromTemplate, createImageSlot, createTextSlot, ZINE_COVER_TEMPLATE } from '@/lib/zine/templates'
import type { Slot, SlotKind, Spread, ZineAsset, ZineCustomSizeMm, ZinePageNumberSettings, ZinePageOrientation, ZinePageSize, ZineProject } from '@/lib/zine/types'

const DEFAULT_TEMPLATE_ID = 'single-photo-full'
const HISTORY_LIMIT = 50
const AUTOSAVE_DELAY_MS = 300
const COPY_OFFSET_MM = 4

let autosaveTimer: number | null = null
let projectSession = 0
let slotClipboard: { projectId: string; slot: Slot; pasteCount: number } | null = null

function createZineId() {
  return crypto.randomUUID?.() ?? `zine_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function clearAutosave() {
  if (autosaveTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(autosaveTimer)
  }
  autosaveTimer = null
}

function scheduleAutosave() {
  if (typeof window === 'undefined') return

  clearAutosave()

  autosaveTimer = window.setTimeout(() => {
    autosaveTimer = null
    void useZineStore.getState().save()
  }, AUTOSAVE_DELAY_MS)
}

function markDirty() {
  scheduleAutosave()
  return { dirty: true, saveStatus: 'unsaved' as const }
}

function withUpdatedProject(project: ZineProject, patch: Partial<ZineProject>): ZineProject {
  return { ...project, ...patch, updatedAt: Date.now() }
}

function withSpreadChange(state: ZineState, spreads: Spread[], recordHistory = true): Partial<ZineState> {
  if (!state.project) return {}

  return {
    project: withUpdatedProject(state.project, { spreads }),
    undoStack: recordHistory
      ? [...state.undoStack, cloneSpreads(state.project.spreads)].slice(-HISTORY_LIMIT)
      : state.undoStack,
    redoStack: [],
    ...markDirty(),
  }
}

function slotsEqual(left: Slot, right: Slot) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  return [...keys].every((key) => {
    if (key === 'locked') return Boolean(left.locked) === Boolean(right.locked)
    if (left.kind === 'image' && right.kind === 'image') {
      if (key === 'imageFrameBinding') return (left.imageFrameBinding ?? true) === (right.imageFrameBinding ?? true)
      if (key === 'imageTransform') {
        return left.imageTransform.scale === right.imageTransform.scale
          && left.imageTransform.offsetX === right.imageTransform.offsetX
          && left.imageTransform.offsetY === right.imageTransform.offsetY
          && left.imageTransform.rotation === right.imageTransform.rotation
      }
    }
    if (key === 'verticalAlign' && left.kind === 'text' && right.kind === 'text') {
      return (left.verticalAlign ?? 'top') === (right.verticalAlign ?? 'top')
    }
    return Object.is(Reflect.get(left, key), Reflect.get(right, key))
  })
}

function createSlotCopy(project: ZineProject, spread: Spread, source: Slot, offset = COPY_OFFSET_MM): Slot {
  const { pageW, spreadW, spreadH } = getSpreadSize(project.pageSize, project.pageOrientation, project.customSizeMm)
  const bleed = getProjectBleedMm(project)
  const offsetWithin = (value: number, max: number) => {
    const limit = Math.max(-bleed, max)
    return Math.max(-bleed, Math.min(limit, value + offset <= limit ? value + offset : value - offset))
  }
  const slot: Slot = {
    ...structuredClone(source),
    id: createZineId(),
    locked: false,
    x: offsetWithin(source.x, spreadW + bleed - source.w),
    y: offsetWithin(source.y, spreadH + bleed - source.h),
    zIndex: Math.max(0, ...spread.slots.map((item) => item.zIndex)) + 1,
  }
  return { ...slot, page: getSlotPageSide(slot, pageW) }
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
  contentSpreads?: Spread[]
}

export type ZineSaveStatus = 'saved' | 'unsaved' | 'saving' | 'failed'
export type SlotReorderDirection = 'front' | 'back' | 'forward' | 'backward'

export interface ZineState {
  project: ZineProject | null
  activeSpreadId: string | null
  selectedSlotId: string | null
  editingSlotId: string | null
  dirty: boolean
  saving: boolean
  saveStatus: ZineSaveStatus
  aiTaskId: string | null
  undoStack: Spread[][]
  redoStack: Spread[][]
  createProject: (title: string, options?: CreateProjectOptions) => ZineProject
  loadProject: (id: string) => Promise<void>
  setProject: (project: ZineProject) => void
  setActiveSpread: (id: string) => void
  selectSlot: (id: string | null) => void
  editSlot: (id: string | null) => void
  updateSlot: (spreadId: string, slotId: string, patch: Partial<Slot>, options?: { recordHistory?: boolean }) => void
  addSlot: (spreadId: string, kind: SlotKind) => void
  removeSlot: (spreadId: string, slotId: string) => void
  duplicateSlot: (spreadId: string, slotId: string) => void
  copySlot: (spreadId: string, slotId: string) => void
  pasteSlot: (spreadId: string) => void
  reorderSlot: (spreadId: string, slotId: string, direction: SlotReorderDirection) => void
  setSlotStackOrder: (spreadId: string, orderedSlotIds: string[]) => void
  setSlotLocked: (spreadId: string, slotId: string, locked: boolean) => void
  addSpread: (templateId?: string) => void
  duplicateSpread: (spreadId: string) => void
  addPlazaSpread: (spread: Spread) => void
  addCoverSpread: () => void
  moveSpread: (id: string, direction: -1 | 1) => void
  removeSpread: (id: string) => void
  addAsset: (asset: ZineAsset) => void
  moveAsset: (id: string, targetId: string) => void
  rename: (title: string) => void
  setPageNumbers: (settings: ZinePageNumberSettings) => void
  pushHistory: () => void
  undo: () => void
  redo: () => void
  lockAiTask: (taskId: string) => boolean
  unlockAiTask: (taskId: string) => boolean
  applyAiSpread: (taskId: string, projectId: string, spread: Spread) => boolean
  save: () => Promise<boolean>
}

export const useZineStore = create<ZineState>()((set, get) => ({
  project: null,
  activeSpreadId: null,
  selectedSlotId: null,
  editingSlotId: null,
  dirty: false,
  saving: false,
  saveStatus: 'saved',
  aiTaskId: null,
  undoStack: [],
  redoStack: [],
  createProject: (title, options = {}) => {
    projectSession += 1
    slotClipboard = null
    const now = Date.now()
    const pageSize = options.pageSize ?? 'a5'
    const pageOrientation = options.pageOrientation ?? 'portrait'
    const customSizeMm = pageSize === 'custom' ? clampCustomSizeMm(options.customSizeMm ?? { width: 148, height: 210 }) : undefined
    const { pageW, pageH } = getSpreadSize(pageSize, pageOrientation, customSizeMm)
    const coverSpread = buildSpreadFromTemplate(ZINE_COVER_TEMPLATE.id, pageW, pageH, { role: 'cover', bleedMm: DEFAULT_BLEED_MM })
    const contentSpreads = options.contentSpreads?.length
      ? cloneSpreads(options.contentSpreads).map((spread) => ({
        ...spread,
        id: createZineId(),
        role: 'content' as const,
        slots: spread.slots.map((slot) => ({ ...slot, id: createZineId() })),
      }))
      : [buildSpreadFromTemplate(DEFAULT_TEMPLATE_ID, pageW, pageH, { bleedMm: DEFAULT_BLEED_MM })]
    const project: ZineProject = {
      id: createZineId(),
      title,
      pageSize,
      pageOrientation,
      geometryVersion: ZINE_GEOMETRY_VERSION,
      ...(customSizeMm ? { customSizeMm } : {}),
      bleedMm: DEFAULT_BLEED_MM,
      createdBy: options.createdBy ?? 'local',
      createdAt: now,
      updatedAt: now,
      spreads: [coverSpread, ...contentSpreads],
      assets: [],
    }

    set({ project, activeSpreadId: coverSpread.id, selectedSlotId: null, editingSlotId: null, dirty: true, saveStatus: 'unsaved', aiTaskId: null, undoStack: [], redoStack: [] })
    scheduleAutosave()
    return project
  },
  loadProject: async (id) => {
    const session = ++projectSession
    slotClipboard = null
    set({ selectedSlotId: null, editingSlotId: null })
    const project = await getZineProject(id)
    const migratedProject = project ? migrateProjectGeometry(project) : null
    const hydratedProject = migratedProject ? await hydrateLocalAssets(migratedProject) : null
    if (session !== projectSession) return

    // Writes of the outgoing project may start while loading is awaiting I/O.
    // Their completion must not change the newly loaded project's save state.
    projectSession += 1
    const migrated = Boolean(project && project.geometryVersion !== ZINE_GEOMETRY_VERSION)
    clearAutosave()
    set({ project: hydratedProject, activeSpreadId: hydratedProject?.spreads[0]?.id ?? null, selectedSlotId: null, editingSlotId: null, dirty: migrated, saveStatus: migrated ? 'unsaved' : 'saved', aiTaskId: null, undoStack: [], redoStack: [] })
    if (project && project.geometryVersion !== ZINE_GEOMETRY_VERSION) scheduleAutosave()
  },
  setProject: (project) => {
    projectSession += 1
    slotClipboard = null
    clearAutosave()
    const migratedProject = migrateProjectGeometry(project)
    const migrated = project.geometryVersion !== ZINE_GEOMETRY_VERSION
    set({ project: migratedProject, activeSpreadId: migratedProject.spreads[0]?.id ?? null, selectedSlotId: null, editingSlotId: null, dirty: migrated, saveStatus: migrated ? 'unsaved' : 'saved', aiTaskId: null, undoStack: [], redoStack: [] })
    if (project.geometryVersion !== ZINE_GEOMETRY_VERSION) scheduleAutosave()
  },
  setActiveSpread: (id) => set((state) => {
    if (state.aiTaskId || state.activeSpreadId === id || !state.project?.spreads.some((spread) => spread.id === id)) return state
    return { activeSpreadId: id, selectedSlotId: null, editingSlotId: null }
  }),
  selectSlot: (id) => set((state) => {
    const spread = state.project?.spreads.find((item) => item.id === state.activeSpreadId)
    const selectedSlotId = spread?.slots.some((slot) => slot.id === id) ? id : null
    if (state.selectedSlotId === selectedSlotId) return state
    return { selectedSlotId, editingSlotId: null }
  }),
  editSlot: (id) => set((state) => {
    if (id === null) return state.editingSlotId === null ? state : { editingSlotId: null }
    if (state.aiTaskId) return state

    const spread = state.project?.spreads.find((item) => item.id === state.activeSpreadId)
    const slot = spread?.slots.find((item) => item.id === id)
    if (!slot || slot.locked || state.editingSlotId === id) return state
    if (slot.kind === 'image' && !state.project?.assets.some((asset) => asset.id === slot.assetId)) return state
    return { selectedSlotId: id, editingSlotId: id }
  }),
  updateSlot: (spreadId, slotId, patch, options = {}) => set((state) => {
    if (!state.project || state.aiTaskId) return state
    const spread = state.project.spreads.find((item) => item.id === spreadId)
    const slot = spread?.slots.find((item) => item.id === slotId)
    if (!slot || slot.locked) return state

    // Identity and locking have dedicated commands; property edits cannot
    // invalidate selection or bypass the lock command's editing cleanup.
    const nextSlot = { ...slot, ...patch, id: slot.id, kind: slot.kind, locked: slot.locked } as Slot
    if (slot.kind === 'image' && nextSlot.kind === 'image') {
      nextSlot.imageTransform = { ...slot.imageTransform, ...nextSlot.imageTransform }
    }
    if (slotsEqual(slot, nextSlot)) return state

    const spreads = state.project.spreads.map((item) => item.id === spreadId
      ? { ...item, slots: item.slots.map((candidate) => candidate.id === slotId ? nextSlot : candidate) }
      : item)
    return withSpreadChange(state, spreads, options.recordHistory ?? true)
  }),
  addSlot: (spreadId, kind) => set((state) => {
    if (!state.project || state.aiTaskId) return state
    const spread = state.project.spreads.find((item) => item.id === spreadId)
    if (!spread) return state

    const { pageW, pageH } = getSpreadSize(state.project.pageSize, state.project.pageOrientation, state.project.customSizeMm)
    const nextZIndex = Math.max(0, ...spread.slots.map((slot) => slot.zIndex)) + 1
    const slot = kind === 'text' ? createTextSlot('left', pageW, pageH, nextZIndex) : createImageSlot('left', pageW, pageH, nextZIndex)
    const spreads = state.project.spreads.map((item) => item.id === spreadId ? { ...item, slots: [...item.slots, slot] } : item)

    return { ...withSpreadChange(state, spreads), activeSpreadId: spreadId, selectedSlotId: slot.id, editingSlotId: null }
  }),
  removeSlot: (spreadId, slotId) => set((state) => {
    if (!state.project || state.aiTaskId) return state
    const slot = state.project.spreads.find((item) => item.id === spreadId)?.slots.find((item) => item.id === slotId)
    if (!slot || slot.locked) return state

    const spreads = state.project.spreads.map((item) => item.id === spreadId
      ? { ...item, slots: item.slots.filter((candidate) => candidate.id !== slotId) }
      : item)
    return {
      ...withSpreadChange(state, spreads),
      selectedSlotId: state.selectedSlotId === slotId ? null : state.selectedSlotId,
      editingSlotId: state.editingSlotId === slotId ? null : state.editingSlotId,
    }
  }),
  duplicateSlot: (spreadId, slotId) => set((state) => {
    if (!state.project || state.aiTaskId) return state
    const spread = state.project.spreads.find((item) => item.id === spreadId)
    const source = spread?.slots.find((item) => item.id === slotId)
    if (!spread || !source) return state

    const slot = createSlotCopy(state.project, spread, source)
    const spreads = state.project.spreads.map((item) => item.id === spreadId ? { ...item, slots: [...item.slots, slot] } : item)
    return { ...withSpreadChange(state, spreads), activeSpreadId: spreadId, selectedSlotId: slot.id, editingSlotId: null }
  }),
  copySlot: (spreadId, slotId) => {
    const project = get().project
    const slot = project?.spreads.find((item) => item.id === spreadId)?.slots.find((item) => item.id === slotId)
    if (!project || !slot) return
    slotClipboard = { projectId: project.id, slot: structuredClone(slot), pasteCount: 0 }
  },
  pasteSlot: (spreadId) => set((state) => {
    if (!state.project || state.aiTaskId || slotClipboard?.projectId !== state.project.id) return state
    const spread = state.project.spreads.find((item) => item.id === spreadId)
    if (!spread) return state

    const slot = createSlotCopy(state.project, spread, slotClipboard.slot, COPY_OFFSET_MM * (slotClipboard.pasteCount + 1))
    slotClipboard.pasteCount += 1
    const spreads = state.project.spreads.map((item) => item.id === spreadId ? { ...item, slots: [...item.slots, slot] } : item)
    return { ...withSpreadChange(state, spreads), activeSpreadId: spreadId, selectedSlotId: slot.id, editingSlotId: null }
  }),
  reorderSlot: (spreadId, slotId, direction) => set((state) => {
    if (!state.project || state.aiTaskId) return state
    const spread = state.project.spreads.find((item) => item.id === spreadId)
    if (!spread) return state

    const ordered = [...spread.slots].sort((left, right) => left.zIndex - right.zIndex)
    const index = ordered.findIndex((slot) => slot.id === slotId)
    if (index < 0 || ordered[index].locked) return state
    const target = direction === 'front' ? ordered.length - 1
      : direction === 'back' ? 0
        : direction === 'forward' ? Math.min(index + 1, ordered.length - 1)
          : Math.max(index - 1, 0)
    if (target === index) return state

    const [moved] = ordered.splice(index, 1)
    ordered.splice(target, 0, moved)
    // Normalize integer stacking values in one transaction, including tied
    // legacy values, while keeping each unchanged element's relative order.
    const positions = new Map(ordered.map((slot, position) => [slot.id, position + 1]))
    const slots = spread.slots.map((slot) => {
      const zIndex = positions.get(slot.id)!
      return slot.zIndex === zIndex ? slot : { ...slot, zIndex }
    })
    const spreads = state.project.spreads.map((item) => item.id === spreadId ? { ...item, slots } : item)
    return withSpreadChange(state, spreads)
  }),
  setSlotStackOrder: (spreadId, orderedSlotIds) => set((state) => {
    if (!state.project || state.aiTaskId) return state
    const spread = state.project.spreads.find((item) => item.id === spreadId)
    if (!spread) return state
    if (orderedSlotIds.length !== spread.slots.length) return state
    const positions = new Map(orderedSlotIds.map((id, index) => [id, index + 1]))
    if (positions.size !== spread.slots.length || spread.slots.some((slot) => !positions.has(slot.id))) return state

    const slots = spread.slots.map((slot) => {
      const zIndex = positions.get(slot.id)!
      return slot.zIndex === zIndex ? slot : { ...slot, zIndex }
    })
    const spreads = state.project.spreads.map((item) => item.id === spreadId ? { ...item, slots } : item)
    return withSpreadChange(state, spreads)
  }),
  setSlotLocked: (spreadId, slotId, locked) => set((state) => {
    if (!state.project || state.aiTaskId) return state
    const slot = state.project.spreads.find((item) => item.id === spreadId)?.slots.find((item) => item.id === slotId)
    if (!slot || Boolean(slot.locked) === locked) return state

    const spreads = state.project.spreads.map((item) => item.id === spreadId
      ? { ...item, slots: item.slots.map((candidate) => candidate.id === slotId ? { ...candidate, locked } : candidate) }
      : item)
    return {
      ...withSpreadChange(state, spreads),
      editingSlotId: locked && state.editingSlotId === slotId ? null : state.editingSlotId,
    }
  }),
  addPlazaSpread: (spread) => set((state) => {
    if (!state.project || state.aiTaskId || state.project.spreads.some((item) => item.id === spread.id)) return state

    return {
      ...withSpreadChange(state, [...state.project.spreads, cloneSpreads([spread])[0]]),
      activeSpreadId: spread.id,
      selectedSlotId: null,
      editingSlotId: null,
    }
  }),
  addSpread: (templateId = DEFAULT_TEMPLATE_ID) => set((state) => {
    if (!state.project || state.aiTaskId) return state

    const { pageW, pageH } = getSpreadSize(state.project.pageSize, state.project.pageOrientation, state.project.customSizeMm)
    const spread = buildSpreadFromTemplate(templateId, pageW, pageH, { bleedMm: getProjectBleedMm(state.project) })
    return {
      ...withSpreadChange(state, [...state.project.spreads, spread]),
      activeSpreadId: spread.id,
      selectedSlotId: null,
      editingSlotId: null,
    }
  }),
  duplicateSpread: (spreadId) => set((state) => {
    if (!state.project || state.aiTaskId) return state
    const index = state.project.spreads.findIndex((item) => item.id === spreadId)
    const source = state.project.spreads[index]
    if (!source || isCoverSpread(source)) return state

    const spread = cloneSpreads([source])[0]
    spread.id = createZineId()
    spread.slots = spread.slots.map((slot) => ({ ...slot, id: createZineId(), locked: false }))
    const spreads = [...state.project.spreads]
    spreads.splice(index + 1, 0, spread)
    return {
      ...withSpreadChange(state, spreads),
      activeSpreadId: spread.id,
      selectedSlotId: null,
      editingSlotId: null,
    }
  }),
  addCoverSpread: () => set((state) => {
    if (!state.project || state.aiTaskId || hasCoverSpread(state.project)) return state

    const { pageW, pageH } = getSpreadSize(state.project.pageSize, state.project.pageOrientation, state.project.customSizeMm)
    const spread = buildSpreadFromTemplate(ZINE_COVER_TEMPLATE.id, pageW, pageH, { role: 'cover', bleedMm: getProjectBleedMm(state.project) })
    return {
      ...withSpreadChange(state, [spread, ...state.project.spreads]),
      activeSpreadId: spread.id,
      selectedSlotId: null,
      editingSlotId: null,
    }
  }),
  moveSpread: (id, direction) => set((state) => {
    if (!state.project || state.aiTaskId) return state

    const index = state.project.spreads.findIndex((spread) => spread.id === id)
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= state.project.spreads.length) return state
    // 封面固定在首位：封面自身不可移动，内页也不可移到封面之前
    if (isCoverSpread(state.project.spreads[index]) || isCoverSpread(state.project.spreads[targetIndex])) return state

    const spreads = [...state.project.spreads]
    const [moved] = spreads.splice(index, 1)
    spreads.splice(targetIndex, 0, moved)
    return withSpreadChange(state, spreads)
  }),
  removeSpread: (id) => set((state) => {
    if (!state.project || state.aiTaskId) return state
    const target = state.project.spreads.find((spread) => spread.id === id)
    if (!target) return state
    // 至少保留一个内页跨页；封面随时可删（可通过添加封面恢复）
    const contentCount = state.project.spreads.filter((spread) => !isCoverSpread(spread)).length
    if (!isCoverSpread(target) && contentCount <= 1) return state

    const spreads = state.project.spreads.filter((spread) => spread.id !== id)
    const activeSpreadId = state.activeSpreadId === id ? spreads[0]?.id ?? null : state.activeSpreadId
    return { ...withSpreadChange(state, spreads), activeSpreadId, selectedSlotId: null, editingSlotId: null }
  }),
  addAsset: (asset) => {
    if (get().aiTaskId) return
    set((state) => {
      if (!state.project || state.project.assets.some((item) => item.id === asset.id)) return state
      return { project: withUpdatedProject(state.project, { assets: [...state.project.assets, asset] }), ...markDirty() }
    })
  },
  moveAsset: (id, targetId) => {
    if (get().aiTaskId || id === targetId) return
    const assets = get().project?.assets
    const sourceIndex = assets?.findIndex((asset) => asset.id === id) ?? -1
    const targetIndex = assets?.findIndex((asset) => asset.id === targetId) ?? -1
    if (!assets || sourceIndex < 0 || targetIndex < 0) return

    set((state) => {
      if (!state.project) return state

      const reorderedAssets = [...state.project.assets]
      const [movedAsset] = reorderedAssets.splice(sourceIndex, 1)
      reorderedAssets.splice(targetIndex, 0, movedAsset)

      return { project: withUpdatedProject(state.project, { assets: reorderedAssets }), ...markDirty() }
    })
  },
  rename: (title) => {
    if (get().aiTaskId) return
    set((state) => {
      if (!state.project || state.project.title === title) return state
      return { project: withUpdatedProject(state.project, { title }), ...markDirty() }
    })
  },
  setPageNumbers: (settings) => {
    if (get().aiTaskId) return
    set((state) => {
      if (!state.project) return state
      const current = state.project.pageNumbers ?? { enabled: false, position: 'bottom-outer' }
      if (current.enabled === settings.enabled && current.position === settings.position) return state
      return { project: withUpdatedProject(state.project, { pageNumbers: { ...settings } }), ...markDirty() }
    })
  },
  pushHistory: () => {
    if (get().aiTaskId) return
    const project = get().project
    if (!project) return

    set((state) => ({ undoStack: [...state.undoStack, cloneSpreads(project.spreads)].slice(-HISTORY_LIMIT), redoStack: [] }))
  },
  undo: () => {
    if (get().aiTaskId) return
    set((state) => {
      if (!state.project || state.undoStack.length === 0) return state.editingSlotId === null ? state : { editingSlotId: null }

      const previous = state.undoStack[state.undoStack.length - 1]
      const undoStack = state.undoStack.slice(0, -1)
      const redoStack = [...state.redoStack, cloneSpreads(state.project.spreads)].slice(-HISTORY_LIMIT)
      const activeSpreadId = previous.some((spread) => spread.id === state.activeSpreadId) ? state.activeSpreadId : previous[0]?.id ?? null

      return { project: withUpdatedProject(state.project, { spreads: cloneSpreads(previous) }), activeSpreadId, selectedSlotId: null, editingSlotId: null, undoStack, redoStack, ...markDirty() }
    })
  },
  redo: () => {
    if (get().aiTaskId) return
    set((state) => {
      if (!state.project || state.redoStack.length === 0) return state.editingSlotId === null ? state : { editingSlotId: null }

      const next = state.redoStack[state.redoStack.length - 1]
      const redoStack = state.redoStack.slice(0, -1)
      const undoStack = [...state.undoStack, cloneSpreads(state.project.spreads)].slice(-HISTORY_LIMIT)
      const activeSpreadId = next.some((spread) => spread.id === state.activeSpreadId) ? state.activeSpreadId : next[0]?.id ?? null

      return { project: withUpdatedProject(state.project, { spreads: cloneSpreads(next) }), activeSpreadId, selectedSlotId: null, editingSlotId: null, undoStack, redoStack, ...markDirty() }
    })
  },
  lockAiTask: (taskId) => {
    const currentTaskId = get().aiTaskId
    if (currentTaskId !== null && currentTaskId !== taskId) return false
    set({ aiTaskId: taskId, editingSlotId: null })
    return true
  },
  unlockAiTask: (taskId) => {
    if (get().aiTaskId !== taskId) return false
    set({ aiTaskId: null })
    return true
  },
  applyAiSpread: (taskId, projectId, spread) => {
    const state = get()
    if (state.aiTaskId !== taskId || state.project?.id !== projectId) return false
    const previous = state.project.spreads.find((candidate) => candidate.id === spread.id)
    if (!previous) return false
    if (previous.templateId === spread.templateId && previous.role === spread.role
      && previous.slots.length === spread.slots.length
      && previous.slots.every((slot, index) => slotsEqual(slot, spread.slots[index]))) return true

    const nextSpread = cloneSpreads([spread])[0]
    const nextSpreads = state.project.spreads.map((candidate) => (
      candidate.id === nextSpread.id ? nextSpread : candidate
    ))
    const activeSpread = nextSpreads.find((candidate) => candidate.id === state.activeSpreadId)
    const selectedSlotId = activeSpread?.slots.some((slot) => slot.id === state.selectedSlotId)
      ? state.selectedSlotId
      : null

    set({
      ...withSpreadChange(state, nextSpreads),
      selectedSlotId,
      editingSlotId: null,
    })
    return true
  },
  save: async () => {
    const state = get()
    const project = state.project
    if (!project || state.saving) return false

    const session = projectSession
    clearAutosave()
    set({ saving: true, saveStatus: 'saving' })

    try {
      await saveZineProject(project)
      set((current) => session === projectSession
        ? { ...resolveZineSaveSuccess(project, current.project, current.dirty), saving: false }
        : { saving: false })
      // An autosave timer may already have fired and returned while this
      // write was in flight. Always schedule the remaining dirty revision.
      if (get().dirty) scheduleAutosave()
      return true
    } catch {
      const current = get()
      const sameSession = session === projectSession
      set(sameSession ? { saving: false, ...resolveZineSaveFailure() } : { saving: false })
      // Retry a newer revision once, but leave an unchanged failed write for
      // explicit retry instead of creating an endless failing timer loop.
      if (get().dirty && (!sameSession || current.project !== project)) scheduleAutosave()
      toast.error('Zine 草稿保存失败')
      return false
    }
  },
}))
