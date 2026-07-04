# Zine Editor MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a desktop Zine / personal photobook menu and MVP editor that creates local drafts, edits spread-based layouts, imports gallery/local images, manually transforms slots, edits simple text, and exports PDF.

**Architecture:** The feature is desktop-frontend only. `ZineProject`, `Spread`, and `Slot` are the single source of truth, rendered by an HTML/CSS editor canvas and by `@react-pdf/renderer` for export.

**Tech Stack:** Wails desktop frontend, React 19, TypeScript, Vite, Tailwind CSS 4, Zustand, IndexedDB, `react-moveable`, `@react-pdf/renderer`, existing `GetPhotos` Wails binding.

## Global Constraints

- Scope is desktop only; prefer changes under `desktop/frontend`.
- Do not modify Prisma schema, GORM models, or web API routes.
- Persist zine projects locally with IndexedDB; do not sync to DB or web.
- Support image sources from both existing photo library and local files.
- Use HTML/CSS divs plus `react-moveable` for the canvas; do not use Fabric.js or Konva.
- Use `@react-pdf/renderer` for PDF export.
- MVP includes manual layout, 3 starter templates, simple text, autosave, reopen drafts, standard PDF export, undo/redo.
- Defer cover/back editor, automatic layout, animated page flip, page-number generator, and print-grade 300 DPI export.
- Verify from `desktop/frontend` with `npm run build`.
- Do not commit unless explicitly requested during execution.

---

## File Structure

- Create `desktop/frontend/src/lib/zine/types.ts`: shared types.
- Create `desktop/frontend/src/lib/zine/page-sizes.ts`: fixed mm page sizes.
- Create `desktop/frontend/src/lib/zine/templates.ts`: 3 starter layout templates.
- Create `desktop/frontend/src/lib/zine/slot-render.ts`: mm-to-CSS/pdf style math.
- Create `desktop/frontend/src/lib/zine/project.ts`: IndexedDB project and asset CRUD.
- Create `desktop/frontend/src/lib/zine/history.ts`: spread snapshot helpers.
- Create `desktop/frontend/src/store/zine.ts`: Zustand editor state and autosave.
- Create `desktop/frontend/src/pages/ZinePage.tsx`: dashboard/list/new/delete/open.
- Create `desktop/frontend/src/pages/zine/ZineEditorPage.tsx`: editor route loader.
- Create `desktop/frontend/src/components/zine/*`: editor shell, canvas, slots, toolbar, photo tray, thumbnails.
- Create `desktop/frontend/src/components/zine/export/ZinePdfExporter.tsx`: PDF document/export flow.
- Modify `desktop/frontend/src/App.tsx`, `desktop/frontend/src/components/layout/Sidebar.tsx`, `desktop/frontend/src/lib/i18n/admin.ts`.
- Modify `desktop/frontend/package.json` and lockfile for `@react-pdf/renderer` and `react-moveable`.

---

### Task 1: Shared Zine Domain Model

**Files:**
- Create: `desktop/frontend/src/lib/zine/types.ts`
- Create: `desktop/frontend/src/lib/zine/page-sizes.ts`
- Create: `desktop/frontend/src/lib/zine/templates.ts`
- Create: `desktop/frontend/src/lib/zine/slot-render.ts`
- Create: `desktop/frontend/src/lib/zine/history.ts`

**Interfaces:**
- Produces: `ZineProject`, `Spread`, `Slot`, `ImageSlot`, `TextSlot`, `ZineAsset`, `ZinePageSize`, `PAGE_SIZES`, `getPageSize()`, `getSpreadSize()`, `ZINE_TEMPLATES`, `buildSpreadFromTemplate()`, `renderSlot()`, `cloneSpreads()`.
- Consumes: no zine interfaces from earlier tasks.

- [ ] **Step 1: Add dependencies**

Run from `desktop/frontend`:

```powershell
npm install @react-pdf/renderer react-moveable
```

Expected: install succeeds and updates `package.json` plus `package-lock.json`.

- [ ] **Step 2: Create `types.ts`**

Use this content:

