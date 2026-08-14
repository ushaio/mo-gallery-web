import type { TiptapJsonContent } from '@/lib/api/types';

// ============ Story Draft Types ============
export interface StoryDraftData {
  id: string;
  title: string;
  content: string;
  selectedAlbumIds: string[];
  savedAt: number;
  cloudSynced?: boolean;
  files: { id: string; file: File }[];
}

// ============ Story Editor Draft Types (for StoriesTab) ============
export interface StoryEditorDraftData {
  id: string; // 'story_editor_<storyId>' for existing stories, or 'story_editor_<draftId>' for new stories
  storyId?: string;
  title: string;
  content: string;
  contentJson?: TiptapJsonContent | null;
  isPublished: boolean;
  createdAt: string;
  coverPhotoId?: string | null;
  coverCrop?: { x: number; y: number; width: number; height: number } | null;
  pendingCoverId?: string | null; // Cover ID for pending (not yet uploaded) images
  photoIds: string[];
  savedAt: number;
  cloudSynced?: boolean;
  files: { id: string; file: File; takenAt?: string }[];
}

// ============ Blog Draft Types ============
export interface BlogDraftData {
  id: string; // 'blog_draft_new' for new drafts, or 'blog_draft_<blogId>' for existing blogs
  blogId?: string; // Original blog ID if editing an existing blog
  title: string;
  content: string;
  contentJson?: TiptapJsonContent | null;
  category: string;
  tags: string;
  isPublished: boolean;
  savedAt: number;
  cloudSynced?: boolean;
}

// ============ Constants ============
const DB_NAME = 'mo-gallery-drafts';
const STORE_NAME = 'drafts';
const STORY_DRAFT_KEY = 'quick_story_draft';
const BLOG_DRAFT_PREFIX = 'blog_draft_';
const DB_VERSION = 1;
const NATIVE_MIGRATION_KEY = 'mo-gallery-drafts-sqlite-migration-v1';

interface NativeDraftBridge {
  SaveLocalDraft?: (key: string, data: string) => Promise<void>;
  GetLocalDraft?: (key: string) => Promise<string>;
  ListLocalDrafts?: () => Promise<string[]>;
  DeleteLocalDraft?: (key: string) => Promise<void>;
}

interface StoredDraftFile {
  id: string;
  name: string;
  type: string;
  lastModified: number;
  takenAt?: string;
  data: string;
}

function nativeDraftBridge(): NativeDraftBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { go?: { main?: { App?: NativeDraftBridge } } }).go?.main?.App ?? null;
}

function hasNativeDraftStorage(): boolean {
  const bridge = nativeDraftBridge();
  return typeof bridge?.SaveLocalDraft === 'function' && typeof bridge.GetLocalDraft === 'function';
}

function readMigrationState(): boolean {
  try { return localStorage.getItem(NATIVE_MIGRATION_KEY) === 'complete'; } catch { return false; }
}

function markMigrationComplete(): void {
  try { localStorage.setItem(NATIVE_MIGRATION_KEY, 'complete'); } catch { /* SQLite remains authoritative. */ }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return reject(new Error('Failed to encode draft file'));
      const comma = reader.result.indexOf(',');
      resolve(comma >= 0 ? reader.result.slice(comma + 1) : reader.result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read draft file'));
    reader.readAsDataURL(file);
  });
}

function base64ToFile(file: StoredDraftFile): File {
  const binary = atob(file.data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], file.name, { type: file.type, lastModified: file.lastModified });
}

async function encodeDraft(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!Array.isArray(data.files)) return data;
  const files = await Promise.all((data.files as Array<{ id: string; file: File; takenAt?: string }>).map(async (entry) => ({
    id: entry.id,
    name: entry.file.name,
    type: entry.file.type,
    lastModified: entry.file.lastModified,
    ...(entry.takenAt ? { takenAt: entry.takenAt } : {}),
    data: await fileToBase64(entry.file),
  })));
  return { ...data, files };
}

function decodeDraft<T>(data: T): T {
  if (!data || typeof data !== 'object' || !('files' in data)) return data;
  const draft = data as T & { files?: StoredDraftFile[] };
  if (!Array.isArray(draft.files)) return data;
  return { ...draft, files: draft.files.map((entry) => ({ id: entry.id, file: base64ToFile(entry), ...(entry.takenAt ? { takenAt: entry.takenAt } : {}) })) } as T;
}

