import {
  DeleteZineProject as deleteNativeZineProject,
  GetZineAssetBlob as getNativeZineAssetBlob,
  GetZineProject as getNativeZineProject,
  ListZineProjects as listNativeZineProjects,
  SaveZineAssetBlob as saveNativeZineAssetBlob,
  SaveZineProject as saveNativeZineProject,
} from '../../../wailsjs/go/main/App'

import { bumpDataRevision } from '@/lib/data-revision'
import { migrateProjectGeometry } from './geometry'
import type { ZineProject } from './types'

const DB_NAME = 'mo-gallery-zine'
const DB_VERSION = 1
const PROJECTS_STORE = 'projects'
const ASSETS_STORE = 'assets'
const PREVIOUS_MIGRATION_KEY = 'mo-gallery-zine-sqlite-migration-v1'
const LEGACY_MIGRATION_KEY = 'mo-gallery-zine-sqlite-migration-v2'

interface StoredAssetBlob {
  id: string
  blob: Blob
}

let legacyMigrationPromise: Promise<void> | null = null

function hasNativeZineStorage(): boolean {
  if (typeof window === 'undefined') return false
  const bridge = (window as unknown as {
    go?: { main?: { App?: { ListZineProjects?: () => Promise<string[]> } } }
  }).go?.main?.App
  return typeof bridge?.ListZineProjects === 'function'
}

function openLegacyZineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains(PROJECTS_STORE)) {
        database.createObjectStore(PROJECTS_STORE, { keyPath: 'id' })
      }

      if (!database.objectStoreNames.contains(ASSETS_STORE)) {
        database.createObjectStore(ASSETS_STORE, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withLegacyStore<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openLegacyZineDb()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode)
    const store = transaction.objectStore(storeName)
    const request = action(store)
    let result: T

    request.onsuccess = () => {
      result = request.result
    }
    request.onerror = () => {
      database.close()
      reject(request.error)
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error)
    }
    transaction.onabort = () => {
      database.close()
      reject(transaction.error)
    }
    transaction.oncomplete = () => {
      database.close()
      resolve(result)
    }
  })
}

async function listLegacyZineProjects(): Promise<ZineProject[]> {
  return withLegacyStore<ZineProject[]>(PROJECTS_STORE, 'readonly', (store) => store.getAll())
}

async function getLegacyZineProject(id: string): Promise<ZineProject | null> {
  const project = await withLegacyStore<ZineProject | undefined>(PROJECTS_STORE, 'readonly', (store) => store.get(id))
  return project ?? null
}

async function saveLegacyZineProject(project: ZineProject): Promise<void> {
  await withLegacyStore<IDBValidKey>(PROJECTS_STORE, 'readwrite', (store) => store.put(project))
}

async function deleteLegacyZineProject(id: string): Promise<void> {
  await withLegacyStore<undefined>(PROJECTS_STORE, 'readwrite', (store) => store.delete(id))
}

async function saveLegacyZineAssetBlob(id: string, blob: Blob): Promise<void> {
  await withLegacyStore<IDBValidKey>(ASSETS_STORE, 'readwrite', (store) => store.put({ id, blob }))
}

async function getLegacyZineAssetBlob(id: string): Promise<Blob | null> {
  const asset = await withLegacyStore<StoredAssetBlob | undefined>(ASSETS_STORE, 'readonly', (store) => store.get(id))
  return asset?.blob ?? null
}

function deleteLegacyZineDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('Failed to delete legacy Zine IndexedDB data'))
    request.onblocked = () => reject(new Error('Legacy Zine IndexedDB deletion was blocked'))
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Failed to encode Zine asset'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read Zine asset'))
    reader.readAsDataURL(blob)
  })
}

function dataUrlToBlob(dataUrl: string): Blob {
  const separator = dataUrl.indexOf(',')
  if (!dataUrl.startsWith('data:') || separator < 0) {
    throw new Error('Invalid Zine asset data URL')
  }

  const header = dataUrl.slice(5, separator)
  const mimeType = header.replace(/;base64$/, '') || 'application/octet-stream'
  const binary = atob(dataUrl.slice(separator + 1))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: mimeType })
}

