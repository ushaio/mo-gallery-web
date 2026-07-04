import type { ZineProject } from './types'

const DB_NAME = 'mo-gallery-zine'
const DB_VERSION = 1
const PROJECTS_STORE = 'projects'
const ASSETS_STORE = 'assets'

interface StoredAssetBlob {
  id: string
  blob: Blob
}

function openZineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' })
      }

      if (!db.objectStoreNames.contains(ASSETS_STORE)) {
        db.createObjectStore(ASSETS_STORE, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openZineDb()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const store = transaction.objectStore(storeName)
    const request = action(store)

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      db.close()
      reject(request.error)
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
    transaction.oncomplete = () => db.close()
  })
}

export async function listZineProjects(): Promise<ZineProject[]> {
  const projects = await withStore<ZineProject[]>(PROJECTS_STORE, 'readonly', (store) => store.getAll())
  return projects.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getZineProject(id: string): Promise<ZineProject | null> {
  const project = await withStore<ZineProject | undefined>(PROJECTS_STORE, 'readonly', (store) => store.get(id))
  return project ?? null
}

export async function saveZineProject(project: ZineProject): Promise<void> {
  await withStore<IDBValidKey>(PROJECTS_STORE, 'readwrite', (store) => store.put(project))
}

export async function deleteZineProject(id: string): Promise<void> {
  await withStore<undefined>(PROJECTS_STORE, 'readwrite', (store) => store.delete(id))
}

export async function saveZineAssetBlob(id: string, blob: Blob): Promise<void> {
  await withStore<IDBValidKey>(ASSETS_STORE, 'readwrite', (store) => store.put({ id, blob }))
}

export async function getZineAssetBlob(id: string): Promise<Blob | null> {
  const asset = await withStore<StoredAssetBlob | undefined>(ASSETS_STORE, 'readonly', (store) => store.get(id))
  return asset?.blob ?? null
}
