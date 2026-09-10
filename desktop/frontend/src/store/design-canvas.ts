import { toast } from 'sonner'
import { create } from 'zustand'

import { getCanvasAssetBlob, getCanvasProject, saveCanvasAssetBlob, saveCanvasProject } from '@/lib/design-canvas/project'
import type { CanvasAsset, CanvasElement, CanvasProject, CanvasSaveStatus } from '@/lib/design-canvas/types'

const HISTORY_LIMIT = 50
const AUTOSAVE_DELAY_MS = 450

let autosaveTimer: number | null = null

function cloneProject(project: CanvasProject): CanvasProject {
  return structuredClone(project)
}

function scheduleAutosave() {
  if (autosaveTimer !== null) window.clearTimeout(autosaveTimer)
  autosaveTimer = window.setTimeout(() => {
    autosaveTimer = null
    void useDesignCanvasStore.getState().save()
  }, AUTOSAVE_DELAY_MS)
}

function dirtyState() {
  scheduleAutosave()
  return { dirty: true, saveStatus: 'unsaved' as const }
}

function updated(project: CanvasProject, patch: Partial<CanvasProject>): CanvasProject {
  return { ...project, ...patch, updatedAt: Date.now() }
}

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const result = { width: image.naturalWidth, height: image.naturalHeight }
      URL.revokeObjectURL(url)
      resolve(result)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Failed to read ${file.name}`))
    }
    image.src = url
  })
}

function revokeUrls(urls: Record<string, string>) {
  Object.values(urls).forEach((url) => URL.revokeObjectURL(url))
}

export interface DesignCanvasState {
  project: CanvasProject | null
  selectedElementId: string | null
  assetUrls: Record<string, string>
  undoStack: CanvasProject[]
  redoStack: CanvasProject[]
  dirty: boolean
  saveStatus: CanvasSaveStatus
  loading: boolean
  setProject: (project: CanvasProject) => void
  loadProject: (id: string) => Promise<void>
  dispose: () => void
  selectElement: (id: string | null) => void
  checkpoint: () => void
  updateElement: (id: string, patch: Partial<CanvasElement>, recordHistory?: boolean) => void
  setBackground: (color: string) => void
  rename: (title: string) => void
  importFiles: (files: File[]) => Promise<void>
  useAsset: (assetId: string) => void
  addElement: (type: CanvasElement['type']) => void
  deleteSelected: () => void
  duplicateSelected: () => void
  moveSelectedLayer: (direction: -1 | 1) => void
  undo: () => void
  redo: () => void
  save: () => Promise<boolean>
}

export const useDesignCanvasStore = create<DesignCanvasState>()((set, get) => ({
  project: null,
  selectedElementId: null,
  assetUrls: {},
  undoStack: [],
  redoStack: [],
  dirty: false,
  saveStatus: 'saved',
  loading: false,
  setProject: (project) => {
    revokeUrls(get().assetUrls)
    set({ project, selectedElementId: null, assetUrls: {}, undoStack: [], redoStack: [], dirty: false, saveStatus: 'saved', loading: false })
  },
  loadProject: async (id) => {
    set({ loading: true })
    try {
      const project = await getCanvasProject(id)
      const urls: Record<string, string> = {}
      if (project) {
        await Promise.all(project.assets.map(async (asset) => {
          try {
            const blob = await getCanvasAssetBlob(asset.blobId)
            if (blob) urls[asset.id] = URL.createObjectURL(blob)
          } catch (error) {
            console.warn(`Failed to hydrate canvas asset: ${asset.id}`, error)
          }
        }))
      }
      revokeUrls(get().assetUrls)
      set({ project, assetUrls: urls, selectedElementId: null, undoStack: [], redoStack: [], dirty: false, saveStatus: 'saved', loading: false })
    } catch (error) {
      console.error('Failed to load canvas project', error)
      revokeUrls(get().assetUrls)
      set({ project: null, assetUrls: {}, selectedElementId: null, undoStack: [], redoStack: [], dirty: false, saveStatus: 'failed', loading: false })
      toast.error('画布项目加载失败')
    }
  },
  dispose: () => {
    revokeUrls(get().assetUrls)
    if (autosaveTimer !== null) window.clearTimeout(autosaveTimer)
    autosaveTimer = null
    set({ project: null, selectedElementId: null, assetUrls: {}, undoStack: [], redoStack: [], dirty: false, saveStatus: 'saved', loading: false })
  },
  selectElement: (id) => set({ selectedElementId: id }),
  checkpoint: () => {
    const project = get().project
    if (!project) return
    set((state) => ({ undoStack: [...state.undoStack, cloneProject(project)].slice(-HISTORY_LIMIT), redoStack: [] }))
  },
  updateElement: (id, patch, recordHistory = true) => {
    const project = get().project
    if (!project?.elements.some((element) => element.id === id)) return
    if (recordHistory) get().checkpoint()
    set((state) => {
      if (!state.project) return state
      const elements = state.project.elements.map((element) => element.id === id ? ({ ...element, ...patch } as CanvasElement) : element)
      return { project: updated(state.project, { elements }), redoStack: [], ...dirtyState() }
    })
  },
  setBackground: (background) => {
    if (get().project?.background === background) return
    get().checkpoint()
    set((state) => state.project ? ({ project: updated(state.project, { background }), redoStack: [], ...dirtyState() }) : state)
  },
  rename: (title) => set((state) => state.project ? ({ project: updated(state.project, { title }), ...dirtyState() }) : state),
  importFiles: async (files) => {
    const project = get().project
    if (!project || files.length === 0) return
    const accepted = files.filter((file) => file.type.startsWith('image/'))
    if (accepted.length === 0) return
    const additions: CanvasAsset[] = []
    const nextUrls: Record<string, string> = {}
    for (const file of accepted) {
      const id = crypto.randomUUID?.() ?? `asset_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const blobId = `canvas_asset_${id}`
      const dimensions = await readImageDimensions(file)
      await saveCanvasAssetBlob(blobId, file)
      additions.push({ id, blobId, name: file.name, mimeType: file.type, ...dimensions, createdAt: Date.now() })
      nextUrls[id] = URL.createObjectURL(file)
    }
    get().checkpoint()
    set((state) => {
      if (!state.project) return state
      return {
        project: updated(state.project, { assets: [...state.project.assets, ...additions] }),
        assetUrls: { ...state.assetUrls, ...nextUrls },
        redoStack: [],
        ...dirtyState(),
      }
    })
    if (additions[0]) get().useAsset(additions[0].id)
  },
  useAsset: (assetId) => {
    const state = get()
    const project = state.project
    if (!project?.assets.some((asset) => asset.id === assetId)) return
    const selected = project.elements.find((element) => element.id === state.selectedElementId && element.type === 'image')
    const target = selected ?? project.elements.find((element) => element.type === 'image' && !element.assetId)
    get().checkpoint()

    if (target) {
      set((current) => {
        if (!current.project) return current
        const elements = current.project.elements.map((element) => element.id === target.id ? ({ ...element, assetId } as CanvasElement) : element)
        return { project: updated(current.project, { elements }), selectedElementId: target.id, redoStack: [], ...dirtyState() }
      })
      return
    }

    set((current) => {
      if (!current.project) return current
      const size = Math.min(current.project.width, current.project.height) * 0.42
      const element: CanvasElement = {
        id: crypto.randomUUID?.() ?? `frame_${Date.now()}`,
        type: 'image',
        assetId,
        fit: 'cover',
        radius: 0,
        opacity: 1,
        rotation: 0,
        width: size,
        height: size,
        x: (current.project.width - size) / 2,
        y: (current.project.height - size) / 2,
      }
      return { project: updated(current.project, { elements: [...current.project.elements, element] }), selectedElementId: element.id, redoStack: [], ...dirtyState() }
    })
  },
  addElement: (type) => {
    const project = get().project
    if (!project) return
    get().checkpoint()
    const base = {
      id: crypto.randomUUID?.() ?? `element_${Date.now()}`,
      x: project.width * 0.3,
      y: project.height * 0.3,
      width: project.width * 0.4,
      height: project.height * 0.3,
      rotation: 0,
      opacity: 1,
    }
    const element: CanvasElement = type === 'image'
      ? { ...base, type: 'image', assetId: null, fit: 'cover', radius: 0 }
      : type === 'text'
        ? { ...base, type: 'text', text: 'Text', color: '#111111', fontFamily: 'Montserrat', fontSize: Math.round(project.width * 0.06), fontWeight: 500, align: 'left' }
        : { ...base, type: 'shape', shape: 'rectangle', fill: '#D8DEE0', radius: 0 }
    set((state) => state.project ? ({
      project: updated(state.project, { elements: [...state.project.elements, element] }),
      selectedElementId: element.id,
      redoStack: [],
      ...dirtyState(),
    }) : state)
  },
  deleteSelected: () => {
    const { project, selectedElementId } = get()
    if (!project || !selectedElementId) return
    get().checkpoint()
    set((state) => state.project ? ({
      project: updated(state.project, { elements: state.project.elements.filter((element) => element.id !== selectedElementId) }),
      selectedElementId: null,
      redoStack: [],
      ...dirtyState(),
    }) : state)
  },
  duplicateSelected: () => {
    const { project, selectedElementId } = get()
    const element = project?.elements.find((item) => item.id === selectedElementId)
    if (!project || !element) return
    get().checkpoint()
    const duplicate: CanvasElement = {
      ...structuredClone(element),
      id: crypto.randomUUID?.() ?? `element_${Date.now()}`,
      x: Math.min(project.width - element.width, element.x + 48),
      y: Math.min(project.height - element.height, element.y + 48),
    }
    set((state) => state.project ? ({
      project: updated(state.project, { elements: [...state.project.elements, duplicate] }),
      selectedElementId: duplicate.id,
      redoStack: [],
      ...dirtyState(),
    }) : state)
  },
  moveSelectedLayer: (direction) => {
    const { project, selectedElementId } = get()
    if (!project || !selectedElementId) return
    const index = project.elements.findIndex((element) => element.id === selectedElementId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= project.elements.length) return
    get().checkpoint()
    const elements = [...project.elements]
    const [moved] = elements.splice(index, 1)
    elements.splice(target, 0, moved)
    set({ project: updated(project, { elements }), redoStack: [], ...dirtyState() })
  },
  undo: () => set((state) => {
    if (!state.project || state.undoStack.length === 0) return state
    const previous = state.undoStack[state.undoStack.length - 1]
    return {
      project: cloneProject(previous),
      selectedElementId: null,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, cloneProject(state.project)].slice(-HISTORY_LIMIT),
      ...dirtyState(),
    }
  }),
  redo: () => set((state) => {
    if (!state.project || state.redoStack.length === 0) return state
    const next = state.redoStack[state.redoStack.length - 1]
    return {
      project: cloneProject(next),
      selectedElementId: null,
      undoStack: [...state.undoStack, cloneProject(state.project)].slice(-HISTORY_LIMIT),
      redoStack: state.redoStack.slice(0, -1),
      ...dirtyState(),
    }
  }),
  save: async () => {
    const project = get().project
    if (!project) return false
    set({ saveStatus: 'saving' })
    try {
      await saveCanvasProject(project)
      set((state) => state.project?.updatedAt === project.updatedAt
        ? { dirty: false, saveStatus: 'saved' }
        : { saveStatus: 'unsaved' })
      return true
    } catch (error) {
      console.error('Failed to save canvas project', error)
      set({ saveStatus: 'failed' })
      toast.error('画布项目保存失败')
      return false
    }
  },
}))
