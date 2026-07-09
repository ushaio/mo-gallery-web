import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import type { Album } from '@/types'
import { CardGridSkeleton } from '@/components/admin/Skeleton'
import { toast } from 'sonner'
import { Plus, Trash2, Eye, EyeOff, GripVertical } from 'lucide-react'

export function AlbumsPage() {
  const { language } = usePreferences()
  const [albums, setAlbums] = useState<Album[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', isPublished: false })

  const fetchAlbums = useCallback(async () => {
    setLoading(true)
    try {
      const result = await (window as any).go.main.App.GetAlbums()
      setAlbums(result || [])
    } catch (err: any) {
      toast.error(err?.message || '获取相册列表失败')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAlbums() }, [fetchAlbums])

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error('请输入相册名称')
      return
    }
    try {
      await (window as any).go.main.App.CreateAlbum(form)
      setForm({ name: '', description: '', isPublished: false })
      setShowCreate(false)
      fetchAlbums()
      toast.success('相册已创建')
    } catch (err: any) {
      toast.error(err?.message || '创建相册失败')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此相册吗？')) return
    try {
      await (window as any).go.main.App.DeleteAlbum(id)
      fetchAlbums()
      toast.success('相册已删除')
    } catch (err: any) {
      toast.error(err?.message || '删除相册失败')
    }
  }

  const togglePublished = async (album: Album) => {
    try {
      await (window as any).go.main.App.UpdateAlbum(album.id, { isPublished: !album.isPublished })
      fetchAlbums()
    } catch (err: any) {
      toast.error(err?.message || '更新发布状态失败')
    }
  }

  return (
    <>
      <PageHeader
        title={t('admin.page_albums', language)}
        description={`${albums.length} albums`}
        actions={
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            <Plus size={14} /> {t('admin.create_album', language)}
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {/* 创建表单 */}
        {showCreate && (
          <div className="mb-4 p-4 rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
            <div className="flex gap-3">
              <input
                placeholder="相册名称"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="flex-1 px-3 py-1.5 text-sm rounded border outline-none"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }}
              />
              <input
                placeholder="描述（可选）"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="flex-1 px-3 py-1.5 text-sm rounded border outline-none"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }}
              />
              <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                <input
                  type="checkbox"
                  checked={form.isPublished}
                  onChange={e => setForm(f => ({ ...f, isPublished: e.target.checked }))}
                />
                发布
              </label>
              <button onClick={handleCreate} className="px-4 py-1.5 text-xs rounded"
                style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                {t('common.create', language)}
              </button>
              <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-xs rounded"
                style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}>
                {t('common.cancel', language)}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <CardGridSkeleton count={8} cols={4} />
        ) : albums.length === 0 ? (
          <div className="flex items-center justify-center h-64" style={{ color: 'var(--muted-foreground)' }}>
            {t('common.noData', language)}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {albums.map(album => (
              <div key={album.id} className="rounded-lg border overflow-hidden group"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
                {/* 封面 */}
                <div className="aspect-video relative"
                  style={{ backgroundColor: 'var(--muted)' }}>
                  {album.coverUrl ? (
                    <img src={album.coverUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex items-center justify-center h-full text-2xl"
                      style={{ color: 'var(--muted-foreground)' }}>
                      📷
                    </div>
                  )}
                </div>
                {/* 信息 */}
                <div className="p-3">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-medium truncate">{album.name}</h3>
                    <span className="text-xs px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: album.isPublished ? 'var(--accent)' : 'var(--muted)',
                        color: album.isPublished ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
                      }}>
                      {album.isPublished ? t('admin.albums_status_published', language) : t('admin.albums_status_draft', language)}
                    </span>
                  </div>
                  <p className="text-xs mb-2" style={{ color: 'var(--muted-foreground)' }}>
                    {album.photoCount} photos
                  </p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => togglePublished(album)}
                      className="p-1 rounded hover:opacity-80" style={{ color: 'var(--muted-foreground)' }}>
                      {album.isPublished ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button onClick={() => handleDelete(album.id)}
                      className="p-1 rounded hover:opacity-80" style={{ color: 'var(--destructive)' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