```ts
import type { CSSProperties } from 'react'

export type ZinePageSize = 'a4' | 'a5' | 'letter' | 'square'
export type ZinePageOrientation = 'portrait' | 'landscape'
export type ZinePageSide = 'left' | 'right'
export type SlotKind = 'image' | 'text'
export type ZineAssetSource = 'library' | 'local'

export interface ZineImageTransform { scale: number; offsetX: number; offsetY: number; rotation: number }
export interface ZineProject { id: string; title: string; pageSize: ZinePageSize; pageOrientation: ZinePageOrientation; createdBy: string; createdAt: number; updatedAt: number; spreads: Spread[]; assets: ZineAsset[] }
export interface Spread { id: string; templateId: string; slots: Slot[] }
export interface SlotBase { id: string; kind: SlotKind; page: ZinePageSide; x: number; y: number; w: number; h: number; rotation: number; zIndex: number }
export interface ImageSlot extends SlotBase { kind: 'image'; assetId: string | null; imageTransform: ZineImageTransform }
export interface TextSlot extends SlotBase { kind: 'text'; content: string; align: 'left' | 'center' | 'right'; fontSize: number; lineHeight: number; color: string; fontFamily: string }
export type Slot = ImageSlot | TextSlot
export interface ZineAsset { id: string; source: ZineAssetSource; libraryPhotoId?: string; blobId?: string; fileName: string; width: number; height: number; dpi?: number; previewUrl: string; fullUrl: string; createdAt: number }
export interface ZinePageSizeDef { id: ZinePageSize; label: string; widthMm: number; heightMm: number }
export interface TemplateDef { id: string; nameKey: string; pageLayout: 'single' | 'two-up' | 'text-photo'; buildSlots: (pageW: number, pageH: number) => Slot[] }
export interface RenderedSlot { htmlStyle: CSSProperties; pdfStyle: Record<string, string | number>; imageInner?: { src: string; htmlStyle: CSSProperties; pdfStyle: Record<string, string | number> }; text?: { content: string; htmlStyle: CSSProperties; pdfStyle: Record<string, string | number> } }
```

- [ ] **Step 3: Create `page-sizes.ts`**

```ts
import type { ZinePageOrientation, ZinePageSize, ZinePageSizeDef } from './types'

export const PAGE_SIZES: Record<ZinePageSize, ZinePageSizeDef> = {
  a4: { id: 'a4', label: 'A4', widthMm: 210, heightMm: 297 },
  a5: { id: 'a5', label: 'A5', widthMm: 148, heightMm: 210 },
  letter: { id: 'letter', label: 'Letter', widthMm: 216, heightMm: 279 },
  square: { id: 'square', label: 'Square 200', widthMm: 200, heightMm: 200 },
}

export function getPageSize(size: ZinePageSize, orientation: ZinePageOrientation = 'portrait'): ZinePageSizeDef {
  const page = PAGE_SIZES[size]
  return orientation === 'portrait' ? page : { ...page, widthMm: page.heightMm, heightMm: page.widthMm }
}

export function getSpreadSize(size: ZinePageSize, orientation: ZinePageOrientation = 'portrait') {
  const page = getPageSize(size, orientation)
  return { pageW: page.widthMm, pageH: page.heightMm, spreadW: page.widthMm * 2, spreadH: page.heightMm }
}
```

- [ ] **Step 4: Create `templates.ts`**

```ts
import type { ImageSlot, Slot, TemplateDef, TextSlot } from './types'

function createZineId() {
  return crypto.randomUUID?.() ?? `zine_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

const margin = 12
const gap = 8

function imageSlot(page: 'left' | 'right', x: number, y: number, w: number, h: number, zIndex: number): ImageSlot {
  return { id: createZineId(), kind: 'image', page, x, y, w, h, rotation: 0, zIndex, assetId: null, imageTransform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 } }
}

function textSlot(page: 'left' | 'right', x: number, y: number, w: number, h: number, zIndex: number): TextSlot {
  return { id: createZineId(), kind: 'text', page, x, y, w, h, rotation: 0, zIndex, content: 'Untitled Zine', align: 'left', fontSize: 18, lineHeight: 1.25, color: '#111111', fontFamily: 'serif' }
}