let nativeMigrationPromise: Promise<void> | null = null;

async function migrateIndexedDraftsToNative(): Promise<void> {
  if (!hasNativeDraftStorage() || readMigrationState()) return;
  const bridge = nativeDraftBridge();
  if (!bridge?.SaveLocalDraft || !bridge.GetLocalDraft) return;
  const records = await getAllIndexedDraftRecords();
  for (const record of records) {
    const existing = await bridge.GetLocalDraft(record.id);
    if (!existing) {
      await bridge.SaveLocalDraft(record.id, JSON.stringify(await encodeDraft(record as unknown as Record<string, unknown>)));
    }
    const verified = await bridge.GetLocalDraft(record.id);
    if (!verified) throw new Error(`Failed to verify migrated draft: ${record.id}`);
  }
  for (const record of records) await deleteIndexedDraft(record.id);
  markMigrationComplete();
}

async function ensureNativeDraftMigration(): Promise<void> {
  if (!hasNativeDraftStorage() || readMigrationState()) return;
  if (!nativeMigrationPromise) nativeMigrationPromise = migrateIndexedDraftsToNative();
  await nativeMigrationPromise;
}

async function saveNativeDraft(data: Record<string, unknown>): Promise<boolean> {
  const bridge = nativeDraftBridge();
  if (!bridge?.SaveLocalDraft) return false;
  await ensureNativeDraftMigration();
  await bridge.SaveLocalDraft(String(data.id), JSON.stringify(await encodeDraft(data)));
  return true;
}

async function getNativeDraft<T>(key: string): Promise<{ available: boolean; data?: T }> {
  const bridge = nativeDraftBridge();
  if (!bridge?.GetLocalDraft) return { available: false };
  await ensureNativeDraftMigration();
  const raw = await bridge.GetLocalDraft(key);
  return { available: true, data: raw ? decodeDraft(JSON.parse(raw) as T) : undefined };
}

async function deleteNativeDraft(key: string): Promise<boolean> {
  const bridge = nativeDraftBridge();
  if (!bridge?.DeleteLocalDraft) return false;
  await ensureNativeDraftMigration();
  await bridge.DeleteLocalDraft(key);
  return true;
}

async function listNativeDrafts<T>(prefix: string): Promise<{ available: boolean; data: T[] }> {
  const bridge = nativeDraftBridge();
  if (!bridge?.ListLocalDrafts || !bridge.GetLocalDraft) return { available: false, data: [] };
  await ensureNativeDraftMigration();
  const keys = (await bridge.ListLocalDrafts()).filter((key) => key.startsWith(prefix));
  const records = await Promise.all(keys.map(async (key) => {
    const raw = await bridge.GetLocalDraft!(key);
    return raw ? decodeDraft(JSON.parse(raw) as T) : null;
  }));
  return { available: true, data: records.filter((record) => record !== null) as T[] };
}

async function markDraftCloudSynced(key: string): Promise<void> {
  const native = await getNativeDraft<Record<string, unknown>>(key);
  if (native.available) {
    if (native.data) await saveNativeDraft({ ...native.data, cloudSynced: true });
    return;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => {
      const draft = request.result as Record<string, unknown> | undefined;
      if (!draft) {
        db.close();
        resolve();
        return;
      }
      const update = store.put({ ...draft, cloudSynced: true });
      update.onsuccess = () => { db.close(); resolve(); };
      update.onerror = () => { db.close(); reject(update.error); };
    };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

// ============ Database Helper ============
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

// ============ Story Draft Functions ============
export async function saveDraftToDB(data: {
  title: string;
  content: string;
  selectedAlbumIds: string[];
  files: { id: string; file: File }[];
}): Promise<void> {
  const draftData: StoryDraftData = { id: STORY_DRAFT_KEY, ...data, savedAt: Date.now(), cloudSynced: false };
  if (await saveNativeDraft(draftData as unknown as Record<string, unknown>)) return;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const request = store.put(draftData);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to save draft to IndexedDB:', error);
    throw error;
  }
}

export async function getDraftFromDB(): Promise<StoryDraftData | undefined> {
  const native = await getNativeDraft<StoryDraftData>(STORY_DRAFT_KEY);
  if (native.available) return native.data;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(STORY_DRAFT_KEY);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to get draft from IndexedDB:', error);
    return undefined;
  }
}

