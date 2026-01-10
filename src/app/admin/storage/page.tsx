'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { scanStorage, cleanupStorage, fixMissingPhotos, generateThumbnail, StorageFile, StorageScanStats } from '@/lib/api'
import { MissingFileUploadModal } from '@/components/admin/MissingFileUploadModal'
import { Toast, Notification } from '@/components/Toast'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminInput, AdminSelect } from '@/components/admin/AdminFormControls'

function formatSize(bytes: number): string {
  if (bytes === 0) return '-'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.avif']

function isImageFile(key: string): boolean {
  const lower = key.toLowerCase()
  return IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext))
}

interface GroupedFiles {
  [folder: string]: StorageFile[]
}

function groupFilesByFolder(files: StorageFile[]): GroupedFiles {
  const grouped: GroupedFiles = {}
  for (const file of files) {
    const lastSlash = file.key.lastIndexOf('/')
    const folder = lastSlash >= 0 ? file.key.substring(0, lastSlash) : '/'
    if (!grouped[folder]) grouped[folder] = []
    grouped[folder].push(file)
  }
  return grouped
}

export default function StorageCleanupPage() {
  const { token } = useAuth()
  const { t } = useLanguage()
  const [provider, setProvider] = useState('local')
  const [files, setFiles] = useState<StorageFile[]>([])
  const [stats, setStats] = useState<StorageScanStats>({ total: 0, linked: 0, orphan: 0, missing: 0, missingOriginal: 0, missingThumbnail: 0 })
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
  const [reuploadFile, setReuploadFile] = useState<StorageFile | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [colWidths, setColWidths] = useState<Record<string, number | null>>({ key: null, title: null, date: null, size: null, thumb: null, status: null })
  const [generatingThumb, setGeneratingThumb] = useState<Set<string>>(new Set())
  const resizingCol = useRef<string | null>(null)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const handleMouseDown = (col: string, e: React.MouseEvent) => {
    e.preventDefault()
    resizingCol.current = col
    startX.current = e.clientX
    const el = (e.target as HTMLElement).parentElement
    startWidth.current = el?.offsetWidth || 100
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!resizingCol.current) return
    const diff = e.clientX - startX.current
    const newWidth = Math.max(60, startWidth.current + diff)
    setColWidths(prev => ({ ...prev, [resizingCol.current!]: newWidth }))
  }

  const handleMouseUp = () => {
    resizingCol.current = null
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  const notify = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = crypto.randomUUID()
    setNotifications(prev => [...prev, { id, message, type }])
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000)
  }

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const groupedFiles = groupFilesByFolder(files)
  const sortedFolders = Object.keys(groupedFiles).sort()

  const toggleFolder = (folder: string) => {
    const newCollapsed = new Set(collapsedFolders)
    if (newCollapsed.has(folder)) {
      newCollapsed.delete(folder)
    } else {
      newCollapsed.add(folder)
    }
    setCollapsedFolders(newCollapsed)
  }

  const loadFiles = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const result = await scanStorage(token, {
        provider,
        status: statusFilter || undefined,
        search: search || undefined,
      })
      setFiles(result.files)
      setStats(result.stats)
    } finally {
      setLoading(false)
    }
  }, [token, provider, statusFilter, search])

  useEffect(() => {
    loadFiles()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, statusFilter, search, token])

  const handleSearch = () => {
    setSearch(searchInput)
  }

  const handleCleanup = async () => {
    if (!token || selected.size === 0) return
    
    const orphanKeys = files
      .filter(f => selected.has(f.key) && f.status === 'orphan')
      .map(f => f.key)
    
    const missingIds = files
      .filter(f => selected.has(f.key) && f.status === 'missing' && f.photoId)
      .map(f => f.photoId!)
    
    if (orphanKeys.length > 0) {
      await cleanupStorage(token, orphanKeys, provider)
    }
    
    if (missingIds.length > 0) {
      await fixMissingPhotos(token, missingIds)
    }
    
    setSelected(new Set())
    loadFiles()
  }

  const toggleSelect = (key: string) => {
    const newSelected = new Set(selected)
    if (newSelected.has(key)) {
      newSelected.delete(key)
    } else {
      newSelected.add(key)
    }
    setSelected(newSelected)
  }

  const selectAll = () => {
    const actionable = files.filter(f => f.status !== 'linked')
    setSelected(new Set(actionable.map(f => f.key)))
  }

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'linked': return 'text-green-600 dark:text-green-400'
      case 'orphan': return 'text-yellow-600 dark:text-yellow-400'
      case 'missing': return 'text-red-600 dark:text-red-400'
      case 'missing_original': return 'text-red-600 dark:text-red-400'
      case 'missing_thumbnail': return 'text-orange-600 dark:text-orange-400'
      default: return ''
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'linked': return `✓ ${t('admin.storage_linked')}`
      case 'orphan': return `⚠ ${t('admin.storage_orphan')}`
      case 'missing': return `✗ ${t('admin.storage_missing')}`
      case 'missing_original': return `✗ ${t('admin.storage_missing_original')}`
      case 'missing_thumbnail': return `⚠ ${t('admin.storage_missing_thumb')}`
      default: return status
    }
  }

  const isMissingStatus = (status: string) =>
    status === 'missing' || status === 'missing_original' || status === 'missing_thumbnail'

  return (
    <div className="max-w-[1920px]">
      <div className="pb-6 border-b border-border mb-8">
        <h1 className="font-serif text-3xl">{t('admin.storage_cleanup')}</h1>
      </div>
      
      <div className="mb-8 p-6 border border-border bg-muted/20 space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">{t('admin.storage_help_title')}</div>
        <div className="text-xs font-mono text-primary">✓ {t('admin.storage_help_linked')}</div>
        <div className="text-xs font-mono text-amber-500">⚠ {t('admin.storage_help_orphan')}</div>
        <div className="text-xs font-mono text-destructive">✗ {t('admin.storage_help_missing')}</div>
      </div>
      
      <div className="flex flex-wrap gap-4 mb-8 items-end">
        <div className="space-y-2">
          <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Provider</label>
          <AdminSelect
            value={provider}
            onChange={setProvider}
            options={[
              { value: 'local', label: t('admin.storage_provider_local') },
              { value: 'r2', label: t('admin.storage_provider_r2') },
              { value: 'github', label: t('admin.storage_provider_github') },
            ]}
            className="min-w-[160px]"
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Status</label>
          <AdminSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: '', label: t('admin.all_status') },
              { value: 'linked', label: t('admin.storage_linked') },
              { value: 'orphan', label: t('admin.storage_orphan') },
              { value: 'missing', label: t('admin.storage_missing') },
            ]}
            className="min-w-[160px]"
          />
        </div>
        
        <div className="flex gap-2 flex-1 min-w-[200px]">
          <AdminInput
            variant="config"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder={t('common.search')}
            className="flex-1"
          />
          <AdminButton
            onClick={handleSearch}
            adminVariant="outline"
            size="none"
            className="px-4 py-2"
          >
            {t('common.search').replace('...', '')}
          </AdminButton>
        </div>
        
        <AdminButton
          onClick={() => loadFiles()}
          disabled={loading}
          adminVariant="primary"
          size="none"
          className="px-6 py-2"
        >
          {loading ? t('admin.storage_scanning') : t('admin.storage_scan')}
        </AdminButton>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <div className="p-4 border border-border bg-muted/30">
          <div className="text-2xl font-bold font-mono">{stats.total}</div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mt-1">{t('admin.storage_total')}</div>
        </div>
        <div className="p-4 border border-primary/30 bg-primary/5">
          <div className="text-2xl font-bold font-mono text-primary">{stats.linked}</div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mt-1">{t('admin.storage_linked')}</div>
        </div>
        <div className="p-4 border border-amber-500/30 bg-amber-500/5">
          <div className="text-2xl font-bold font-mono text-amber-500">{stats.orphan}</div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mt-1">{t('admin.storage_orphan')}</div>
        </div>
        <div className="p-4 border border-destructive/30 bg-destructive/5">
          <div className="text-2xl font-bold font-mono text-destructive">{stats.missing}</div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mt-1">{t('admin.storage_missing')}</div>
        </div>
        <div className="p-4 border border-destructive/20 bg-destructive/5">
          <div className="text-2xl font-bold font-mono text-destructive/80">{stats.missingOriginal}</div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mt-1">{t('admin.storage_missing_original')}</div>
        </div>
        <div className="p-4 border border-orange-500/30 bg-orange-500/5">
          <div className="text-2xl font-bold font-mono text-orange-500">{stats.missingThumbnail}</div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mt-1">{t('admin.storage_missing_thumb')}</div>
        </div>
      </div>
      
      {selected.size > 0 && (
        <div className="flex gap-4 mb-6 p-4 border border-primary/30 bg-primary/5 items-center">
          <span className="text-xs font-bold uppercase tracking-widest">{t('admin.selected')} {selected.size}</span>
          <AdminButton
            onClick={handleCleanup}
            adminVariant="destructive"
            size="none"
            className="px-4 py-2"
          >
            {t('admin.storage_cleanup_selected')}
          </AdminButton>
          <AdminButton
            onClick={() => setSelected(new Set())}
            adminVariant="outline"
            size="none"
            className="px-4 py-2"
          >
            {t('common.cancel')}
          </AdminButton>
        </div>
      )}
      
      <div className="border border-border overflow-hidden">
        <div className="flex items-center p-3 bg-muted/30 border-b border-border text-[10px] font-bold uppercase tracking-widest text-muted-foreground select-none">
          <input
            type="checkbox"
            className="mr-4"
            onChange={e => e.target.checked ? selectAll() : setSelected(new Set())}
            checked={selected.size > 0 && selected.size === files.filter(f => f.status !== 'linked').length}
          />
          <span className="flex-1 min-w-[100px] relative border-r border-border px-2" style={colWidths.key ? { width: colWidths.key, flex: 'none' } : undefined}>
            {t('admin.storage_file_key')}
            <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary/50" onMouseDown={e => handleMouseDown('key', e)} />
          </span>
          <span className="flex-1 min-w-[100px] hidden md:block relative border-r border-border px-2" style={colWidths.title ? { width: colWidths.title, flex: 'none' } : undefined}>
            {t('admin.photo_title')}
            <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary/50" onMouseDown={e => handleMouseDown('title', e)} />
          </span>
          <span className="w-28 hidden lg:block text-right relative border-r border-border px-2" style={colWidths.date ? { width: colWidths.date } : undefined}>
            {t('admin.storage_last_modified')}
            <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary/50" onMouseDown={e => handleMouseDown('date', e)} />
          </span>
          <span className="w-20 text-right relative border-r border-border px-2" style={colWidths.size ? { width: colWidths.size } : undefined}>
            {t('admin.storage_file_size')}
            <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary/50" onMouseDown={e => handleMouseDown('size', e)} />
          </span>
          <span className="w-20 text-center relative border-r border-border px-2" style={colWidths.thumb ? { width: colWidths.thumb } : undefined}>
            {t('admin.storage_thumb')}
            <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary/50" onMouseDown={e => handleMouseDown('thumb', e)} />
          </span>
          <span className="w-32 text-right px-2" style={colWidths.status ? { width: colWidths.status } : undefined}>{t('admin.storage_file_status')}</span>
        </div>
        
        {files.length === 0 && !loading && (
          <div className="p-12 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{t('admin.storage_no_files')}</p>
          </div>
        )}
        
        {sortedFolders.map(folder => (
          <div key={folder}>
            <div
              className="flex items-center p-3 bg-muted/50 cursor-pointer hover:bg-muted transition-colors border-b border-border"
              onClick={() => toggleFolder(folder)}
            >
              <span className="mr-3 text-muted-foreground text-xs">{collapsedFolders.has(folder) ? '▶' : '▼'}</span>
              <span className="font-mono text-xs font-bold">{folder || '/'}</span>
              <span className="ml-2 text-[10px] text-muted-foreground font-mono">({groupedFiles[folder].length})</span>
            </div>
            {!collapsedFolders.has(folder) && groupedFiles[folder].map(file => (
              <div key={file.key} className="flex items-center p-3 pl-8 border-b border-border hover:bg-muted/30 transition-colors">
                <input
                  type="checkbox"
                  className="mr-4"
                  checked={selected.has(file.key)}
                  onChange={() => toggleSelect(file.key)}
                  disabled={file.status === 'linked'}
                />
                <div className="flex-1 min-w-[100px] border-r border-border/30 px-2" style={colWidths.key ? { width: colWidths.key, flex: 'none' } : undefined}>
                  <div
                    className={`font-mono text-sm truncate ${
                      isMissingStatus(file.status)
                        ? 'cursor-pointer hover:text-red-500 hover:underline'
                        : isImageFile(file.key)
                          ? 'cursor-pointer hover:text-blue-600 hover:underline'
                          : ''
                    }`}
                    onClick={() => {
                      if (isMissingStatus(file.status)) {
                        setReuploadFile(file)
                      } else if (isImageFile(file.key)) {
                        setPreviewUrl(file.url)
                      }
                    }}
                    title={file.key}
                  >
                    {file.key.split('/').pop()}
                  </div>
                </div>
                <span className="flex-1 min-w-[100px] hidden md:block text-xs text-zinc-500 truncate border-r border-border/30 px-2" style={colWidths.title ? { width: colWidths.title, flex: 'none' } : undefined} title={file.photoTitle}>
                  {file.photoTitle || '-'}
                </span>
                <span className="w-28 hidden lg:block text-right text-xs text-zinc-500 border-r border-border/30 px-2" style={colWidths.date ? { width: colWidths.date } : undefined}>
                  {file.lastModified ? new Date(file.lastModified).toLocaleDateString() : '-'}
                </span>
                <span className="w-20 text-right text-sm border-r border-border/30 px-2" style={colWidths.size ? { width: colWidths.size } : undefined}>{formatSize(file.size)}</span>
                <span className="w-20 text-center text-sm border-r border-border/30 px-2" style={colWidths.thumb ? { width: colWidths.thumb } : undefined}>
                  {file.status === 'linked' ? (
                    file.hasThumb ? (
                      <span className="text-green-600 dark:text-green-400">✓</span>
                    ) : generatingThumb.has(file.photoId || '') ? (
                      <span className="text-zinc-400 animate-pulse">...</span>
                    ) : (
                      <AdminButton
                        onClick={async () => {
                          if (!token || !file.photoId) return
                          setGeneratingThumb(prev => new Set(prev).add(file.photoId!))
                          try {
                            await generateThumbnail(token, file.photoId)
                            notify(t('admin.notify_success'), 'success')
                            loadFiles()
                          } catch {
                            notify(t('common.error'), 'error')
                          } finally {
                            setGeneratingThumb(prev => { const n = new Set(prev); n.delete(file.photoId!); return n })
                          }
                        }}
                        adminVariant="link"
                        size="xs"
                        className="text-xs text-primary hover:underline normal-case"
                      >
                        {t('admin.storage_generate')}
                      </AdminButton>
                    )
                  ) : '-'}
                </span>
                <span
                  className={`w-32 text-right text-sm px-2 ${getStatusStyle(file.status)} ${isMissingStatus(file.status) ? 'cursor-pointer hover:underline' : ''}`}
                  style={colWidths.status ? { width: colWidths.status } : undefined}
                  onClick={() => isMissingStatus(file.status) && setReuploadFile(file)}
                >
                  {getStatusLabel(file.status)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-8"
          onClick={() => setPreviewUrl(null)}
        >
          <img
            src={previewUrl}
            alt={t('admin.preview')}
            className="max-w-full max-h-full object-contain"
            onClick={e => e.stopPropagation()}
          />
          <AdminButton
            onClick={() => setPreviewUrl(null)}
            adminVariant="unstyled"
            size="none"
            className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center text-white/70 hover:text-white border border-white/20 hover:border-white/50 transition-all"
          >
            ✕
          </AdminButton>
        </div>
      )}

      <MissingFileUploadModal
        isOpen={!!reuploadFile}
        fileInfo={reuploadFile ? {
          photoId: reuploadFile.photoId || '',
          photoTitle: reuploadFile.photoTitle || '',
          storageKey: reuploadFile.key,
          storageProvider: provider,
          missingType: reuploadFile.missingType,
        } : null}
        token={token}
        onClose={() => setReuploadFile(null)}
        onSuccess={() => loadFiles()}
        t={t}
        notify={notify}
      />

      <Toast notifications={notifications} remove={removeNotification} />
    </div>
  )
}