import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AdminPreferences {
  photoColumns: number
  language: 'zh' | 'en'
  theme: 'light' | 'dark' | 'system'
  setPhotoColumns: (n: number) => void
  setLanguage: (lang: 'zh' | 'en') => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
}

export const usePreferences = create<AdminPreferences>()(
  persist(
    (set) => ({
      photoColumns: 8,
      language: 'zh',
      theme: 'system',
      setPhotoColumns: (n) => set({ photoColumns: n }),
      setLanguage: (lang) => set({ language: lang }),
      setTheme: (theme) => set({ theme }),
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
