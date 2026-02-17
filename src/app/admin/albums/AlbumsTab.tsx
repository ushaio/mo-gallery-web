'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  FolderOpen,
  Plus,
  Trash2,
  ChevronLeft,
  Save,
  Eye,
  EyeOff,
  Image as ImageIcon,
  X,
  Check,
  Layout,
  Settings,
  GripVertical,
  Search,
  LayoutGrid,
  List,
  Filter,
} from 'lucide-react'
import {
  getAdminAlbums,
  createAlbum,
  updateAlbum,
  deleteAlbum,
  addPhotosToAlbum,
  removePhotoFromAlbum,
  setAlbumCover,
  reorderAlbums,
  type AlbumDto,
  type PhotoDto,
  ApiUnauthorizedError,
  resolveAssetUrl,
} from '@/lib/api'
import { CustomInput } from '@/components/ui/CustomInput'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminLoading } from '@/components/admin/AdminLoading'

/** 视图模式：网格 / 列表 */
type ViewMode = 'grid' | 'list'
/** 筛选状态：全部 / 已发布 / 草稿 */
type FilterStatus = 'all' | 'published' | 'draft'

/** AlbumsTab 组件属性 */
interface AlbumsTabProps {
  /** 认证令牌 */
  token: string | null
  /** 所有照片列表，用于添加照片到相册 */
  photos: PhotoDto[]
  /** CDN 域名，用于拼接资源 URL */
  cdnDomain: string
  /** 国际化翻译函数 */
  t: (key: string) => string
  /** 通知提示回调 */
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  /** 认证失效回调（跳转登录等） */
  onUnauthorized: () => void
  /** 照片预览回调 */
  onPreview: (photo: PhotoDto) => void
}

/**
 * 相册管理组件
 *
 * 功能：
 * - 相册列表（网格/列表视图）、搜索与筛选
 * - 创建/编辑/删除相册
 * - 管理相册照片（添加、移除、设置封面）
 * - 拖拽排序相册
 * - 切换发布/草稿状态
 */
