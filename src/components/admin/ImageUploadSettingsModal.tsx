'use client'

import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, MapPinOff, Minimize2, Settings, Upload, X } from 'lucide-react'
import { getAdminAlbums, type AdminSettingsDto, type AlbumDto } from '@/lib/api'
import type { CompressionMode } from '@/lib/image-compress'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminInput, AdminMultiSelect, AdminSelect, type MultiSelectOption, type SelectOption } from '@/components/admin/AdminFormControls'

export interface UploadSettings {
  maxSizeMB?: number
  storageProvider?: string
  storagePath?: string
  storagePathFull?: boolean
  compressionMode?: CompressionMode
  stripGps?: boolean
  categories?: string[]
  albumIds?: string[]
  category?: string
  albumId?: string
}

interface ImageUploadSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (settings: UploadSettings) => void
  pendingCount: number
  t: (key: string) => string
  token: string | null
  initialSettings?: UploadSettings
  confirmLabel?: string
  settings?: AdminSettingsDto | null
  categories?: string[]
}

function getInitialCategories(initialSettings?: UploadSettings) {
  if (initialSettings?.categories?.length) return initialSettings.categories
  if (initialSettings?.category?.trim()) return [initialSettings.category.trim()]
  return []
}

function getInitialAlbumIds(initialSettings?: UploadSettings) {
  if (initialSettings?.albumIds?.length) return initialSettings.albumIds
  if (initialSettings?.albumId) return [initialSettings.albumId]
  return []
}

