interface DraftData {
  id: string;
  title: string;
  content: string;
  selectedAlbumIds: string[];
  savedAt: number;
  files: { id: string; file: File }[];
}

const DB_NAME = 'mo-gallery-drafts';
const STORE_NAME = 'drafts';
const DRAFT_KEY = 'quick_story_draft';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export async function saveDraftToDB(data: {
  title: string;
  content: string;
  selectedAlbumIds: string[];
  files: { id: string; file: File }[];
}): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const draftData: DraftData = {
        id: DRAFT_KEY,
        ...data,
        savedAt: Date.now(),
      };

      const request = store.put(draftData);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to save draft to IndexedDB:', error);
    throw error;
  }
}

export async function getDraftFromDB(): Promise<DraftData | undefined> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(DRAFT_KEY);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to get draft from IndexedDB:', error);
    return undefined;
  }
}

export async function clearDraftFromDB(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(DRAFT_KEY);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to clear draft from IndexedDB:', error);
  }
}