export const ZINE_TEMPLATES: TemplateDef[] = [
  { id: 'single-photo-full', nameKey: 'admin.zine_template_single_full', pageLayout: 'single', buildSlots: (w, h) => [imageSlot('left', margin, margin, w - margin * 2, h - margin * 2, 1), imageSlot('right', margin, margin, w - margin * 2, h - margin * 2, 2)] },
  { id: 'two-up', nameKey: 'admin.zine_template_two_up', pageLayout: 'two-up', buildSlots: (w, h) => [imageSlot('left', margin, margin, w - margin * 2, (h - margin * 2 - gap) / 2, 1), imageSlot('left', margin, margin + (h - margin * 2 + gap) / 2, w - margin * 2, (h - margin * 2 - gap) / 2, 2), imageSlot('right', margin, margin, w - margin * 2, (h - margin * 2 - gap) / 2, 3), imageSlot('right', margin, margin + (h - margin * 2 + gap) / 2, w - margin * 2, (h - margin * 2 - gap) / 2, 4)] },
  { id: 'text-left-photo-right', nameKey: 'admin.zine_template_text_photo', pageLayout: 'text-photo', buildSlots: (w, h) => [textSlot('left', margin, margin, w - margin * 2, 56, 1), imageSlot('right', margin, margin, w - margin * 2, h - margin * 2, 2)] },
]

export function buildSpreadFromTemplate(templateId: string, pageW: number, pageH: number) {
  const template = ZINE_TEMPLATES.find((item) => item.id === templateId) ?? ZINE_TEMPLATES[0]
  return { id: createZineId(), templateId: template.id, slots: template.buildSlots(pageW, pageH) }
}
```

- [ ] **Step 5: Create `slot-render.ts` and `history.ts`**

`slot-render.ts`:

```ts
import type { CSSProperties } from 'react'
import type { RenderedSlot, Slot, ZineAsset } from './types'

export function renderSlot(slot: Slot, pageWmm: number, assets: ZineAsset[] = []): RenderedSlot {
  const left = slot.page === 'right' ? pageWmm + slot.x : slot.x
  const base = { position: 'absolute', left, top: slot.y, width: slot.w, height: slot.h, zIndex: slot.zIndex, overflow: 'hidden' } as const
  const transform = `rotate(${slot.rotation}deg)`
  const htmlStyle = { ...base, transform } as CSSProperties
  const pdfStyle = { ...base, transform }
  if (slot.kind === 'image') {
    const asset = assets.find((item) => item.id === slot.assetId)
    const innerTransform = `scale(${slot.imageTransform.scale}) translate(${slot.imageTransform.offsetX}%, ${slot.imageTransform.offsetY}%) rotate(${slot.imageTransform.rotation}deg)`
    return { htmlStyle, pdfStyle, imageInner: { src: asset?.fullUrl ?? '', htmlStyle: { width: '100%', height: '100%', objectFit: 'cover', transform: innerTransform }, pdfStyle: { width: '100%', height: '100%', objectFit: 'cover' } } }
  }
  return { htmlStyle, pdfStyle, text: { content: slot.content, htmlStyle: { fontSize: slot.fontSize, lineHeight: slot.lineHeight, color: slot.color, fontFamily: slot.fontFamily, textAlign: slot.align, whiteSpace: 'pre-wrap' }, pdfStyle: { fontSize: slot.fontSize, lineHeight: slot.lineHeight, color: slot.color, fontFamily: slot.fontFamily, textAlign: slot.align } } }
}
```

`history.ts`:

```ts
import type { Spread } from './types'

export function cloneSpreads(spreads: Spread[]): Spread[] {
  return structuredClone(spreads)
}
```

- [ ] **Step 6: Verify domain files compile**

Run from `desktop/frontend`:

```powershell
npm run build
```

Expected: TypeScript compile succeeds or only fails on files created in later tasks not yet present; after Task 1 alone, no references should require later files.

---

### Task 2: IndexedDB Persistence and Zustand Store

**Files:**
- Create: `desktop/frontend/src/lib/zine/project.ts`
- Create: `desktop/frontend/src/store/zine.ts`

**Interfaces:**
- Consumes: `ZineProject`, `ZineAsset`, `Spread`, `buildSpreadFromTemplate()`, `getSpreadSize()`, `cloneSpreads()`.
- Produces: `listZineProjects()`, `getZineProject()`, `saveZineProject()`, `deleteZineProject()`, `saveZineAssetBlob()`, `getZineAssetBlob()`, `useZineStore`.

- [ ] **Step 1: Create IndexedDB project CRUD**

Create `desktop/frontend/src/lib/zine/project.ts`:

```ts
import type { ZineProject } from './types'

