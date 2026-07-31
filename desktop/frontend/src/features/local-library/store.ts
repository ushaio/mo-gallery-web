import { create } from 'zustand'
import type { AssetAvailability, AssetSort, AssetSortDirection, AssetStructuredFilters, LibrarySnapshot, LocalAsset } from './types'

interface LocalLibraryState {
  snapshot: LibrarySnapshot | null
  folder: string
  search: string
  sort: AssetSort
  sortDirection: AssetSortDirection
  availability: AssetAvailability
  favoritesOnly: boolean
  tagIds: string[]
  collectionIds: string[]
  filters: AssetStructuredFilters
  selectedAsset: LocalAsset | null
  previewAsset: LocalAsset | null
  setSnapshot: (snapshot: LibrarySnapshot | null) => void
  setFolder: (folder: string) => void
  setSearch: (search: string) => void
  setSort: (sort: AssetSort) => void
  setSortDirection: (sortDirection: AssetSortDirection) => void
  setAvailability: (availability: AssetAvailability) => void
  setFavoritesOnly: (favoritesOnly: boolean) => void
  setTagIds: (tagIds: string[]) => void
  setCollectionIds: (collectionIds: string[]) => void
  setFilters: (filters: AssetStructuredFilters) => void
  clearFilters: () => void
  selectAsset: (asset: LocalAsset | null) => void
  setPreviewAsset: (asset: LocalAsset | null) => void
  resetNavigation: () => void
}

export const useLocalLibraryStore = create<LocalLibraryState>()((set) => ({
  snapshot: null,
  folder: '',
  search: '',
  sort: 'discovered',
  sortDirection: 'desc',
  availability: 'active',
  favoritesOnly: false,
  tagIds: [],
  collectionIds: [],
  filters: {},
  selectedAsset: null,
  previewAsset: null,
  setSnapshot: (snapshot) => set({ snapshot }),
  setFolder: (folder) => set({ folder, tagIds: [], collectionIds: [], selectedAsset: null }),
  setSearch: (search) => set({ search, selectedAsset: null }),
  setSort: (sort) => set({ sort }),
  setSortDirection: (sortDirection) => set({ sortDirection }),
  setAvailability: (availability) => set({ availability, folder: '', tagIds: [], collectionIds: [], selectedAsset: null }),
  setFavoritesOnly: (favoritesOnly) => set({ favoritesOnly, selectedAsset: null }),
  setTagIds: (tagIds) => set({ tagIds, folder: '', collectionIds: [], selectedAsset: null }),
  setCollectionIds: (collectionIds) => set({ collectionIds, folder: '', tagIds: [], selectedAsset: null }),
  setFilters: (filters) => set({ filters, selectedAsset: null }),
  clearFilters: () => set({ filters: {}, selectedAsset: null }),
  selectAsset: (selectedAsset) => set({ selectedAsset }),
  setPreviewAsset: (previewAsset) => set({ previewAsset }),
  resetNavigation: () => set({
    folder: '', search: '', sort: 'discovered', sortDirection: 'desc', availability: 'active', favoritesOnly: false, tagIds: [], collectionIds: [], filters: {},
    selectedAsset: null, previewAsset: null,
  }),
}))
