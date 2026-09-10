import {
  DeleteDesignCanvasProject as deleteNativeProject,
  GetDesignCanvasAssetBlob as getNativeAssetBlob,
  GetDesignCanvasProject as getNativeProject,
  ListDesignCanvasProjects as listNativeProjects,
  SaveDesignCanvasAssetBlob as saveNativeAssetBlob,
  SaveDesignCanvasProject as saveNativeProject,
} from '../../../wailsjs/go/main/App'

import { bumpDataRevision } from '@/lib/data-revision'
import type { CanvasProject } from './types'

const DB_NAME = 'mo-gallery-design-canvas'
const DB_VERSION = 1
const PROJECTS_STORE = 'projects'
const ASSETS_STORE = 'assets'

interface StoredAssetBlob {
  id: string
  blob: Blob
}

function hasNativeStorage(): boolean {
  if (typeof window === 'undefined') return false
  const bridge = (window as unknown as {
    go?: { main?: { App?: { ListDesignCanvasProjects?: () => Promise<string[]> } } }
  }).go?.main?.App
  return typeof bridge?.ListDesignCanvasProjects === 'function'
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PROJECTS_STORE)) {
        request.result.createObjectStore(PROJECTS_STORE, { keyPath: 'id' })
      }
      if (!request.result.objectStoreNames.contains(ASSETS_STORE)) {
        request.result.createObjectStore(ASSETS_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode)
    const request = action(transaction.objectStore(storeName))
    let result: T
    request.onsuccess = () => { result = request.result }
    request.onerror = () => { database.close(); reject(request.error) }
    transaction.onerror = () => { database.close(); reject(transaction.error) }
    transaction.onabort = () => { database.close(); reject(transaction.error) }
    transaction.oncomplete = () => { database.close(); resolve(result) }
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Failed to encode canvas asset'))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read canvas asset'))
    reader.readAsDataURL(blob)
  })
}

function dataUrlToBlob(dataUrl: string): Blob {
  const separator = dataUrl.indexOf(',')
  if (!dataUrl.startsWith('data:') || separator < 0) throw new Error('Invalid canvas asset data URL')
  const mimeType = dataUrl.slice(5, separator).replace(/;base64$/, '') || 'application/octet-stream'
  const binary = atob(dataUrl.slice(separator + 1))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: mimeType })
}

export async function listCanvasProjects(): Promise<CanvasProject[]> {
  const projects = hasNativeStorage()
    ? (await listNativeProjects()).map((value) => JSON.parse(value) as CanvasProject)
    : await withStore<CanvasProject[]>(PROJECTS_STORE, 'readonly', (store) => store.getAll())
  return projects.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getCanvasProject(id: string): Promise<CanvasProject | null> {
  if (hasNativeStorage()) {
    const value = await getNativeProject(id)
    return value ? JSON.parse(value) as CanvasProject : null
  }
  return (await withStore<CanvasProject | undefined>(PROJECTS_STORE, 'readonly', (store) => store.get(id))) ?? null
}

export async function saveCanvasProject(project: CanvasProject): Promise<void> {
  if (hasNativeStorage()) await saveNativeProject(JSON.stringify(project))
  else await withStore<IDBValidKey>(PROJECTS_STORE, 'readwrite', (store) => store.put(project))
  bumpDataRevision('canvas-projects')
}

export async function deleteCanvasProject(id: string): Promise<void> {
  if (hasNativeStorage()) await deleteNativeProject(id)
  else await withStore<undefined>(PROJECTS_STORE, 'readwrite', (store) => store.delete(id))
  bumpDataRevision('canvas-projects')
}

export async function saveCanvasAssetBlob(id: string, blob: Blob): Promise<void> {
  if (hasNativeStorage()) await saveNativeAssetBlob(id, await blobToDataUrl(blob))
  else await withStore<IDBValidKey>(ASSETS_STORE, 'readwrite', (store) => store.put({ id, blob }))
}

export async function getCanvasAssetBlob(id: string): Promise<Blob | null> {
  if (hasNativeStorage()) {
    const value = await getNativeAssetBlob(id)
    return value ? dataUrlToBlob(value) : null
  }
  const result = await withStore<StoredAssetBlob | undefined>(ASSETS_STORE, 'readonly', (store) => store.get(id))
  return result?.blob ?? null
}