const DB_NAME = 'mo-gallery-zine'
const PROJECT_STORE = 'projects'
const ASSET_STORE = 'assets'
const DB_VERSION = 1

function openZineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(PROJECT_STORE)) db.createObjectStore(PROJECT_STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(ASSET_STORE)) db.createObjectStore(ASSET_STORE, { keyPath: 'id' })
    }
  })
}

export async function listZineProjects(): Promise<ZineProject[]> {
  const db = await openZineDB()
  return new Promise((resolve, reject) => {
    const request = db.transaction(PROJECT_STORE, 'readonly').objectStore(PROJECT_STORE).getAll()
    request.onsuccess = () => resolve((request.result as ZineProject[]).sort((a, b) => b.updatedAt - a.updatedAt))
    request.onerror = () => reject(request.error)
  })
}

export async function getZineProject(id: string): Promise<ZineProject | null> {
  const db = await openZineDB()
  return new Promise((resolve, reject) => {
    const request = db.transaction(PROJECT_STORE, 'readonly').objectStore(PROJECT_STORE).get(id)
    request.onsuccess = () => resolve((request.result as ZineProject | undefined) ?? null)
    request.onerror = () => reject(request.error)
  })
}

export async function saveZineProject(project: ZineProject): Promise<void> {
  const db = await openZineDB()
  return new Promise((resolve, reject) => {
    const request = db.transaction(PROJECT_STORE, 'readwrite').objectStore(PROJECT_STORE).put(project)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function deleteZineProject(id: string): Promise<void> {
  const db = await openZineDB()
  return new Promise((resolve, reject) => {
    const request = db.transaction(PROJECT_STORE, 'readwrite').objectStore(PROJECT_STORE).delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function saveZineAssetBlob(id: string, blob: Blob): Promise<void> {
  const db = await openZineDB()
  return new Promise((resolve, reject) => {
    const request = db.transaction(ASSET_STORE, 'readwrite').objectStore(ASSET_STORE).put({ id, blob })
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function getZineAssetBlob(id: string): Promise<Blob | null> {
  const db = await openZineDB()
  return new Promise((resolve, reject) => {
    const request = db.transaction(ASSET_STORE, 'readonly').objectStore(ASSET_STORE).get(id)
    request.onsuccess = () => resolve((request.result as { blob: Blob } | undefined)?.blob ?? null)
    request.onerror = () => reject(request.error)
  })
}
```

- [ ] **Step 2: Create Zustand store**

Create `desktop/frontend/src/store/zine.ts` with actions matching this public shape:

```ts
import { create } from 'zustand'
import { toast } from 'sonner'
import { cloneSpreads } from '@/lib/zine/history'
import { getSpreadSize } from '@/lib/zine/page-sizes'
import { getZineProject, saveZineProject } from '@/lib/zine/project'
import { buildSpreadFromTemplate } from '@/lib/zine/templates'
import type { Slot, Spread, ZineAsset, ZinePageSize, ZineProject } from '@/lib/zine/types'

interface ZineStore { project: ZineProject | null; activeSpreadId: string | null; selectedSlotId: string | null; dirty: boolean; saving: boolean; undoStack: Spread[][]; redoStack: Spread[][]; createProject: (title: string, createdBy?: string, pageSize?: ZinePageSize) => ZineProject; loadProject: (id: string) => Promise<void>; setProject: (project: ZineProject) => void; setActiveSpread: (id: string) => void; selectSlot: (id: string | null) => void; updateSlot: (spreadId: string, slotId: string, patch: Partial<Slot>) => void; addSpread: (templateId?: string) => void; removeSpread: (id: string) => void; addAsset: (asset: ZineAsset) => void; rename: (title: string) => void; pushHistory: () => void; undo: () => void; redo: () => void; save: () => Promise<void> }

let saveTimer: number | null = null

function createZineId() {
  return crypto.randomUUID?.() ?? `zine_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function scheduleSave(save: () => Promise<void>) { if (saveTimer) window.clearTimeout(saveTimer); saveTimer = window.setTimeout(() => { void save() }, 300) }

export const useZineStore = create<ZineStore>((set, get) => ({
  project: null, activeSpreadId: null, selectedSlotId: null, dirty: false, saving: false, undoStack: [], redoStack: [],
  createProject(title, createdBy = 'local', pageSize = 'a5') { const { pageW, pageH } = getSpreadSize(pageSize); const spread = buildSpreadFromTemplate('single-photo-full', pageW, pageH); const now = Date.now(); const project = { id: createZineId(), title, pageSize, pageOrientation: 'portrait' as const, createdBy, createdAt: now, updatedAt: now, spreads: [spread], assets: [] }; set({ project, activeSpreadId: spread.id, selectedSlotId: null, dirty: true, undoStack: [], redoStack: [] }); scheduleSave(get().save); return project },
  async loadProject(id) { const project = await getZineProject(id); if (!project) throw new Error('Zine project not found'); set({ project, activeSpreadId: project.spreads[0]?.id ?? null, selectedSlotId: null, dirty: false, undoStack: [], redoStack: [] }) },
  setProject(project) { set({ project, activeSpreadId: project.spreads[0]?.id ?? null, dirty: true }); scheduleSave(get().save) },
  setActiveSpread(id) { set({ activeSpreadId: id, selectedSlotId: null }) },
  selectSlot(id) { set({ selectedSlotId: id }) },
  pushHistory() { const project = get().project; if (!project) return; set((state) => ({ undoStack: [...state.undoStack.slice(-49), cloneSpreads(project.spreads)], redoStack: [] })) },
  updateSlot(spreadId, slotId, patch) { get().pushHistory(); set((state) => state.project ? { dirty: true, project: { ...state.project, updatedAt: Date.now(), spreads: state.project.spreads.map((spread) => spread.id === spreadId ? { ...spread, slots: spread.slots.map((slot) => slot.id === slotId ? { ...slot, ...patch } as Slot : slot) } : spread) } } : state); scheduleSave(get().save) },
  addSpread(templateId = 'single-photo-full') { const project = get().project; if (!project) return; get().pushHistory(); const { pageW, pageH } = getSpreadSize(project.pageSize, project.pageOrientation); const spread = buildSpreadFromTemplate(templateId, pageW, pageH); set((state) => state.project ? { project: { ...state.project, updatedAt: Date.now(), spreads: [...state.project.spreads, spread] }, activeSpreadId: spread.id, dirty: true } : state); scheduleSave(get().save) },
  removeSpread(id) { const project = get().project; if (!project || project.spreads.length <= 1) return; get().pushHistory(); const spreads = project.spreads.filter((spread) => spread.id !== id); set({ project: { ...project, updatedAt: Date.now(), spreads }, activeSpreadId: spreads[0]?.id ?? null, dirty: true }); scheduleSave(get().save) },
  addAsset(asset) { set((state) => state.project ? { project: { ...state.project, updatedAt: Date.now(), assets: [...state.project.assets.filter((item) => item.id !== asset.id), asset] }, dirty: true } : state); scheduleSave(get().save) },
  rename(title) { set((state) => state.project ? { project: { ...state.project, title, updatedAt: Date.now() }, dirty: true } : state); scheduleSave(get().save) },
  undo() { const { project, undoStack } = get(); if (!project || !undoStack.length) return; const previous = undoStack[undoStack.length - 1]; set((state) => ({ project: { ...project, spreads: previous, updatedAt: Date.now() }, undoStack: state.undoStack.slice(0, -1), redoStack: [...state.redoStack, cloneSpreads(project.spreads)], dirty: true })); scheduleSave(get().save) },
  redo() { const { project, redoStack } = get(); if (!project || !redoStack.length) return; const next = redoStack[redoStack.length - 1]; set((state) => ({ project: { ...project, spreads: next, updatedAt: Date.now() }, redoStack: state.redoStack.slice(0, -1), undoStack: [...state.undoStack, cloneSpreads(project.spreads)], dirty: true })); scheduleSave(get().save) },
  async save() { const project = get().project; if (!project) return; set({ saving: true }); try { await saveZineProject({ ...project, updatedAt: Date.now() }); set({ dirty: false }) } catch (err) { console.error(err); toast.error('Zine 草稿保存失败') } finally { set({ saving: false }) } },
}))
```

- [ ] **Step 3: Verify persistence layer compiles**

Run `npm run build` from `desktop/frontend`. Expected: build succeeds or errors only identify type issues inside files from this task; fix all such errors before proceeding.

---

### Task 3: Navigation, Routes, and Zine Dashboard

**Files:**
- Create: `desktop/frontend/src/pages/ZinePage.tsx`
- Create: `desktop/frontend/src/pages/zine/ZineEditorPage.tsx`
- Modify: `desktop/frontend/src/App.tsx`
- Modify: `desktop/frontend/src/components/layout/Sidebar.tsx`
- Modify: `desktop/frontend/src/lib/i18n/admin.ts`

**Interfaces:**
- Consumes: `listZineProjects()`, `deleteZineProject()`, `useZineStore.createProject()`, `useZineStore.loadProject()`.
- Produces: working `/zine` and `/zine/editor/:projectId` routes.

- [ ] **Step 1: Add i18n keys**

Add these keys under both `zh.admin` and `en.admin` in `desktop/frontend/src/lib/i18n/admin.ts`:

```ts
zine: 'Zine',
zine_editor: 'Zine 编辑器',
zine_new: '新建 Zine',
zine_no_projects: '暂无 Zine 草稿',
zine_open: '打开',
zine_delete_confirm: '确定要删除这个 Zine 草稿吗？',
zine_template_single_full: '整页图片',
zine_template_two_up: '双图排版',
zine_template_text_photo: '文字 + 图片',
```

For English values use `Zine`, `Zine Editor`, `New Zine`, `No zine drafts yet`, `Open`, `Delete this zine draft?`, `Full-page Photos`, `Two-up`, `Text + Photo`.

- [ ] **Step 2: Create dashboard page**

Create `ZinePage.tsx` with a `PageHeader`, project list, create button, open button, and delete button. On create, call `useZineStore.getState().createProject('Untitled Zine')`, then navigate to `/zine/editor/${project.id}`. On delete, call `deleteZineProject(id)` and refresh `listZineProjects()`.

- [ ] **Step 3: Create editor route loader**

Create `pages/zine/ZineEditorPage.tsx` that reads `projectId` from `useParams()`, calls `useZineStore().loadProject(projectId)` in `useEffect`, shows a loading/error panel, and renders a simple placeholder panel with project title and spread count. Task 4 replaces the placeholder with `<ZineEditor />`.

- [ ] **Step 4: Wire routes and menu**

In `App.tsx`, import `ZinePage` and `ZineEditorPage`, then add:

```tsx
<Route path="zine" element={<ZinePage />} />
<Route path="zine/editor/:projectId" element={<ZineEditorPage />} />
```

In `Sidebar.tsx`, import a distinct lucide icon such as `BookImage`, then add nav item after photo journal:

```ts
{ path: '/zine', icon: BookImage, key: 'admin.zine' },
```

- [ ] **Step 5: Verify navigation**

Run `npm run build` from `desktop/frontend`. Expected: build succeeds. Manual check in dev: sidebar shows Zine, `/zine` loads, create navigates to editor URL.

---

### Task 4: Editor Shell, Templates, and Static Spread Canvas

**Files:**
- Create: `desktop/frontend/src/components/zine/ZineEditor.tsx`
- Create: `desktop/frontend/src/components/zine/ZineToolbar.tsx`
- Create: `desktop/frontend/src/components/zine/TemplateGallery.tsx`
- Create: `desktop/frontend/src/components/zine/PageStrip.tsx`
- Create: `desktop/frontend/src/components/zine/PageThumb.tsx`
- Create: `desktop/frontend/src/components/zine/SpreadCanvas.tsx`
- Create: `desktop/frontend/src/components/zine/SlotView.tsx`
- Create: `desktop/frontend/src/components/zine/SlotImageContent.tsx`
- Create: `desktop/frontend/src/components/zine/SlotTextContent.tsx`

**Interfaces:**
- Consumes: `useZineStore`, `renderSlot()`, `getSpreadSize()`, `ZINE_TEMPLATES`.
- Produces: visible editor shell with current spread, page strip, template picker, and read-only slots.

- [ ] **Step 1: Implement editor shell**

`ZineEditor` layout: top toolbar, center canvas, right page strip, bottom placeholder photo tray container. If `project` is null, render centered `Zine project not loaded`.

- [ ] **Step 2: Implement toolbar and template picker**

`ZineToolbar` shows project title editable input, save state (`saving`/`dirty`), buttons: `Undo`, `Redo`, `Add Spread`, `Templates`, `Export PDF`. `TemplateGallery` lists `ZINE_TEMPLATES`; clicking a template calls `addSpread(template.id)`.

- [ ] **Step 3: Implement page strip**

`PageStrip` maps `project.spreads`, highlights `activeSpreadId`, and calls `setActiveSpread(spread.id)`. Each `PageThumb` renders small rectangles for slots without images.

- [ ] **Step 4: Implement static canvas and slot content**

`SpreadCanvas` computes `scale` from container width using `ResizeObserver`, then renders two page panels and each slot. Convert millimeters to pixels by applying `transform: scale(${scale})` to a fixed-mm logical layer or by multiplying `left/top/width/height` from `renderSlot()`. `SlotImageContent` shows a gray placeholder if no asset is assigned. `SlotTextContent` shows plain text with `white-space: pre-wrap`.

- [ ] **Step 5: Verify static editor**

Run `npm run build`. Manual check: new project opens with one spread, two image placeholders, template add creates a new spread, page strip switches spreads.

---

### Task 5: Photo Tray and Manual Image Placement

**Files:**
- Create: `desktop/frontend/src/components/zine/PhotoTray.tsx`
- Create: `desktop/frontend/src/components/zine/PhotoTrayLibrary.tsx`
- Create: `desktop/frontend/src/components/zine/PhotoTrayLocalImport.tsx`
- Modify: `desktop/frontend/src/components/zine/SlotView.tsx`
- Modify: `desktop/frontend/src/components/zine/SlotImageContent.tsx`

**Interfaces:**
- Consumes: `useZineStore.addAsset()`, `useZineStore.updateSlot()`, existing Wails `window.go.main.App.GetPhotos`.
- Produces: assets can be imported from library/local files and assigned to image slots by click or drag-drop.

- [ ] **Step 1: Implement photo tray tabs**

`PhotoTray` keeps `activeTab: 'library' | 'local'`, renders both tab buttons, and passes `onPickAsset(asset)` to children. `onPickAsset` assigns to the selected image slot if one is selected; if not, it toast-errors `请先选择一个图片槽`.

- [ ] **Step 2: Implement library tab**

`PhotoTrayLibrary` calls `(window as any).go.main.App.GetPhotos({ page: 1, pageSize: 60 })`, normalizes either `result.data` or array result into `ZineAsset[]` with `source: 'library'`, `previewUrl: photo.thumbnailUrl || photo.url`, `fullUrl: photo.url`, `width/height` from photo.

- [ ] **Step 3: Implement local import tab**

Use `<input type="file" accept="image/*" multiple />`. For each file, create `URL.createObjectURL(file)`, read image dimensions with `new Image()`, call `saveZineAssetBlob(asset.id, file)`, then `addAsset(asset)`.

- [ ] **Step 4: Assign assets to slots**

In `SlotView`, accept drag data type `application/x-zine-asset-id`. On drop over an image slot, call `updateSlot(spread.id, slot.id, { assetId })`. Also allow click selection then tray click assignment.

- [ ] **Step 5: Verify image assignment**

Run `npm run build`. Manual check: local image appears in tray, assigned slot displays it, reload editor keeps project asset metadata; library image appears and can be assigned.

---

### Task 6: Moveable Transforms, Text Editing, Undo/Redo

**Files:**
- Modify: `desktop/frontend/src/components/zine/SlotView.tsx`
- Modify: `desktop/frontend/src/components/zine/SlotTextContent.tsx`
- Modify: `desktop/frontend/src/components/zine/ZineToolbar.tsx`
- Modify: `desktop/frontend/src/store/zine.ts`

**Interfaces:**
- Consumes: `useZineStore.updateSlot()`, `undo()`, `redo()`, `selectSlot()`.
- Produces: selected slots can move, resize, rotate, edit text, undo, redo.

- [ ] **Step 1: Integrate `react-moveable`**

When a slot is selected, attach `Moveable` to its DOM ref. Enable `draggable`, `resizable`, `rotatable`, `snappable`. On drag/resize/rotate end, convert pixel delta back to millimeters using current canvas scale and call `updateSlot()` with new `x/y/w/h/rotation`.

- [ ] **Step 2: Text editing**

`SlotTextContent` uses `contentEditable`, `suppressContentEditableWarning`, updates content on `onBlur`, and handles `Ctrl+B`/`Meta+B` by wrapping selected text with `**` in the internal text area model. If selection cannot be read, append `**bold**` to the end.

- [ ] **Step 3: Toolbar undo/redo**

Wire toolbar buttons to `useZineStore().undo()` and `.redo()`. Disable based on `undoStack.length === 0` and `redoStack.length === 0`.

- [ ] **Step 4: Verify transforms and history**

Run `npm run build`. Manual check: selecting slot shows transform controls; move/resize/rotate updates layout; undo and redo restore previous spread snapshots; text edits persist after reload.

---

### Task 7: PDF Export and Final Verification

**Files:**
- Create: `desktop/frontend/src/components/zine/export/ZinePdfExporter.tsx`
- Modify: `desktop/frontend/src/components/zine/ZineToolbar.tsx`
- Modify: `desktop/frontend/src/lib/zine/slot-render.ts` if PDF style mapping needs correction.

**Interfaces:**
- Consumes: `ZineProject`, `getSpreadSize()`, `renderSlot()`.
- Produces: an export action that downloads a PDF with one PDF page per spread.

- [ ] **Step 1: Implement PDF document**

Create a `ZinePdfDocument({ project })` component using `Document`, `Page`, `View`, `Image`, and `Text` from `@react-pdf/renderer`. For each spread, render `<Page size={[spreadW, spreadH]}>`; for each slot, use `renderSlot(slot, pageW, project.assets)`.

- [ ] **Step 2: Implement export action**

In `ZinePdfExporter`, use `pdf(<ZinePdfDocument project={project} />).toBlob()`, then create an object URL and click a hidden `<a download={`${project.title || 'zine'}.pdf`}>`.

- [ ] **Step 3: Wire toolbar export button**

Toolbar export button calls exporter; during export show disabled state `导出中...`; on success toast `PDF 已导出`; on failure toast `PDF 导出失败` and log error.

- [ ] **Step 4: Full build verification**

Run from `desktop/frontend`:

```powershell
npm run build
```

Expected: `tsc && vite build` completes successfully.

- [ ] **Step 5: Manual acceptance check**

Verify all MVP checks: create project, rename, add spread, switch spread, import local file, pick library photo, assign image, move/resize/rotate slot, edit text, undo/redo, reload draft, export PDF, open exported PDF and confirm text is visible and spread layout matches editor.

---

## Self-Review

- Spec coverage: tasks cover dependencies, types, IndexedDB, Zustand, routes, side menu, i18n, project dashboard, static canvas, templates, photo tray, local/gallery assets, manual transforms, text editing, undo/redo, and PDF export.
- Deferred scope is explicit: cover/back editor, auto-layout, page flip, page numbers, and print-grade export are not in this MVP plan.
- Type consistency: `ZineProject`, `Spread`, `Slot`, `ZineAsset`, `renderSlot()`, `buildSpreadFromTemplate()`, and `useZineStore` names match across tasks.
- Placeholder scan: no task uses `TBD`, `TODO`, `similar`, or undefined function names.
