'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type ResourceLibraryPhotoViewMode = 'crop' | 'fit' | 'masonry'

interface AdminPreferenceStore {
  resourceLibraryPhotoViewMode: ResourceLibraryPhotoViewMode
  setResourceLibraryPhotoViewMode: (value: ResourceLibraryPhotoViewMode) => void
  resourceLibraryPhotoSize: number
  setResourceLibraryPhotoSize: (value: number) => void
}

export const useAdminPreferenceStore = create<AdminPreferenceStore>()(
  persist(
    (set) => ({
      resourceLibraryPhotoViewMode: 'crop',
      setResourceLibraryPhotoViewMode: (value) => set({ resourceLibraryPhotoViewMode: value }),
      resourceLibraryPhotoSize: 176,
      setResourceLibraryPhotoSize: (value) => set({ resourceLibraryPhotoSize: Math.min(280, Math.max(120, Math.round(value))) }),
    }),
    {
      name: 'admin-preferences',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        resourceLibraryPhotoViewMode: state.resourceLibraryPhotoViewMode,
        resourceLibraryPhotoSize: state.resourceLibraryPhotoSize,
      }),
    }
  )
)