export async function clearDraftFromDB(): Promise<void> {
  if (await deleteNativeDraft(STORY_DRAFT_KEY)) return;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(STORY_DRAFT_KEY);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to clear draft from IndexedDB:', error);
  }
}

// ============ Blog Draft Functions ============

/**
 * Get the draft key for a blog
 * @param blogId - The original blog ID, or undefined for new blog
 */
function getBlogDraftKey(blogId?: string): string {
  return blogId ? `${BLOG_DRAFT_PREFIX}${blogId}` : `${BLOG_DRAFT_PREFIX}new`;
}

export function markBlogDraftSynced(blogId?: string): Promise<void> {
  return markDraftCloudSynced(getBlogDraftKey(blogId));
}

/**
 * Save a blog draft to IndexedDB
 */
export async function saveBlogDraftToDB(data: {
  blogId?: string;
  title: string;
  content: string;
  contentJson?: TiptapJsonContent | null;
  category: string;
  tags: string;
  isPublished: boolean;
}): Promise<void> {
  const draftData: BlogDraftData = {
    id: getBlogDraftKey(data.blogId), blogId: data.blogId, title: data.title, content: data.content,
    contentJson: data.contentJson, category: data.category, tags: data.tags, isPublished: data.isPublished, savedAt: Date.now(), cloudSynced: false,
  };
  if (await saveNativeDraft(draftData as unknown as Record<string, unknown>)) return;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const request = store.put(draftData);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to save blog draft to IndexedDB:', error);
    throw error;
  }
}

/**
 * Get a specific blog draft from IndexedDB
 */
export async function getBlogDraftFromDB(blogId?: string): Promise<BlogDraftData | undefined> {
  const native = await getNativeDraft<BlogDraftData>(getBlogDraftKey(blogId));
  if (native.available) return native.data;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(getBlogDraftKey(blogId));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to get blog draft from IndexedDB:', error);
    return undefined;
  }
}

/**
 * Get all blog drafts from IndexedDB
 */
export async function getAllBlogDraftsFromDB(): Promise<BlogDraftData[]> {
  const native = await listNativeDrafts<BlogDraftData>(BLOG_DRAFT_PREFIX);
  if (native.available) return native.data;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const allDrafts = request.result as (StoryDraftData | BlogDraftData)[];
        // Filter only blog drafts (those with id starting with BLOG_DRAFT_PREFIX)
        const blogDrafts = allDrafts.filter(
          (d): d is BlogDraftData => d.id.startsWith(BLOG_DRAFT_PREFIX)
        );
        resolve(blogDrafts);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to get all blog drafts from IndexedDB:', error);
    return [];
  }
}

/**
 * Clear a specific blog draft from IndexedDB
 */
export async function clearBlogDraftFromDB(blogId?: string): Promise<void> {
  if (await deleteNativeDraft(getBlogDraftKey(blogId))) return;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(getBlogDraftKey(blogId));

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to clear blog draft from IndexedDB:', error);
  }
}

/**
 * Clear all blog drafts from IndexedDB
 */
export async function clearAllBlogDraftsFromDB(): Promise<void> {
  try {
    const drafts = await getAllBlogDraftsFromDB();
    for (const draft of drafts) {
      await clearBlogDraftFromDB(draft.blogId);
    }
  } catch (error) {
    console.error('Failed to clear all blog drafts from IndexedDB:', error);
  }
}

// ============ Story Editor Draft Functions (for StoriesTab) ============
export const STORY_EDITOR_DRAFT_PREFIX = 'story_editor_';

function getStoryEditorDraftKey(storyIdOrDraftId?: string): string {
  if (!storyIdOrDraftId) return `${STORY_EDITOR_DRAFT_PREFIX}new`;
  return storyIdOrDraftId.startsWith(STORY_EDITOR_DRAFT_PREFIX)
    ? storyIdOrDraftId
    : `${STORY_EDITOR_DRAFT_PREFIX}${storyIdOrDraftId}`;
}

export function markStoryEditorDraftSynced(storyIdOrDraftId?: string): Promise<void> {
  return markDraftCloudSynced(getStoryEditorDraftKey(storyIdOrDraftId));
}

