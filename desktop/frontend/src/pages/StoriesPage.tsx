import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { resolveAssetUrl } from '@/lib/api'
import type { Story, Photo } from '@/types'
import { ListSkeleton } from '@/components/admin/Skeleton'
import {
  Plus, Trash2, Eye, EyeOff, FileText, X, ChevronLeft,
  Save, Loader2, ImagePlus, GripVertical, Calendar,
} from 'lucide-react'

type View = 'list' | 'edit'

export function StoriesPage() {
  const { language } = usePreferences()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<View>('list')
  const [editingStory, setEditingStory] = useState<Story | null>(null)

  const fetchStories = useCallback(async () => {
    setLoading(true)
    try {
      const result = await (window as any).go.main.App.GetStories()
      setStories(result || [])
    } catch (err: any) {
      console.error('加载叙事失败:', err)
      toast.error(err?.message || '加载叙事失败')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchStories() }, [fetchStories])

  // 创建新故事
  const handleCreate = () => {
    setEditingStory(null)
    setView('edit')
  }

  // 编辑故事
  const handleEdit = (story: Story) => {
    setEditingStory(story)
    setView('edit')
  }

  // 删除故事
  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此故事吗？')) return
    try {
      await (window as any).go.main.App.DeleteStory(id)
      toast.success('已删除')
      fetchStories()
    } catch (err: any) {
      toast.error(err?.message || '删除失败')
    }
  }

  // 切换发布状态
  const togglePublished = async (story: Story) => {
    try {
      await (window as any).go.main.App.UpdateStory(story.id, { isPublished: !story.isPublished })
      toast.success(story.isPublished ? '已取消发布' : '已发布')
      fetchStories()
    } catch (err: any) {
      toast.error(err?.message || '操作失败')
    }
  }

  // 从编辑器返回列表
  const handleBack = () => {
    setView('list')
    setEditingStory(null)
    fetchStories()
  }

  if (view === 'edit') {
    return <StoryEditor story={editingStory} onBack={handleBack} />
  }

  return (
    <>
      <PageHeader
        title={t('admin.page_stories', language)}
        description={`${stories.length} stories`}
        actions={
          <button onClick={handleCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
            <Plus size={14} /> {t('admin.create_story', language)}
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <ListSkeleton count={5} />
        ) : stories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64" style={{ color: 'var(--muted-foreground)' }}>
            <FileText size={32} className="mb-2 opacity-40" />
            <p className="text-sm">{t('common.noData', language)}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {stories.map(story => (
              <div key={story.id}
                className="flex items-center gap-4 px-4 py-3 rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}
                onClick={() => handleEdit(story)}>
                {/* 封面缩略图 */}
                {story.coverPhotoId ? (
                  <div className="w-12 h-12 rounded overflow-hidden shrink-0" style={{ backgroundColor: 'var(--muted)' }}>
                    <img src={resolveAssetUrl(story.coverPhotoId)} alt="" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'var(--muted)' }}>
                    <FileText size={18} style={{ color: 'var(--muted-foreground)' }} />
                  </div>
                )}

                {/* 故事信息 */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium truncate">{story.title}</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                    {story.photos?.length || 0} photos · {new Date(story.storyDate || story.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {/* 状态标签 */}
                <span className="text-xs px-2 py-0.5 rounded shrink-0"
                  style={{
                    backgroundColor: story.isPublished ? 'var(--accent)' : 'var(--muted)',
                    color: story.isPublished ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
                  }}>
                  {story.isPublished ? t('admin.stories_status_published', language) : t('admin.stories_status_draft', language)}
                </span>

                {/* 操作按钮 */}
                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  <button onClick={() => togglePublished(story)}
                    className="p-1 rounded hover:opacity-80" style={{ color: 'var(--muted-foreground)' }}>
                    {story.isPublished ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button onClick={() => handleDelete(story.id)}
                    className="p-1 rounded hover:opacity-80" style={{ color: 'var(--destructive)' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ─── 故事编辑器 ──────────────────────────────────────

interface StoryEditorProps {
  story: Story | null // null = 新建
  onBack: () => void
}

function StoryEditor({ story, onBack }: StoryEditorProps) {
  const isNew = !story
  const [title, setTitle] = useState(story?.title || '')
  const [content, setContent] = useState(story?.content || '')
  const [isPublished, setIsPublished] = useState(story?.isPublished ?? false)
  const [storyDate, setStoryDate] = useState(
    story?.storyDate ? new Date(story.storyDate).toISOString().split('T')[0] :
    new Date().toISOString().split('T')[0]
  )
  const [photos, setPhotos] = useState<Photo[]>(story?.photos || [])
  const [saving, setSaving] = useState(false)
  const [showPhotoSelector, setShowPhotoSelector] = useState(false)
  const [availablePhotos, setAvailablePhotos] = useState<Photo[]>([])
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const [photoSearch, setPhotoSearch] = useState('')
  const [photoPage, setPhotoPage] = useState(1)
  const [photoHasMore, setPhotoHasMore] = useState(true)

  // 加载故事详情（编辑模式）
  useEffect(() => {
    if (story?.id) {
      (async () => {
        try {
          const detail = await (window as any).go.main.App.GetStory(story.id)
          if (detail?.photos) setPhotos(detail.photos)
        } catch {}
      })()
    }
  }, [story?.id])

  // 保存故事
  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('请输入标题')
      return
    }
    setSaving(true)
    try {
      if (isNew) {
        const result = await (window as any).go.main.App.CreateStory({
          title: title.trim(),
          content,
          isPublished,
          photoIds: photos.map(p => p.id),
        })
        toast.success('故事已创建')
        // 切换到编辑模式
        if (result?.id) {
          window.history.replaceState(null, '', `/stories`)
        }
      } else {
        await (window as any).go.main.App.UpdateStory(story!.id, {
          title: title.trim(),
          content,
          isPublished,
          storyDate: new Date(storyDate).toISOString(),
        })
        toast.success('已保存')
      }
    } catch (err: any) {
      toast.error(err?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  // 加载可选照片
  const loadAvailablePhotos = async (reset = false) => {
    if (loadingPhotos) return
    const page = reset ? 1 : photoPage
    setLoadingPhotos(true)
    try {
      const result = await (window as any).go.main.App.GetPhotos({
        search: photoSearch,
        page,
        pageSize: 30,
      })
      const newPhotos = result?.data || []
      setAvailablePhotos(prev => reset ? newPhotos : [...prev, ...newPhotos])
      setPhotoHasMore(result?.meta?.hasMore ?? false)
      setPhotoPage(page + 1)
    } catch {} finally { setLoadingPhotos(false) }
  }

  // 打开照片选择器
  const openPhotoSelector = () => {
    setShowPhotoSelector(true)
    setAvailablePhotos([])
    setPhotoPage(1)
    setPhotoSearch('')
    loadAvailablePhotos(true)
  }

  // 添加照片到故事
  const addPhoto = async (photo: Photo) => {
    if (photos.some(p => p.id === photo.id)) return
    if (!isNew && story?.id) {
      try {
        await (window as any).go.main.App.AddStoryPhoto(story.id, photo.id)
      } catch {}
    }
    setPhotos(prev => [...prev, photo])
  }

  // 移除照片
  const removePhoto = async (photoId: string) => {
    if (!isNew && story?.id) {
      try {
        await (window as any).go.main.App.RemoveStoryPhoto(story.id, photoId)
      } catch {}
    }
    setPhotos(prev => prev.filter(p => p.id !== photoId))
  }

  return (
    <>
      <PageHeader
        title={isNew ? '创建故事' : `编辑: ${story?.title || ''}`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={onBack}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md"
              style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}>
              <ChevronLeft size={14} /> 返回
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md disabled:opacity-50"
              style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? '保存中...' : t('common.save', 'zh')}
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-hidden flex">
        {/* 左侧：编辑区 */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-3xl space-y-4">
            {/* 标题 */}
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="故事标题"
              className="w-full text-xl font-semibold px-0 py-2 border-0 outline-none bg-transparent"
              style={{ color: 'var(--foreground)' }} />

            {/* 元数据行 */}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isPublished}
                  onChange={e => setIsPublished(e.target.checked)}
                  className="rounded" />
                <span className="text-xs">发布</span>
              </label>
              <div className="flex items-center gap-1.5">
                <Calendar size={14} style={{ color: 'var(--muted-foreground)' }} />
                <input type="date" value={storyDate}
                  onChange={e => setStoryDate(e.target.value)}
                  className="text-xs px-2 py-1 rounded border outline-none"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }} />
              </div>
            </div>

            {/* 内容 */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>
                内容 (Markdown)
              </label>
              <textarea value={content} onChange={e => setContent(e.target.value)}
                placeholder="在此输入故事内容..."
                rows={20}
                className="w-full px-4 py-3 text-sm rounded-lg border outline-none resize-y font-mono"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)', color: 'var(--foreground)', minHeight: '300px' }} />
            </div>
          </div>
        </div>

        {/* 右侧：照片面板 */}
        <div className="w-80 border-l overflow-auto p-4 shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">照片 ({photos.length})</span>
            <button onClick={openPhotoSelector}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded"
              style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}>
              <ImagePlus size={14} /> 添加
            </button>
          </div>

          {photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12"
              style={{ color: 'var(--muted-foreground)' }}>
              <ImagePlus size={24} className="mb-2 opacity-40" />
              <p className="text-xs">暂无照片</p>
            </div>
          ) : (
            <div className="space-y-2">
              {photos.map((photo, idx) => (
                <div key={photo.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded border"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
                  <GripVertical size={12} style={{ color: 'var(--muted-foreground)', cursor: 'grab' }} />
                  <img src={resolveAssetUrl(photo.thumbnailUrl || photo.url)} alt=""
                    className="w-10 h-10 rounded object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate">{photo.title || 'Untitled'}</p>
                    <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                      {photo.width}×{photo.height}
                    </p>
                  </div>
                  <button onClick={() => removePhoto(photo.id)}
                    className="p-0.5 rounded hover:opacity-80" style={{ color: 'var(--destructive)' }}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 照片选择弹窗 */}
      {showPhotoSelector && (
        <PhotoSelectorModal
          photos={availablePhotos}
          loading={loadingPhotos}
          hasMore={photoHasMore}
          selectedIds={new Set(photos.map(p => p.id))}
          search={photoSearch}
          onSearchChange={setPhotoSearch}
          onSearch={() => loadAvailablePhotos(true)}
          onLoadMore={() => loadAvailablePhotos(false)}
          onSelect={addPhoto}
          onClose={() => setShowPhotoSelector(false)}
        />
      )}
    </>
  )
}

// ─── 照片选择弹窗 ────────────────────────────────────

function PhotoSelectorModal({ photos, loading, hasMore, selectedIds, search, onSearchChange, onSearch, onLoadMore, onSelect, onClose }: {
  photos: Photo[]
  loading: boolean
  hasMore: boolean
  selectedIds: Set<string>
  search: string
  onSearchChange: (s: string) => void
  onSearch: () => void
  onLoadMore: () => void
  onSelect: (photo: Photo) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-[800px] max-h-[80vh] rounded-xl overflow-hidden flex flex-col"
        style={{ backgroundColor: 'var(--card)' }}>
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <span className="text-sm font-medium">选择照片</span>
          <button onClick={onClose} className="p-1 rounded hover:opacity-80" style={{ color: 'var(--muted-foreground)' }}>
            <X size={16} />
          </button>
        </div>

        {/* 搜索 */}
        <div className="px-4 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex gap-2">
            <input type="text" value={search}
              onChange={e => onSearchChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onSearch()}
              placeholder="搜索照片..."
              className="flex-1 px-3 py-1.5 text-xs rounded border outline-none"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }} />
            <button onClick={onSearch}
              className="px-3 py-1.5 text-xs rounded"
              style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
              搜索
            </button>
          </div>
        </div>

        {/* 照片网格 */}
        <div className="flex-1 overflow-auto p-4">
          {loading && photos.length === 0 ? (
            <div className="flex items-center justify-center py-12" style={{ color: 'var(--muted-foreground)' }}>
              <Loader2 size={16} className="animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-6 gap-2">
              {photos.map(photo => {
                const isSelected = selectedIds.has(photo.id)
                return (
                  <div key={photo.id}
                    className="relative aspect-square rounded overflow-hidden cursor-pointer border-2 transition-all"
                    style={{ borderColor: isSelected ? 'var(--ring)' : 'transparent', opacity: isSelected ? 0.5 : 1 }}
                    onClick={() => { if (!isSelected) onSelect(photo) }}>
                    <img src={resolveAssetUrl(photo.thumbnailUrl || photo.url)} alt=""
                      className="w-full h-full object-cover" loading="lazy" />
                    {isSelected && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <span className="text-white text-xs font-medium">已添加</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {hasMore && (
            <div className="flex justify-center py-4">
              <button onClick={onLoadMore} disabled={loading}
                className="px-4 py-1.5 text-xs rounded disabled:opacity-50"
                style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}>
                {loading ? <Loader2 size={14} className="animate-spin" /> : '加载更多'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
