import { create } from 'zustand'
import type { AssetAvailability, AssetSort, AssetSortDirection, AssetStructuredFilters, FolderItem, LibrarySnapshot, LocalAsset } from './types'

interface LocalLibraryState {
  snapshot: LibrarySnapshot | null
  folder: string
  folders: FolderItem[]
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
  expandedFolderPaths: Set<string>
  setSnapshot: (snapshot: LibrarySnapshot | null) => void
  setFolder: (folder: string) => void
  setFolders: (folders: FolderItem[]) => void
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
  toggleFolderExpanded: (relativePath: string) => void
  resetNavigation: () => void
}

export const useLocalLibraryStore = create<LocalLibraryState>()((set) => ({
  snapshot: null,
  folder: '',
  // 文件夹列表存于全局 store：切换页面后首帧即可渲染完整目录树，
  // 避免重新挂载时先空后刷出（配合 expandedFolderPaths 消除闪烁）
  folders: [],
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
  // 文件夹展开状态：初始空集合 = 首次进入默认折叠；存于全局 store，
  // 切换页面后保留用户手动展开/折叠的结果
  expandedFolderPaths: new Set(),
  setSnapshot: (snapshot) => set({ snapshot }),
  setFolder: (folder) => set({ folder, tagIds: [], collectionIds: [], selectedAsset: null }),
  setFolders: (folders) => set({ folders }),
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
  toggleFolderExpanded: (relativePath) => set((state) => {
    const next = new Set(state.expandedFolderPaths)
    if (next.has(relativePath)) next.delete(relativePath)
    else next.add(relativePath)
    return { expandedFolderPaths: next }
  }),
  resetNavigation: () => set({
    folder: '', folders: [], search: '', sort: 'discovered', sortDirection: 'desc', availability: 'active', favoritesOnly: false, tagIds: [], collectionIds: [], filters: {},
    selectedAsset: null, previewAsset: null,
  }),
}))
