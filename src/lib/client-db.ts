import type { ArticleContentDto, EditorType, TiptapJsonContent } from '@/lib/api/types';

type StoredDraft<T extends ArticleContentDto> = Omit<T, keyof ArticleContentDto> & Partial<ArticleContentDto> & {
  content?: string;
  contentJson?: TiptapJsonContent | null;
};

// Accept legacy field names only at the storage boundary. Empty saved bodies
// retain their editor identity and never restore a different source.
function normalizeDraft<T extends ArticleContentDto>(draft: StoredDraft<T>): T {
  const { content, contentJson, ...rest } = draft;
  const editorType: EditorType = draft.editorType === 'milkdown' || draft.editorType === 'tiptap'
    ? draft.editorType
    : draft.milkContent != null ? 'milkdown' : 'tiptap';
  const contentEditorTypes = Array.isArray(draft.contentEditorTypes)
    ? draft.contentEditorTypes.filter((type): type is EditorType => type === 'tiptap' || type === 'milkdown')
    : Array.from(new Set<EditorType>([
      editorType,
      ...(draft.milkContent != null ? ['milkdown' as const] : []),
      ...(draft.tiptapContent !== undefined || content !== undefined || draft.tiptapContentJson != null || contentJson != null ? ['tiptap' as const] : []),
    ]));

  return {
    ...rest,
    editorType,
    contentEditorTypes,
    tiptapContent: draft.tiptapContent ?? content ?? '',
    tiptapContentJson: draft.tiptapContentJson !== undefined ? draft.tiptapContentJson : contentJson ?? null,
    milkContent: draft.milkContent ?? null,
  } as T;
}

// ============ Story Draft Types ============
export interface StoryDraftData extends ArticleContentDto {
  id: string;
  storyId?: string;
  title: string;
  selectedAlbumIds: string[];
  savedAt: number;
  files: { id: string; file: File }[];
}

// ============ Story Editor Draft Types (for StoriesTab) ============
export interface StoryEditorDraftData extends ArticleContentDto {
  id: string; // 'story_editor_<storyId>' for existing stories, or 'story_editor_<draftId>' for new stories
  storyId?: string;
  title: string;
  isPublished: boolean;
  createdAt: string;
  storyDate?: string;
  coverPhotoId?: string | null;
  coverCrop?: { x: number; y: number; width: number; height: number } | null;
  pendingCoverId?: string | null; // Cover ID for pending (not yet uploaded) images
  photoIds: string[];
  savedAt: number;
  files: { id: string; file: File; takenAt?: string }[];
}

// ============ Blog Draft Types ============
export interface BlogDraftData extends ArticleContentDto {
  id: string; // 'blog_draft_new' for new drafts, or 'blog_draft_<blogId>' for existing blogs
  blogId?: string; // Original blog ID if editing an existing blog
  title: string;
  category: string;
  tags: string;
  isPublished: boolean;
  savedAt: number;
}

// ============ Constants ============
const DB_NAME = 'mo-gallery-drafts';
const STORE_NAME = 'drafts';
const STORY_DRAFT_KEY = 'quick_story_draft';
const BLOG_DRAFT_PREFIX = 'blog_draft_';
const DB_VERSION = 1;

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
export async function saveDraftToDB(data: Omit<StoryDraftData, 'id' | 'savedAt'>): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const draftData: StoryDraftData = {
        id: STORY_DRAFT_KEY,
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

export async function getDraftFromDB(): Promise<StoryDraftData | undefined> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(STORY_DRAFT_KEY);

      request.onsuccess = () => resolve(request.result ? normalizeDraft<StoryDraftData>(request.result) : undefined);
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

/**
 * Save a blog draft to IndexedDB
 */
export async function saveBlogDraftToDB(data: Omit<BlogDraftData, 'id' | 'savedAt'>): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const draftData: BlogDraftData = {
        ...data,
        id: getBlogDraftKey(data.blogId),
        savedAt: Date.now(),
      };

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
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(getBlogDraftKey(blogId));

      request.onsuccess = () => resolve(request.result ? normalizeDraft<BlogDraftData>(request.result) : undefined);
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
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const allDrafts = request.result as StoredDraft<BlogDraftData>[];
        // Filter only blog drafts (those with id starting with BLOG_DRAFT_PREFIX)
        const blogDrafts = allDrafts.filter(
          (d) => d.id.startsWith(BLOG_DRAFT_PREFIX)
        ).map((draft) => normalizeDraft<BlogDraftData>(draft));
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

export async function saveStoryEditorDraftToDB(data: Omit<StoryEditorDraftData, 'id' | 'savedAt'> & {
  draftId?: string;
}): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const draftData: StoryEditorDraftData = {
        ...data,
        id: getStoryEditorDraftKey(data.storyId || data.draftId),
        savedAt: Date.now(),
      };

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
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(getStoryEditorDraftKey(storyId));

      request.onsuccess = () => resolve(request.result ? normalizeDraft<StoryEditorDraftData>(request.result) : undefined);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to get story editor draft:', error);
    return undefined;
  }
}

export async function clearStoryEditorDraftFromDB(storyIdOrDraftId?: string): Promise<void> {
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
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const allDrafts = request.result as StoredDraft<StoryEditorDraftData>[];
        const storyEditorDrafts = allDrafts.filter(
          (d) => d.id?.startsWith(STORY_EDITOR_DRAFT_PREFIX)
        ).map((draft) => normalizeDraft<StoryEditorDraftData>(draft));
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
