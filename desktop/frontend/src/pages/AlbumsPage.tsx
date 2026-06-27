import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import type { Album } from '@/types'
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
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAlbums() }, [fetchAlbums])

  const handleCreate = async () => {
    if (!form.name.trim()) return
    try {
      await (window as any).go.main.App.CreateAlbum(form)
      setForm({ name: '', description: '', isPublished: false })
      setShowCreate(false)
      fetchAlbums()
    } catch {}
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此相册吗？')) return
    try {
      await (window as any).go.main.App.DeleteAlbum(id)
      fetchAlbums()
    } catch {}
  }

  const togglePublished = async (album: Album) => {
    try {
      await (window as any).go.main.App.UpdateAlbum(album.id, { isPublished: !album.isPublished })
      fetchAlbums()
    } catch {}
  }

  return (
    <>
      <PageHeader
        title={t('albums.title', language)}
        description={`${albums.length} albums`}
        actions={
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            <Plus size={14} /> {t('albums.create', language)}
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
          <div className="flex items-center justify-center h-64" style={{ color: 'var(--muted-foreground)' }}>
            {t('common.loading', language)}
          </div>
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
                      {album.isPublished ? t('albums.published', language) : t('albums.draft', language)}
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
