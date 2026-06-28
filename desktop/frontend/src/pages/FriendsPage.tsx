import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import type { FriendLink } from '@/types'
import { Plus, Trash2, ExternalLink, Users } from 'lucide-react'

export function FriendsPage() {
  const { language } = usePreferences()
  const [friends, setFriends] = useState<FriendLink[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', url: '', description: '', avatar: '' })

  const fetchFriends = useCallback(async () => {
    setLoading(true)
    try {
      const result = await (window as any).go.main.App.GetFriends()
      setFriends(result || [])
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchFriends() }, [fetchFriends])

  const handleCreate = async () => {
    if (!form.name.trim() || !form.url.trim()) return
    try {
      await (window as any).go.main.App.CreateFriend({ ...form, featured: false, sortOrder: 0, isActive: true })
      setForm({ name: '', url: '', description: '', avatar: '' })
      setShowCreate(false)
      fetchFriends()
    } catch {}
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此友链吗？')) return
    try {
      await (window as any).go.main.App.DeleteFriend(id)
      fetchFriends()
    } catch {}
  }

  return (
    <>
      <PageHeader
        title={t('admin.page_friends', language)}
        description={`${friends.length} links`}
        actions={
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
            <Plus size={14} /> {t('admin.create_friend', language)}
          </button>
        }
      />
      <div className="flex-1 overflow-auto p-6">
        {showCreate && (
          <div className="mb-4 p-4 rounded-lg border grid grid-cols-2 gap-3"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
            <input placeholder="名称" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="px-3 py-1.5 text-sm rounded border outline-none"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }} />
            <input placeholder="URL" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              className="px-3 py-1.5 text-sm rounded border outline-none"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }} />
            <input placeholder="描述（可选）" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="px-3 py-1.5 text-sm rounded border outline-none col-span-2"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }} />
            <div className="flex gap-2 col-span-2">
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
          <div className="flex items-center justify-center h-64" style={{ color: 'var(--muted-foreground)' }}>{t('common.loading', language)}</div>
        ) : friends.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64" style={{ color: 'var(--muted-foreground)' }}>
            <Users size={32} className="mb-2 opacity-40" />
            <p className="text-sm">{t('common.noData', language)}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {friends.map(friend => (
              <div key={friend.id} className="flex items-center gap-4 px-4 py-3 rounded-lg border"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
                {friend.avatar ? (
                  <img src={friend.avatar} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium shrink-0"
                    style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}>
                    {friend.name[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">{friend.name}</h3>
                    <a href={friend.url} target="_blank" rel="noopener noreferrer"
                      className="hover:opacity-80" style={{ color: 'var(--muted-foreground)' }}>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                  {friend.description && (
                    <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>{friend.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {friend.featured && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-600">精选</span>
                  )}
                  {!friend.isActive && (
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                      已禁用
                    </span>
                  )}
                  <button onClick={() => handleDelete(friend.id)}
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
