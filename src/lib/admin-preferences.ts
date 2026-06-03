'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type PhotosSortOption = 'upload-desc' | 'upload-asc' | 'taken-desc' | 'taken-asc'

export interface PhotosFilterPreference {
  search: string
  categoryFilter: string
  photoTypeFilter: string
  channelFilter: string
  albumFilter: string
  cameraFilter: string
  lensFilter: string
  onlyFeatured: boolean
  sortBy: PhotosSortOption
  showFilters: boolean
}

export const DEFAULT_PHOTO_GRID_COLUMNS = 6
export const MIN_PHOTO_GRID_COLUMNS = 6
export const MAX_PHOTO_GRID_COLUMNS = 12

export const DEFAULT_PHOTOS_FILTERS: PhotosFilterPreference = {
  search: '',
  categoryFilter: 'all',
  photoTypeFilter: 'all',
  channelFilter: 'all',
  albumFilter: 'all',
  cameraFilter: 'all',
  lensFilter: 'all',
  onlyFeatured: false,
  sortBy: 'upload-desc',
  showFilters: false,
}

export function normalizePhotoGridColumns(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_PHOTO_GRID_COLUMNS
  return Math.min(MAX_PHOTO_GRID_COLUMNS, Math.max(MIN_PHOTO_GRID_COLUMNS, Math.round(value)))
}

interface AdminPreferenceStore {
  photoGridColumns: number
  setPhotoGridColumns: (value: number) => void
}

interface AdminSessionPreferenceStore {
  photosFilters: PhotosFilterPreference
  setPhotosFilters: (filters: Partial<PhotosFilterPreference>) => void
  resetPhotosFilters: () => void
}

export const useAdminPreferenceStore = create<AdminPreferenceStore>()(
  persist(
    (set) => ({
      photoGridColumns: DEFAULT_PHOTO_GRID_COLUMNS,
      setPhotoGridColumns: (value) => set({ photoGridColumns: normalizePhotoGridColumns(value) }),
    }),
    {
      name: 'admin-preferences',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ photoGridColumns: state.photoGridColumns }),
    }
  )
)

export const useAdminSessionPreferenceStore = create<AdminSessionPreferenceStore>()(
  persist(
    (set) => ({
      photosFilters: DEFAULT_PHOTOS_FILTERS,
      setPhotosFilters: (filters) => set((state) => ({
        photosFilters: {
          ...state.photosFilters,
          ...filters,
        },
      })),
      resetPhotosFilters: () => set({ photosFilters: DEFAULT_PHOTOS_FILTERS }),
    }),
    {
      name: 'admin-session-preferences',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ photosFilters: state.photosFilters }),
    }
  )
)
