import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, FolderOpen, Loader2, Search, X } from 'lucide-react'
import { SaveMessageImageToLocalLibrary } from '../../../../wailsjs/go/main/App'
import { localLibraryApi, parseLocalLibraryError } from '@/features/local-library/api'
import type { FolderItem } from '@/features/local-library/types'

function LocalLibraryFolderTree({ folders, value, onChange, disabled, rootLabel, t }: { folders: FolderItem[]; value: string; onChange: (path: string) => void; disabled: boolean; rootLabel: string; t: (key: string) => string }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const sorted = folders.toSorted((a, b) => a.relativePath.localeCompare(b.relativePath))
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const matchesQuery = (folder: FolderItem) => !normalizedQuery || `${folder.name} ${folder.relativePath}`.toLocaleLowerCase().includes(normalizedQuery)
  const matchesOrContainsMatch = (folder: FolderItem) => matchesQuery(folder) || sorted.some((candidate) => candidate.relativePath.startsWith(`${folder.relativePath}/`) && matchesQuery(candidate))
  const hasChildren = (path: string) => sorted.some((folder) => folder.relativePath.startsWith(`${path}/`))
  const isVisible = (path: string) => {
    if (normalizedQuery) return matchesOrContainsMatch(sorted.find((folder) => folder.relativePath === path)!)
    const parts = path.split('/')
    for (let index = 1; index < parts.length; index += 1) {
      if (!expanded.has(parts.slice(0, index).join('/'))) return false
    }
    return true
  }
  const toggle = (path: string) => setExpanded((current) => {
    const next = new Set(current)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    return next
  })
  return <>
    <div className="relative mt-2"><Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} disabled={disabled} placeholder={t('admin.ai_search_folder_path')} className="h-8 w-full rounded-md border bg-input pl-8 pr-2 text-xs outline-none focus:ring-1 focus:ring-primary" style={{ borderColor: 'var(--border)' }} /></div>
    <div className="mt-2 min-h-40 max-h-80 overflow-y-auto rounded-md border p-1" style={{ borderColor: 'var(--border)' }}>
    <button type="button" disabled={disabled} onClick={() => onChange('')} className={`flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-accent ${value === '' ? 'bg-accent font-medium' : ''}`}><FolderOpen size={13} className="mr-2 shrink-0" /><span className="truncate">{rootLabel}</span></button>
    {sorted.filter((folder) => isVisible(folder.relativePath)).map((folder) => {
      const depth = folder.relativePath.split('/').length - 1
      const children = hasChildren(folder.relativePath)
      return <div key={folder.id} className="flex items-center" style={{ paddingLeft: `${depth * 16}px` }}><button type="button" disabled={disabled || !children} aria-label={children ? (expanded.has(folder.relativePath) ? t('admin.ai_collapse_folder') : t('admin.ai_expand_folder')) : undefined} onClick={() => toggle(folder.relativePath)} className="flex h-7 w-6 shrink-0 items-center justify-center rounded hover:bg-accent disabled:opacity-40">{children && <ChevronDown size={13} className={`transition-transform ${expanded.has(folder.relativePath) ? '' : '-rotate-90'}`} />}</button><button type="button" disabled={disabled} onClick={() => onChange(folder.relativePath)} className={`min-w-0 flex-1 rounded px-2 py-1.5 text-left text-xs hover:bg-accent ${value === folder.relativePath ? 'bg-accent font-medium' : ''}`}><span className="truncate">{folder.name || folder.relativePath}</span></button></div>
    })}
    {normalizedQuery && sorted.every((folder) => !matchesQuery(folder)) && <div className="px-2 py-2 text-xs text-muted-foreground">{t('admin.ai_no_matching_folders')}</div>}
  </div></>
}

export function LocalLibrarySaveDialog({ imageUrl, t, onClose, onSaved, onSave }: { imageUrl: string; t: (key: string) => string; onClose: () => void; onSaved: () => void; onSave?: (destination: string) => Promise<void | boolean> }) {
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [destination, setDestination] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    void localLibraryApi.listFolders().then((items) => { if (!cancelled) setFolders(items) }).catch((cause) => { if (!cancelled) setError(parseLocalLibraryError(cause).message) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])
  const submit = async () => {
    if (saving || loading || error) return
    setSaving(true); setError('')
    try {
      if (onSave) {
        // Returning false means the caller took over (e.g. a conflict dialog
        // is shown) — skip the success toast and close callbacks.
        const handled = await onSave(destination)
        if (handled === false) return
      } else {
        const results = await SaveMessageImageToLocalLibrary(imageUrl, destination)
        const failed = results.filter((result) => result.status === 'failed')
        if (failed.length > 0) throw new Error(failed[0]?.error || t('admin.ai_save_to_library_failed'))
      }
      toast.success(t('admin.ai_saved_to_library')); onSaved(); onClose()
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('admin.ai_save_to_library_failed')) } finally { setSaving(false) }
  }
  return <div className="fixed inset-0 z-[70] flex items-center justify-center p-5"><button type="button" aria-label={t('admin.cancel')} onClick={onClose} className="absolute inset-0 bg-black/60" /><div role="dialog" aria-modal="true" className="relative w-full max-w-md rounded-lg border bg-popover p-5 shadow-2xl" style={{ borderColor: 'var(--border)' }}><button type="button" aria-label={t('admin.cancel')} onClick={onClose} disabled={saving} className="absolute right-3 top-3 rounded p-2 hover:bg-secondary disabled:opacity-50"><X size={16} /></button><h2 className="pr-8 text-sm font-semibold">{t('admin.ai_save_to_library')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('admin.ai_save_to_library_hint')}</p>{loading ? <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" />{t('admin.loading')}</div> : error && !folders.length ? <p className="mt-5 rounded-md border border-destructive/40 p-3 text-xs text-destructive">{error}</p> : <><label className="mt-5 block text-xs font-medium">{t('admin.ai_save_location')}</label><LocalLibraryFolderTree folders={folders} value={destination} onChange={setDestination} disabled={saving} rootLabel={t('admin.ai_library_root')} t={t} />{error && <p className="mt-3 text-xs text-destructive">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={saving} className="rounded-md border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50">{t('admin.cancel')}</button><button type="button" onClick={() => void submit()} disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-50">{saving && <Loader2 size={13} className="animate-spin" />}{t('admin.ai_save_to_library')}</button></div></>}</div></div>
}