function migrationCompleted(): boolean {
  try {
    return localStorage.getItem(LEGACY_MIGRATION_KEY) === 'complete'
  } catch {
    return false
  }
}

function markMigrationCompleted(): void {
  try {
    localStorage.setItem(LEGACY_MIGRATION_KEY, 'complete')
    localStorage.removeItem(PREVIOUS_MIGRATION_KEY)
  } catch {
    // The SQLite copy is authoritative even if WebView storage is unavailable.
  }
}

async function migrateLegacyZineData(): Promise<void> {
  if (migrationCompleted()) return

  const projects = await listLegacyZineProjects()
  const assetIds = new Set<string>()

  for (const project of projects) {
    const existing = await getNativeZineProject(project.id)
    if (!existing) await saveNativeZineProject(JSON.stringify(project))
    if (!await getNativeZineProject(project.id)) {
      throw new Error(`Failed to verify migrated Zine project: ${project.id}`)
    }

    for (const asset of project.assets ?? []) {
      if (asset.source === 'local' && asset.blobId) assetIds.add(asset.blobId)
    }
  }

  for (const assetId of assetIds) {
    let nativeAsset = await getNativeZineAssetBlob(assetId)
    if (!nativeAsset) {
      const blob = await getLegacyZineAssetBlob(assetId)
      if (blob) await saveNativeZineAssetBlob(assetId, await blobToDataUrl(blob))
      nativeAsset = await getNativeZineAssetBlob(assetId)
      if (blob && !nativeAsset) {
        throw new Error(`Failed to verify migrated Zine asset: ${assetId}`)
      }
    }
  }

  await deleteLegacyZineDatabase()
  markMigrationCompleted()
}

async function ensureLegacyMigration(): Promise<void> {
  if (!hasNativeZineStorage() || migrationCompleted()) return
  if (!legacyMigrationPromise) {
    legacyMigrationPromise = migrateLegacyZineData().catch((error: unknown) => {
      console.warn('Failed to migrate legacy Zine data to SQLite', error)
    })
  }
  await legacyMigrationPromise
}

export async function listZineProjects(): Promise<ZineProject[]> {
  if (!hasNativeZineStorage()) {
    const projects = await listLegacyZineProjects()
    return projects.map(migrateProjectGeometry).sort((a, b) => b.updatedAt - a.updatedAt)
  }

  await ensureLegacyMigration()
  const projects = (await listNativeZineProjects()).map((projectJson) => JSON.parse(projectJson) as ZineProject)
  return projects.map(migrateProjectGeometry).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getZineProject(id: string): Promise<ZineProject | null> {
  if (!hasNativeZineStorage()) return getLegacyZineProject(id)

  await ensureLegacyMigration()
  const projectJson = await getNativeZineProject(id)
  return projectJson ? JSON.parse(projectJson) as ZineProject : null
}

export async function saveZineProject(project: ZineProject): Promise<void> {
  if (hasNativeZineStorage()) {
    await ensureLegacyMigration()
    await saveNativeZineProject(JSON.stringify(project))
  } else {
    await saveLegacyZineProject(project)
  }
  bumpDataRevision('zine-projects')
}

export async function deleteZineProject(id: string): Promise<void> {
  if (hasNativeZineStorage()) {
    await ensureLegacyMigration()
    await deleteNativeZineProject(id)
  } else {
    await deleteLegacyZineProject(id)
  }
  bumpDataRevision('zine-projects')
}

export async function saveZineAssetBlob(id: string, blob: Blob): Promise<void> {
  if (hasNativeZineStorage()) {
    await ensureLegacyMigration()
    await saveNativeZineAssetBlob(id, await blobToDataUrl(blob))
  } else {
    await saveLegacyZineAssetBlob(id, blob)
  }
}

export async function getZineAssetBlob(id: string): Promise<Blob | null> {
  if (!hasNativeZineStorage()) return getLegacyZineAssetBlob(id)

  await ensureLegacyMigration()
  const dataUrl = await getNativeZineAssetBlob(id)
  return dataUrl ? dataUrlToBlob(dataUrl) : null
}
