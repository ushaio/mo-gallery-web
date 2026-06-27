import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import type { FilmRoll } from '@/types'
import { Plus, Trash2 } from 'lucide-react'

export function FilmRollsPage() {
  const { language } = usePreferences()
  const [rolls, setRolls] = useState<FilmRoll[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', brand: '', format: '135', iso: 400, frameCount: 36, notes: '' })

  const fetchRolls = useCallback(async () => {
    setLoading(true)
    try {
      const result = await (window as any).go.main.App.GetFilmRolls()
      setRolls(result || [])
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchRolls() }, [fetchRolls])

  const handleCreate = async () => {
    if (!form.name.trim() || !form.brand.trim()) return
    try {
      await (window as any).go.main.App.CreateFilmRoll(form)
      setForm({ name: '', brand: '', format: '135', iso: 400, frameCount: 36, notes: '' })
      setShowCreate(false)
      fetchRolls()
    } catch {}
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此胶卷吗？')) return
    try {
      await (window as any).go.main.App.DeleteFilmRoll(id)
      fetchRolls()
    } catch {}
  }

  return (
    <>
      <PageHeader
        title={t('filmRolls.title', language)}
        description={`${rolls.length} rolls`}
        actions={
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
            <Plus size={14} /> {t('filmRolls.create', language)}
          </button>
        }
      />
      <div className="flex-1 overflow-auto p-6">
        {showCreate && (
          <div className="mb-4 p-4 rounded-lg border grid grid-cols-6 gap-3"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
            <input placeholder="胶卷名称" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="px-3 py-1.5 text-sm rounded border outline-none"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }} />
            <input placeholder="品牌" value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
              className="px-3 py-1.5 text-sm rounded border outline-none"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }} />
            <select value={form.format} onChange={e => setForm(f => ({ ...f, format: e.target.value }))}
              className="px-2 py-1.5 text-sm rounded border outline-none"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
              <option value="135">135</option>
              <option value="120">120</option>
              <option value="4x5">4x5</option>
            </select>
            <input type="number" placeholder="ISO" value={form.iso}
              onChange={e => setForm(f => ({ ...f, iso: +e.target.value }))}
              className="px-3 py-1.5 text-sm rounded border outline-none"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }} />
            <input type="number" placeholder="张数" value={form.frameCount}
              onChange={e => setForm(f => ({ ...f, frameCount: +e.target.value }))}
              className="px-3 py-1.5 text-sm rounded border outline-none"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }} />
            <div className="flex gap-2">
              <button onClick={handleCreate} className="flex-1 px-3 py-1.5 text-xs rounded"
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
        ) : rolls.length === 0 ? (
          <div className="flex items-center justify-center h-64" style={{ color: 'var(--muted-foreground)' }}>{t('common.noData', language)}</div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {rolls.map(roll => (
              <div key={roll.id} className="rounded-lg border p-4"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-medium">{roll.name}</h3>
                    <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {roll.brand} · {roll.format} · ISO {roll.iso} · {roll.frameCount} frames
                    </p>
                  </div>
                  <button onClick={() => handleDelete(roll.id)}
                    className="p-1 rounded hover:opacity-80" style={{ color: 'var(--destructive)' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  {roll.photoCount} photos
                  {roll.shootDate && ` · ${new Date(roll.shootDate).toLocaleDateString()}`}
                </p>
                {roll.notes && (
                  <p className="text-xs mt-1 truncate" style={{ color: 'var(--muted-foreground)' }}>{roll.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