async function getAllIndexedDraftRecords(): Promise<Array<StoryDraftData | StoryEditorDraftData | BlogDraftData>> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => { db.close(); resolve(request.result as Array<StoryDraftData | StoryEditorDraftData | BlogDraftData>); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

async function deleteIndexedDraft(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id);
    request.onsuccess = () => { db.close(); resolve(); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function saveStoryEditorDraftToDB(data: {
  storyId?: string;
  draftId?: string;
  title: string;
  content: string;
  contentJson?: TiptapJsonContent | null;
  isPublished: boolean;
  createdAt: string;
  coverPhotoId?: string | null;
  coverCrop?: { x: number; y: number; width: number; height: number } | null;
  pendingCoverId?: string | null;
  photoIds: string[];
  files: { id: string; file: File }[];
}): Promise<void> {
  const draftData: StoryEditorDraftData = {
    id: getStoryEditorDraftKey(data.storyId || data.draftId), storyId: data.storyId, title: data.title, content: data.content,
    contentJson: data.contentJson, isPublished: data.isPublished, createdAt: data.createdAt, coverPhotoId: data.coverPhotoId,
    coverCrop: data.coverCrop, pendingCoverId: data.pendingCoverId, photoIds: data.photoIds, savedAt: Date.now(), cloudSynced: false, files: data.files,
  };
  if (await saveNativeDraft(draftData as unknown as Record<string, unknown>)) return;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const request = store.put(draftData);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to save story editor draft:', error);
    throw error;
  }
}

export async function getStoryEditorDraftFromDB(storyId?: string): Promise<StoryEditorDraftData | undefined> {
  const native = await getNativeDraft<StoryEditorDraftData>(getStoryEditorDraftKey(storyId));
  if (native.available) return native.data;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(getStoryEditorDraftKey(storyId));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to get story editor draft:', error);
    return undefined;
  }
}

export async function clearStoryEditorDraftFromDB(storyIdOrDraftId?: string): Promise<void> {
  if (await deleteNativeDraft(getStoryEditorDraftKey(storyIdOrDraftId))) return;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(getStoryEditorDraftKey(storyIdOrDraftId));

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to clear story editor draft:', error);
  }
}

/**
 * Get all story editor drafts from IndexedDB
 */
export async function getAllStoryEditorDraftsFromDB(): Promise<StoryEditorDraftData[]> {
  const native = await listNativeDrafts<StoryEditorDraftData>(STORY_EDITOR_DRAFT_PREFIX);
  if (native.available) return native.data;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const allDrafts = request.result;
        const storyEditorDrafts = allDrafts.filter(
          (d): d is StoryEditorDraftData => d.id?.startsWith(STORY_EDITOR_DRAFT_PREFIX)
        );
        resolve(storyEditorDrafts);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to get all story editor drafts:', error);
    return [];
  }
}

/**
 * Clear all story editor drafts from IndexedDB
 */
export async function clearAllStoryEditorDraftsFromDB(): Promise<void> {
  try {
    const drafts = await getAllStoryEditorDraftsFromDB();
    for (const draft of drafts) {
      await clearStoryEditorDraftFromDB(draft.id);
    }
  } catch (error) {
    console.error('Failed to clear all story editor drafts:', error);
  }
}

/**
 * Clear all drafts from IndexedDB
 */
export async function clearAllDraftsFromDB(): Promise<void> {
  await Promise.all([
    clearDraftFromDB(),
    clearAllBlogDraftsFromDB(),
    clearAllStoryEditorDraftsFromDB()
  ]);
}

// ============ Get All Drafts (for admin/logs display) ============

export interface AllDraftsData {
  storyDraft: StoryDraftData | null;
  blogDrafts: BlogDraftData[];
  storyEditorDrafts: StoryEditorDraftData[];
}

/**
 * Get all drafts (story + blog + story editor) for display in admin/logs
 */
export async function getAllDraftsFromDB(): Promise<AllDraftsData> {
  try {
    const [storyDraft, blogDrafts, storyEditorDrafts] = await Promise.all([
      getDraftFromDB(),
      getAllBlogDraftsFromDB(),
      getAllStoryEditorDraftsFromDB()
    ]);
    
    return {
      storyDraft: storyDraft || null,
      blogDrafts,
      storyEditorDrafts
    };
  } catch (error) {
    console.error('Failed to get all drafts from IndexedDB:', error);
    return {
      storyDraft: null,
      blogDrafts: [],
      storyEditorDrafts: []
    };
  }
}