export function ImageUploadSettingsModal({
  isOpen,
  onClose,
  onConfirm,
  pendingCount,
  t,
  token,
  initialSettings,
  confirmLabel,
  settings,
  categories = [],
}: ImageUploadSettingsModalProps) {
  const [maxSizeMB, setMaxSizeMB] = useState('2')
  const [storageProvider, setStorageProvider] = useState('local')
  const [storagePath, setStoragePath] = useState('')
  const [useCustomPrefix, setUseCustomPrefix] = useState(false)
  const [compressionMode, setCompressionMode] = useState<CompressionMode>('size')
  const [stripGps, setStripGps] = useState(false)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [albumIds, setAlbumIds] = useState<string[]>([])
  const [albums, setAlbums] = useState<AlbumDto[]>([])
  const [loadingAlbums, setLoadingAlbums] = useState(false)

  const configPrefix = useMemo(() => {
    if (storageProvider === 'r2') return settings?.r2_path || ''
    if (storageProvider === 'github') return settings?.github_path || ''
    return ''
  }, [settings?.github_path, settings?.r2_path, storageProvider])

  const categoryOptions = useMemo<MultiSelectOption[]>(() => {
    return categories
      .filter((category) => category !== 'all' && category !== '全部')
      .map((category) => ({ value: category, label: category }))
  }, [categories])

  const albumOptions = useMemo<MultiSelectOption[]>(() => {
    return albums.map((album) => ({
      value: album.id,
      label: album.name,
      suffix: !album.isPublished ? `(${t('admin.draft')})` : undefined,
    }))
  }, [albums, t])

  const providerOptions = useMemo<SelectOption[]>(() => [
    { value: 'local', label: t('admin.storage_provider_local') },
    { value: 'r2', label: t('admin.storage_provider_r2') },
    { value: 'github', label: t('admin.storage_provider_github') },
  ], [t])

  const prefixOptions = useMemo<SelectOption[]>(() => {
    if (!configPrefix) return []
    return [
      { value: 'config', label: `${configPrefix}/` },
      { value: 'custom', label: '/' },
    ]
  }, [configPrefix])

  useEffect(() => {
    if (!isOpen || !token) return

    const authToken = token

    let cancelled = false

    async function loadAlbums() {
      try {
        setLoadingAlbums(true)
        const data = await getAdminAlbums(authToken)
        if (!cancelled) setAlbums(data)
      } catch (error) {
        console.error('Failed to load albums:', error)
      } finally {
        if (!cancelled) setLoadingAlbums(false)
      }
    }

    void loadAlbums()

    return () => {
      cancelled = true
    }
  }, [isOpen, token])

  useEffect(() => {
    if (!isOpen) {
      setMaxSizeMB('2')
      setStorageProvider(settings?.storage_provider || 'local')
      setStoragePath('')
      setUseCustomPrefix(false)
      setCompressionMode('size')
      setStripGps(false)
      setSelectedCategories([])
      setAlbumIds([])
      return
    }

    const nextStorageProvider = initialSettings?.storageProvider || settings?.storage_provider || 'local'
    const nextCompressionMode = initialSettings?.compressionMode || 'size'
    const nextUseCustomPrefix = Boolean(initialSettings?.storagePathFull)

    setMaxSizeMB(initialSettings?.maxSizeMB ? String(initialSettings.maxSizeMB) : '2')
    setStorageProvider(nextStorageProvider)
    setStoragePath(initialSettings?.storagePath || '')
    setUseCustomPrefix(nextUseCustomPrefix)
    setCompressionMode(nextCompressionMode)
    setStripGps(Boolean(initialSettings?.stripGps))
    setSelectedCategories(getInitialCategories(initialSettings))
    setAlbumIds(getInitialAlbumIds(initialSettings))
  }, [initialSettings, isOpen, settings?.storage_provider])

  useEffect(() => {
    if (!isOpen) return
    if (storageProvider === 'local') {
      setUseCustomPrefix(false)
    }
  }, [isOpen, storageProvider])

  function handleConfirm() {
    const settingsToSave: UploadSettings = {
      compressionMode,
      stripGps,
      categories: selectedCategories,
      albumIds,
    }

    if (compressionMode !== 'none' && maxSizeMB && parseFloat(maxSizeMB) > 0) {
      settingsToSave.maxSizeMB = parseFloat(maxSizeMB)
    }

    if (storageProvider) {
      settingsToSave.storageProvider = storageProvider
    }

    const trimmedPath = storagePath.trim()
    if (trimmedPath) {
      settingsToSave.storagePath = trimmedPath
      settingsToSave.storagePathFull = useCustomPrefix
    }

    onConfirm(settingsToSave)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-3">
            <Settings className="h-5 w-5 text-primary" />
            <h3 className="font-bold">{t('admin.upload_settings')}</h3>
            <span className="border border-border/70 bg-background/80 px-2 py-0.5 text-xs text-muted-foreground">
              {pendingCount} {t('admin.pending_files')}
            </span>
          </div>
          <AdminButton onClick={onClose} adminVariant="icon" className="rounded-md p-2 hover:bg-muted">
            <X className="h-4 w-4" />
          </AdminButton>
        </div>

        <div className="space-y-5 p-6">
          <p className="text-sm text-muted-foreground">{t('admin.upload_settings_hint')}</p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t('admin.categories')}
              </label>
              <AdminMultiSelect
                values={selectedCategories}
                options={categoryOptions}
                onChange={setSelectedCategories}
                placeholder={t('admin.search_create')}
                inputPlaceholder={t('admin.search_create')}
                allowCreate
              />
            </div>

            <div>
              <label className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <FolderOpen className="h-3.5 w-3.5" />
                {t('admin.album_select')}
              </label>
              <AdminMultiSelect
                values={albumIds}
                options={albumOptions}
                onChange={setAlbumIds}
                placeholder={t('admin.search_album')}
                inputPlaceholder={t('admin.search_album')}
                disabled={loadingAlbums}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t('admin.storage_provider')}
              </label>
              <AdminSelect value={storageProvider} options={providerOptions} onChange={setStorageProvider} />
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t('admin.path_prefix')}
              </label>
              <div className="flex items-stretch">
                {prefixOptions.length > 0 ? (
                  <AdminSelect
                    value={useCustomPrefix ? 'custom' : 'config'}
                    options={prefixOptions}
                    onChange={(value) => {
                      setUseCustomPrefix(value === 'custom')
                      setStoragePath('')
                    }}
                    className="w-28 shrink-0"
                  />
                ) : (
                  <div className="flex items-center border border-r-0 border-border bg-muted/50 px-3 text-[10px] text-muted-foreground">
                    /
                  </div>
                )}
                <AdminInput
                  value={storagePath}
                  onChange={(event) => setStoragePath(event.target.value)}
                  placeholder="path"
                  className="min-w-0 flex-1 rounded-l-none border-l-0"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 border-t border-border/50 pt-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <MapPinOff className="h-3.5 w-3.5" />
                  {t('admin.strip_gps')}
                </label>
                <p className="mt-1 text-xs text-muted-foreground/80">{t('admin.strip_gps_desc')}</p>
              </div>
              <button
                type="button"
                onClick={() => setStripGps((prev) => !prev)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${stripGps ? 'bg-primary' : 'bg-muted'}`}
              >
                <span
                  className={`pointer-events-none block size-4 rounded-full bg-background shadow-lg transition-transform ${stripGps ? 'translate-x-4' : 'translate-x-0.5'}`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Minimize2 className="h-3.5 w-3.5" />
                {t('admin.image_compression')}
              </label>
              <AdminSelect
                value={compressionMode}
                onChange={(value) => setCompressionMode(value as CompressionMode)}
                className="w-32"
                options={[
                  { value: 'none', label: t('admin.compression_none') },
                  { value: 'quality', label: t('admin.compression_quality') },
                  { value: 'size', label: t('admin.compression_size') },
                ]}
              />
            </div>

            {compressionMode !== 'none' ? (
              <div className="flex items-center justify-end gap-2">
                <span className="text-xs text-muted-foreground">{t('admin.max_size_mb')}</span>
                <AdminInput
                  type="number"
                  min="0.5"
                  max="20"
                  step="0.5"
                  value={maxSizeMB}
                  onChange={(event) => setMaxSizeMB(event.target.value)}
                  className="w-20 text-center text-xs"
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border p-4">
          <AdminButton onClick={onClose} adminVariant="link" className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
            {t('common.cancel')}
          </AdminButton>
          <AdminButton onClick={handleConfirm} adminVariant="primary" size="md" className="flex items-center gap-2 rounded-md text-sm">
            <Upload className="h-4 w-4" />
            {confirmLabel || t('admin.start_upload')}
          </AdminButton>
        </div>
      </div>
    </div>
  )
}
