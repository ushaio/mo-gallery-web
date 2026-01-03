// ============ Story Draft Types ============
export interface StoryDraftData {
  id: string;
  title: string;
  content: string;
  selectedAlbumIds: string[];
  savedAt: number;
  files: { id: string; file: File }[];
}

// ============ Blog Draft Types ============
export interface BlogDraftData {
  id: string; // 'blog_draft_new' for new drafts, or 'blog_draft_<blogId>' for existing blogs
  blogId?: string; // Original blog ID if editing an existing blog
  title: string;
  content: string;
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
export async function saveBlogDraftToDB(data: {
  blogId?: string;
  title: string;
  content: string;
  category: string;
  tags: string;
  isPublished: boolean;
}): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const draftData: BlogDraftData = {
        id: getBlogDraftKey(data.blogId),
        blogId: data.blogId,
        title: data.title,
        content: data.content,
        category: data.category,
        tags: data.tags,
        isPublished: data.isPublished,
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

// ============ Get All Drafts (for admin/logs display) ============

export interface AllDraftsData {
  storyDraft: StoryDraftData | null;
  blogDrafts: BlogDraftData[];
}

/**
 * Get all drafts (story + blog) for display in admin/logs
 */
export async function getAllDraftsFromDB(): Promise<AllDraftsData> {
  try {
    const [storyDraft, blogDrafts] = await Promise.all([
      getDraftFromDB(),
      getAllBlogDraftsFromDB()
    ]);
    
    return {
      storyDraft: storyDraft || null,
      blogDrafts
    };
  } catch (error) {
    console.error('Failed to get all drafts from IndexedDB:', error);
    return {
      storyDraft: null,
      blogDrafts: []
    };
  }
}