export function AlbumsTab({
  token,
  photos,
  cdnDomain,
  t,
  notify,
  onUnauthorized,
  onPreview,
}: AlbumsTabProps) {
  // ==================== 状态定义 ====================

  const [albums, setAlbums] = useState<AlbumDto[]>([])           // 相册列表
  const [loading, setLoading] = useState(true)                   // 加载状态
  const [currentAlbum, setCurrentAlbum] = useState<AlbumDto | null>(null) // 当前编辑的相册（null 表示列表视图）
  const [activeTab, setActiveTab] = useState<'overview' | 'photos'>('overview') // 详情页子标签
  const [saving, setSaving] = useState(false)                    // 保存中状态
  const [showPhotoSelector, setShowPhotoSelector] = useState(false) // 是否显示照片选择器
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set()) // 已选中待添加的照片 ID
  const [draggingId, setDraggingId] = useState<string | null>(null) // 正在拖拽的相册 ID

  // 筛选与视图状态
  const [viewMode, setViewMode] = useState<ViewMode>('grid')          // 视图模式
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all') // 发布状态筛选
  const [searchQuery, setSearchQuery] = useState('')                   // 搜索关键字
  const [showFilters, setShowFilters] = useState(false)                // 是否展开筛选面板

  // token 变化时重新加载相册
  useEffect(() => { loadAlbums() }, [token])

  // ==================== 派生状态 ====================

  /** 当前激活的筛选条件数量 */
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filterStatus !== 'all') count++
    return count
  }, [filterStatus])

  /** 根据筛选条件过滤后的相册列表 */
  const filteredAlbums = useMemo(() => {
    return albums.filter(album => {
      if (filterStatus === 'published' && !album.isPublished) return false
      if (filterStatus === 'draft' && album.isPublished) return false
      if (searchQuery && !album.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
      return true
    })
  }, [albums, filterStatus, searchQuery])

  /** 重置所有筛选条件 */
  const clearAllFilters = () => {
    setFilterStatus('all')
    setSearchQuery('')
  }

  // ==================== 拖拽排序 ====================

  async function handleDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(id)
  }

  function handleDragOver(e: React.DragEvent, targetId: string) {
    e.preventDefault()
    if (!draggingId || draggingId === targetId) return
    const fromIndex = albums.findIndex(a => a.id === draggingId)
    const toIndex = albums.findIndex(a => a.id === targetId)
    if (fromIndex === -1 || toIndex === -1) return
    const newAlbums = [...albums]
    const [moved] = newAlbums.splice(fromIndex, 1)
    newAlbums.splice(toIndex, 0, moved)
    setAlbums(newAlbums)
  }

  /** 拖拽结束：持久化新排序到后端 */
  async function handleDragEnd() {
    setDraggingId(null)
    if (!token) return
    try {
      await reorderAlbums(token, albums.map((a, i) => ({ id: a.id, sortOrder: i })))
    } catch {
      notify(t('common.error'), 'error')
      await loadAlbums()
    }
  }

  // ==================== 数据操作 ====================

  /** 加载相册列表 */
  async function loadAlbums() {
    if (!token) return
    try {
      setLoading(true)
      setAlbums(await getAdminAlbums(token))
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) { onUnauthorized(); return }
      notify(t('common.error'), 'error')
    } finally {
      setLoading(false)
    }
  }

  /** 初始化新相册并进入编辑视图 */
  function handleCreateAlbum() {
    setCurrentAlbum({
      id: '', name: '', description: '', coverUrl: '', isPublished: false,
      sortOrder: albums.length, createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), photos: [], photoCount: 0,
    })
    setActiveTab('overview')
  }

  /** 删除相册（需用户确认） */
  async function handleDeleteAlbum(id: string, e?: React.MouseEvent) {
    e?.stopPropagation()
    if (!token || !window.confirm(t('common.confirm') + '?')) return
    try {
      await deleteAlbum(token, id)
      notify(t('admin.notify_success'), 'success')
      if (currentAlbum?.id === id) setCurrentAlbum(null)
      await loadAlbums()
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) { onUnauthorized(); return }
      notify(t('common.error'), 'error')
    }
  }

  /** 保存相册（创建或更新） */
  async function handleSaveAlbum() {
    if (!token || !currentAlbum || !currentAlbum.name.trim()) {
      notify(t('admin.album_name_required') || 'Please enter album name', 'error')
      return
    }
    try {
      setSaving(true)
      const isNew = !currentAlbum.id
      const data = { name: currentAlbum.name, description: currentAlbum.description || undefined, coverUrl: currentAlbum.coverUrl || undefined, isPublished: currentAlbum.isPublished, sortOrder: currentAlbum.sortOrder }
      const result = isNew ? await createAlbum(token, data) : await updateAlbum(token, currentAlbum.id, data)
      notify(isNew ? (t('admin.album_created') || 'Album created') : (t('admin.album_updated') || 'Album updated'), 'success')
      setCurrentAlbum(result)
      await loadAlbums()
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) { onUnauthorized(); return }
      notify(t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  /** 切换相册发布/草稿状态 */
  async function handleTogglePublish(album: AlbumDto, e?: React.MouseEvent) {
    e?.stopPropagation()
    if (!token) return
    try {
      const updated = await updateAlbum(token, album.id, { isPublished: !album.isPublished })
      notify(t('admin.notify_success'), 'success')
      setAlbums(prev => prev.map(a => a.id === updated.id ? updated : a))
      if (currentAlbum?.id === updated.id) setCurrentAlbum(updated)
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) { onUnauthorized(); return }
      notify(t('common.error'), 'error')
    }
  }

  // ==================== 照片管理 ====================

  /** 批量添加照片到当前相册 */
  async function handleAddPhotos() {
    if (!token || !currentAlbum || selectedPhotoIds.size === 0) return
    try {
      setSaving(true)
      await addPhotosToAlbum(token, currentAlbum.id, Array.from(selectedPhotoIds))
      notify(t('admin.photos_added') || 'Photos added', 'success')
      setShowPhotoSelector(false)
      setSelectedPhotoIds(new Set())
      const updatedAlbums = await getAdminAlbums(token)
      setAlbums(updatedAlbums)
      const updatedCurrent = updatedAlbums.find(a => a.id === currentAlbum.id)
      if (updatedCurrent) setCurrentAlbum(updatedCurrent)
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) { onUnauthorized(); return }
      notify(t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  /** 从当前相册移除单张照片 */
  async function handleRemovePhoto(photoId: string) {
    if (!token || !currentAlbum) return
    try {
      const updated = await removePhotoFromAlbum(token, currentAlbum.id, photoId)
      setCurrentAlbum(updated)
      setAlbums(prev => prev.map(a => a.id === updated.id ? updated : a))
      notify(t('admin.photo_removed') || 'Photo removed', 'success')
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) { onUnauthorized(); return }
      notify(t('common.error'), 'error')
    }
  }

  /** 设置照片为相册封面 */
  async function handleSetCover(photoId: string) {
    if (!token || !currentAlbum) return
    try {
      const updated = await setAlbumCover(token, currentAlbum.id, photoId)
      setCurrentAlbum(updated)
      setAlbums(prev => prev.map(a => a.id === updated.id ? updated : a))
      notify(t('admin.cover_set') || 'Cover set', 'success')
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) { onUnauthorized(); return }
      notify(t('common.error'), 'error')
    }
  }

  /** 可添加的照片：排除当前相册已有的照片 */
  const availablePhotos = useMemo(() => {
    if (!currentAlbum) return photos
    const albumPhotoIds = new Set(currentAlbum.photos.map(p => p.id))
    return photos.filter(p => !albumPhotoIds.has(p.id))
  }, [photos, currentAlbum])

  // ==================== 渲染 ====================

  if (loading) {
    return <AdminLoading text={t('common.loading')} />
  }

  // ---------- 列表视图（未选中相册） ----------
  if (!currentAlbum) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-light tracking-wide">{t('admin.albums') || 'Albums'}</h2>
            <p className="text-xs text-muted-foreground mt-1">{filteredAlbums.length} of {albums.length}</p>
          </div>
          <AdminButton onClick={handleCreateAlbum} adminVariant="unstyled" className="flex items-center gap-2 px-5 py-2.5 bg-foreground text-background text-xs font-medium hover:bg-primary hover:text-primary-foreground transition-colors">
            <Plus className="w-4 h-4" />
            {t('admin.new_album') || 'New Album'}
          </AdminButton>
        </div>

        {/* Main Toolbar */}
        <div className="bg-muted/30 border border-border rounded-lg p-4">
          {/* Top Row: Search, Actions */}
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            {/* Left: Info */}
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm font-medium text-foreground">
                <span className="text-muted-foreground">{filteredAlbums.length} {t('admin.albums') || 'Albums'}</span>
              </span>
            </div>

            {/* Center: Search */}
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={t('common.search')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-9 pl-9 pr-4 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
                {searchQuery && (
                  <AdminButton
                    onClick={() => setSearchQuery('')}
                    adminVariant="unstyled"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </AdminButton>
                )}
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Filter Toggle */}
              <AdminButton
                onClick={() => setShowFilters(!showFilters)}
                adminVariant="unstyled"
                className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border rounded-md transition-all ${showFilters || activeFilterCount > 0
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-background border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                  }`}
              >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">{t('admin.filter') || 'Filter'}</span>
                {activeFilterCount > 0 && (
                  <span className="flex items-center justify-center w-5 h-5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full">
                    {activeFilterCount}
                  </span>
                )}
              </AdminButton>

              {/* View Mode Toggle */}
              <div className="flex bg-background border border-border rounded-md overflow-hidden">
                <AdminButton
                  onClick={() => setViewMode('grid')}
                  adminVariant="unstyled"
                  className={`p-2 transition-colors ${viewMode === 'grid'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  title="Grid view"
                >
                  <LayoutGrid className="w-4 h-4" />
                </AdminButton>
                <AdminButton
                  onClick={() => setViewMode('list')}
                  adminVariant="unstyled"
                  className={`p-2 transition-colors ${viewMode === 'list'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  title="List view"
                >
                  <List className="w-4 h-4" />
                </AdminButton>
              </div>
            </div>
          </div>

          {/* Filter Row - Collapsible */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex flex-wrap items-center gap-3">
                {/* Status Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{t('admin.status') || 'Status'}:</span>
                  <div className="flex bg-background border border-border rounded-md overflow-hidden">
                    {(['all', 'published', 'draft'] as FilterStatus[]).map(status => (
                      <AdminButton
                        key={status}
                        onClick={() => setFilterStatus(status)}
                        adminVariant="unstyled"
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${filterStatus === status ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                      >
                        {status === 'all' ? t('common.all') || 'All' : status === 'published' ? t('admin.published') || 'Published' : t('admin.draft') || 'Draft'}
                      </AdminButton>
                    ))}
                  </div>
                </div>

                {/* Clear Filters */}
                {activeFilterCount > 0 && (
                  <>
                    <div className="h-5 w-px bg-border my-auto" />
                    <AdminButton
                      onClick={clearAllFilters}
                      adminVariant="unstyled"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Clear all</span>
                    </AdminButton>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Active Filters Tags */}
          {activeFilterCount > 0 && !showFilters && (
            <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Active filters:</span>
              {filterStatus !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-md">
                  {filterStatus === 'published' ? t('admin.published') : t('admin.draft')}
                  <AdminButton onClick={() => setFilterStatus('all')} adminVariant="unstyled" className="hover:text-primary/70">
                    <X className="w-3 h-3" />
                  </AdminButton>
                </span>
              )}
              <AdminButton
                onClick={clearAllFilters}
                adminVariant="unstyled"
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Clear all
              </AdminButton>
            </div>
          )}
        </div>

        {/* Content */}
        {filteredAlbums.length === 0 ? (
          <div className="py-20 text-center border border-dashed border-border/50 bg-muted/5">
            <FolderOpen className="w-12 h-12 mx-auto mb-4 opacity-10" />
            <p className="text-sm text-muted-foreground mb-4">{searchQuery || filterStatus !== 'all' ? 'No albums match your filters' : (t('admin.no_albums') || 'No albums yet')}</p>
            {!searchQuery && filterStatus === 'all' && (
              <AdminButton onClick={handleCreateAlbum} adminVariant="unstyled" className="inline-flex items-center gap-2 px-4 py-2 border border-border text-xs font-medium hover:bg-muted transition-colors">
                <Plus className="w-4 h-4" />
                {t('admin.create_first_album') || 'Create your first album'}
              </AdminButton>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredAlbums.map(album => (
              <div
                key={album.id}
                draggable
                onDragStart={e => handleDragStart(e, album.id)}
                onDragOver={e => handleDragOver(e, album.id)}
                onDragEnd={handleDragEnd}
                onClick={() => { setCurrentAlbum({ ...album }); setActiveTab('photos') }}
                className={`group cursor-pointer bg-card border border-border/50 hover:border-border transition-all ${draggingId === album.id ? 'opacity-50' : ''}`}
              >
                <div className="relative aspect-[4/3] bg-muted overflow-hidden">
                  <div className="absolute top-2 left-2 z-10 p-1 bg-black/40 text-white/70 hover:text-white cursor-grab opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                    <GripVertical className="w-4 h-4" />
                  </div>
                  {album.coverUrl || album.photos.length > 0 ? (
                    <img src={resolveAssetUrl(album.coverUrl || album.photos[0]?.thumbnailUrl || album.photos[0]?.url, cdnDomain)} alt={album.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><FolderOpen className="w-10 h-10 opacity-10" /></div>
                  )}
                  <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/50 text-white text-[10px] font-medium">{album.photoCount}</div>
                  <div className="absolute bottom-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <AdminButton onClick={e => handleTogglePublish(album, e)} adminVariant="unstyled" className="p-1.5 bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm transition-colors">
                      {album.isPublished ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </AdminButton>
                    <AdminButton onClick={e => handleDeleteAlbum(album.id, e)} adminVariant="unstyled" className="p-1.5 bg-red-500/80 hover:bg-red-500 text-white transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </AdminButton>
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-medium truncate">{album.name}</h3>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${album.isPublished ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                  </div>
                  {album.description && <p className="text-xs text-muted-foreground line-clamp-1">{album.description}</p>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredAlbums.map(album => (
              <div
                key={album.id}
                draggable
                onDragStart={e => handleDragStart(e, album.id)}
                onDragOver={e => handleDragOver(e, album.id)}
                onDragEnd={handleDragEnd}
                onClick={() => { setCurrentAlbum({ ...album }); setActiveTab('photos') }}
                className={`group flex items-center gap-4 p-4 bg-card border border-border/50 hover:border-border cursor-pointer transition-all ${draggingId === album.id ? 'opacity-50' : ''}`}
              >
                <div className="text-muted-foreground/40 group-hover:text-muted-foreground cursor-grab" onClick={e => e.stopPropagation()}>
                  <GripVertical className="w-4 h-4" />
                </div>
                <div className="w-16 h-12 bg-muted overflow-hidden flex-shrink-0">
                  {album.coverUrl || album.photos.length > 0 ? (
                    <img src={resolveAssetUrl(album.coverUrl || album.photos[0]?.thumbnailUrl || album.photos[0]?.url, cdnDomain)} alt={album.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><FolderOpen className="w-5 h-5 opacity-20" /></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium truncate">{album.name}</h3>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${album.isPublished ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                  </div>
                  <p className="text-xs text-muted-foreground">{album.photoCount} photos</p>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <AdminButton onClick={e => handleTogglePublish(album, e)} adminVariant="unstyled" className="p-2 hover:bg-muted transition-colors">
                    {album.isPublished ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                  </AdminButton>
                  <AdminButton onClick={e => handleDeleteAlbum(album.id, e)} adminVariant="unstyled" className="p-2 text-destructive hover:bg-destructive/10 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </AdminButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ---------- 详情视图（编辑相册） ----------
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <AdminButton onClick={() => setCurrentAlbum(null)} adminVariant="icon">
            <ChevronLeft className="w-5 h-5" />
          </AdminButton>
          <div>
            <h2 className="text-lg font-medium">{currentAlbum.name || (t('admin.new_album') || 'New Album')}</h2>
            <p className="text-xs text-muted-foreground">{currentAlbum.isPublished ? t('admin.published') : t('admin.draft')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'overview' && (
            <AdminButton onClick={handleSaveAlbum} disabled={saving} adminVariant="unstyled" className="flex items-center gap-2 px-5 py-2 bg-foreground text-background text-xs font-medium hover:bg-primary hover:text-primary-foreground disabled:opacity-50 transition-colors">
              <Save className="w-4 h-4" />
              {saving ? t('common.loading') : t('admin.save')}
            </AdminButton>
          )}
          {activeTab === 'photos' && (
            <AdminButton onClick={() => setShowPhotoSelector(true)} adminVariant="unstyled" className="flex items-center gap-2 px-5 py-2 bg-foreground text-background text-xs font-medium hover:bg-primary hover:text-primary-foreground transition-colors">
              <Plus className="w-4 h-4" />
              {t('admin.add_photos') || 'Add Photos'}
            </AdminButton>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-border">
        <AdminButton onClick={() => setActiveTab('overview')} adminVariant="unstyled" className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${activeTab === 'overview' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <Settings className="w-4 h-4" />
          {t('admin.overview') || 'Overview'}
        </AdminButton>
        {currentAlbum.id && (
          <AdminButton onClick={() => setActiveTab('photos')} adminVariant="unstyled" className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${activeTab === 'photos' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <Layout className="w-4 h-4" />
            {t('admin.photos') || 'Photos'}
            <span className="ml-1 px-1.5 py-0.5 bg-muted text-[10px]">{currentAlbum.photos.length}</span>
          </AdminButton>
        )}
      </div>

      <div className="pt-2">
        {activeTab === 'overview' ? (
          <div className="max-w-xl space-y-6">
            <div>
              <label className="block text-xs text-muted-foreground mb-2">{t('admin.album_name') || 'Album Name'}</label>
              <CustomInput variant="config" value={currentAlbum.name} onChange={e => setCurrentAlbum({ ...currentAlbum, name: e.target.value })} placeholder={t('admin.album_name_placeholder') || 'Enter album name'} />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-2">{t('admin.description') || 'Description'}</label>
              <textarea value={currentAlbum.description || ''} onChange={e => setCurrentAlbum({ ...currentAlbum, description: e.target.value })} placeholder={t('admin.description_placeholder') || 'Enter description (optional)'} className="w-full p-3 h-24 bg-muted/30 border-b border-border focus:border-primary outline-none text-sm transition-colors resize-none" />
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted/30 border-b border-border">
              <input type="checkbox" checked={currentAlbum.isPublished} onChange={e => setCurrentAlbum({ ...currentAlbum, isPublished: e.target.checked })} className="w-4 h-4 accent-primary" />
              <span className="text-sm">{currentAlbum.isPublished ? t('admin.published') : t('admin.draft')}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {showPhotoSelector ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-muted/30 border border-border">
                  <div className="flex items-center gap-3">
                    <AdminButton onClick={() => { setShowPhotoSelector(false); setSelectedPhotoIds(new Set()) }} adminVariant="icon">
                      <X className="w-4 h-4" />
                    </AdminButton>
                    <span className="text-sm">{selectedPhotoIds.size} selected</span>
                  </div>
                  <AdminButton onClick={handleAddPhotos} disabled={selectedPhotoIds.size === 0 || saving} adminVariant="unstyled" className="flex items-center gap-2 px-4 py-1.5 bg-foreground text-background text-xs font-medium disabled:opacity-50 transition-colors">
                    <Check className="w-3.5 h-3.5" />
                    Add
                  </AdminButton>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
                  {availablePhotos.map(photo => {
                    const isSelected = selectedPhotoIds.has(photo.id)
                    return (
                      <div key={photo.id} onClick={() => setSelectedPhotoIds(prev => { const next = new Set(prev); next.has(photo.id) ? next.delete(photo.id) : next.add(photo.id); return next })} className={`relative aspect-square cursor-pointer ${isSelected ? 'ring-2 ring-primary' : 'hover:opacity-80'}`}>
                        <img src={resolveAssetUrl(photo.thumbnailUrl || photo.url, cdnDomain)} alt={photo.title} className="w-full h-full object-cover" />
                        {isSelected && <div className="absolute inset-0 bg-primary/20 flex items-center justify-center"><Check className="w-5 h-5 text-primary" /></div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : currentAlbum.photos.length === 0 ? (
              <div className="py-16 text-center border border-dashed border-border/50 bg-muted/5">
                <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-10" />
                <p className="text-sm text-muted-foreground mb-3">{t('admin.album_empty') || 'This album is empty'}</p>
                <AdminButton onClick={() => setShowPhotoSelector(true)} adminVariant="unstyled" className="inline-flex items-center gap-2 px-4 py-2 border border-border text-xs font-medium hover:bg-muted transition-colors">
                  <Plus className="w-4 h-4" />
                  {t('admin.add_photos') || 'Add Photos'}
                </AdminButton>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
                {currentAlbum.photos.map(photo => {
                  const isCover = currentAlbum.coverUrl === (photo.thumbnailUrl || photo.url)
                  return (
                    <div
                      key={photo.id}
                      className="relative aspect-square group bg-muted overflow-hidden cursor-pointer"
                      onClick={() => onPreview(photo)}
                    >
                      <img src={resolveAssetUrl(photo.thumbnailUrl || photo.url, cdnDomain)} alt={photo.title} className="w-full h-full object-cover" />
                      {isCover && <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-primary text-primary-foreground text-[8px] font-medium">Cover</div>}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5">
                        {!isCover && <AdminButton onClick={(e) => { e.stopPropagation(); handleSetCover(photo.id) }} adminVariant="unstyled" className="px-2 py-1 bg-white/20 hover:bg-white/30 text-white text-[9px] font-medium">Set Cover</AdminButton>}
                        <AdminButton onClick={(e) => { e.stopPropagation(); handleRemovePhoto(photo.id) }} adminVariant="unstyled" className="px-2 py-1 bg-red-500/80 hover:bg-red-500 text-white text-[9px] font-medium">Remove</AdminButton>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}