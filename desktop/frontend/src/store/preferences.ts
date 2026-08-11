import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { DEFAULT_ZINE_VIEW_OPTIONS, type ZineViewOptionKey, type ZineViewOptions } from '@/lib/zine/view-options'

type PhotoViewMode = 'crop' | 'fit' | 'masonry'

interface AdminPreferences {
  photoColumns: number
  photoGridSize: number
  photoViewMode: PhotoViewMode
  language: 'zh' | 'en'
  theme: 'light' | 'dark' | 'system'
  sidebarCollapsed: boolean
  zineStripWidth: number
  zineViewOptions: ZineViewOptions
  setPhotoColumns: (n: number) => void
  setPhotoGridSize: (n: number) => void
  setPhotoViewMode: (mode: PhotoViewMode) => void
  setLanguage: (lang: 'zh' | 'en') => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setZineStripWidth: (n: number) => void
  setZineViewOption: (key: ZineViewOptionKey, enabled: boolean) => void
}

export const usePreferences = create<AdminPreferences>()(
  persist(
    (set) => ({
      photoColumns: 6,
      photoGridSize: 176,
      photoViewMode: 'fit',
      language: 'zh',
      theme: 'system',
      sidebarCollapsed: false,
      zineStripWidth: 176,
      zineViewOptions: DEFAULT_ZINE_VIEW_OPTIONS,
      setPhotoColumns: (n) => set({ photoColumns: n }),
      setPhotoGridSize: (n) => set({ photoGridSize: n }),
      setPhotoViewMode: (mode) => set({ photoViewMode: mode }),
      setLanguage: (lang) => set({ language: lang }),
      setTheme: (theme) => set({ theme }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setZineStripWidth: (n) => set({ zineStripWidth: n }),
      setZineViewOption: (key, enabled) => set((state) => ({
        zineViewOptions: { ...state.zineViewOptions, [key]: enabled },
      })),
    }),
    { name: 'mo-gallery-preferences' },
  ),
)

// 照片筛选（会话级，不持久化）
interface PhotoFilters {
  search: string
  category: string
  photoType: string | null
  channel: string | null
  albumId: string | null
  cameraId: string | null
  lensId: string | null
  featured: boolean | null
  sortBy: 'createdAt' | 'takenAt'
  sortOrder: 'asc' | 'desc'
  setSearch: (s: string) => void
  setCategory: (c: string) => void
  setPhotoType: (t: string | null) => void
  setChannel: (c: string | null) => void
  setAlbumId: (id: string | null) => void
  setCameraId: (id: string | null) => void
  setLensId: (id: string | null) => void
  setFeatured: (f: boolean | null) => void
  setSortBy: (s: 'createdAt' | 'takenAt') => void
  setSortOrder: (o: 'asc' | 'desc') => void
  reset: () => void
}

const defaultFilters = {
  search: '',
  category: '全部',
  photoType: null as string | null,
  channel: null as string | null,
  albumId: null as string | null,
  cameraId: null as string | null,
  lensId: null as string | null,
  featured: null as boolean | null,
  sortBy: 'createdAt' as const,
  sortOrder: 'desc' as const,
}

export const usePhotoFilters = create<PhotoFilters>()((set) => ({
  ...defaultFilters,
  setSearch: (s) => set({ search: s }),
  setCategory: (c) => set({ category: c }),
  setPhotoType: (t) => set({ photoType: t }),
  setChannel: (c) => set({ channel: c }),
  setAlbumId: (id) => set({ albumId: id }),
  setCameraId: (id) => set({ cameraId: id }),
  setLensId: (id) => set({ lensId: id }),
  setFeatured: (f) => set({ featured: f }),
  setSortBy: (s) => set({ sortBy: s }),
  setSortOrder: (o) => set({ sortOrder: o }),
  reset: () => set(defaultFilters),
}))

// 资源库左侧分区折叠状态（持久化：用户操作的展开/折叠跨页面保留，首次进入默认展开）
export type LibrarySectionKey =
  | 'cloudPhotoType'
  | 'cloudCategories'
  | 'cloudAlbums'
  | 'localFolders'
  | 'localCollections'
  | 'localTags'
  | 'localColors'
  | 'localRatings'

interface LibrarySectionsState {
  sections: Record<LibrarySectionKey, boolean>
  toggleSection: (key: LibrarySectionKey) => void
}

const defaultSections: Record<LibrarySectionKey, boolean> = {
  cloudPhotoType: true,
  cloudCategories: true,
  cloudAlbums: true,
  localFolders: true,
  localCollections: true,
  localTags: true,
  localColors: true,
  localRatings: true,
}

export const useLibrarySections = create<LibrarySectionsState>()(
  persist(
    (set) => ({
      sections: defaultSections,
      toggleSection: (key) => set((state) => ({ sections: { ...state.sections, [key]: !state.sections[key] } })),
    }),
    { name: 'mo-gallery-library-sections' },
  ),
)
