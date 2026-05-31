'use client'

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import {
  BookOpen,
  FolderOpen,
  MapPinOff,
  Minimize2,
  Settings2,
  Upload,
  Loader2,
  ChevronDown,
  Check,
} from 'lucide-react'
import type { StorageSourceDto, StoryDto, AlbumDto } from '@/lib/api/types'
import { getAdminStories } from '@/lib/api/stories'
import { getAdminAlbums } from '@/lib/api/albums'
import { getStorageSources } from '@/lib/api/storage-sources'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminInput, AdminMultiSelect, AdminSelect } from '@/components/admin/AdminFormControls'
import { StorySelectorModal } from '@/components/admin/StorySelectorModal'

export interface DigitalPhotoUploadSettings {
  title: string
  categories: string[]
  storyId?: string
  albumIds?: string[]
  storageSourceId?: string
  storagePath?: string
  storagePathFull?: boolean
  compressionEnabled: boolean
  maxSizeMB: number
  privacyStripEnabled: boolean
}

interface DigitalPhotoUploadParamsProps {
  token: string | null
  categories: string[]
  t: (key: string) => string
  fileCount: number
  totalOriginalSize: number
  estimatedTotalSize: number
  savingsPercent: number
  compressionSuggestion?: { type: 'suggest_enable' | 'suggest_disable' | 'info'; text: string } | null
  onSettingsChange: (settings: DigitalPhotoUploadSettings) => void
  onUploadClick: () => void
  uploading?: boolean
  uploadError?: string
}

// Inline Prefix Dropdown
function PrefixDropdown({
  value,
  options,
  onChange,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((opt) => opt.value === value)
  const displayLabel = selectedOption?.label || value

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isOpen && containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside, true)
    return () => document.removeEventListener('click', handleClickOutside, true)
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative self-stretch">
      <div
        className="h-full px-3 bg-muted/50 border border-r-0 border-border text-[10px] text-muted-foreground font-mono flex items-center gap-0.5 cursor-pointer hover:bg-muted/80 transition-colors select-none"
        onClick={() => setIsOpen(!isOpen)}
        title={displayLabel}
      >
        <span className="truncate max-w-[80px]">{displayLabel}</span>
        <ChevronDown className={`w-2.5 h-2.5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      {isOpen && (
        <div className="absolute z-20 left-0 top-full mt-0.5 min-w-full bg-background border border-border shadow-2xl">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value)
                setIsOpen(false)
              }}
              className={`w-full text-left px-3 py-2 text-[10px] font-mono hover:bg-primary hover:text-primary-foreground flex items-center justify-between gap-2 transition-colors whitespace-nowrap ${
                value === option.value ? 'bg-primary/10 text-primary' : ''
              }`}
            >
              <span>{option.label}</span>
              {value === option.value && <Check className="w-2.5 h-2.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function DigitalPhotoUploadParams({
  token,
  categories,
  t,
  fileCount,
  totalOriginalSize,
  estimatedTotalSize,
  savingsPercent,
  compressionSuggestion,
  onSettingsChange,
  onUploadClick,
  uploading = false,
  uploadError,
}: DigitalPhotoUploadParamsProps) {
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadCategories, setUploadCategories] = useState<string[]>([])

  const [uploadStoryId, setUploadStoryId] = useState('')
  const [uploadStoryTitle, setUploadStoryTitle] = useState('')
  const [stories, setStories] = useState<StoryDto[]>([])
  const [loadingStories, setLoadingStories] = useState(false)
  const [showStorySelector, setShowStorySelector] = useState(false)

  const [uploadAlbumIds, setUploadAlbumIds] = useState<string[]>([])
  const [albums, setAlbums] = useState<AlbumDto[]>([])
  const [loadingAlbums, setLoadingAlbums] = useState(false)

  const [uploadSourceId, setUploadSourceId] = useState<string>('')
  const [storageSources, setStorageSources] = useState<StorageSourceDto[]>([])
  const [useCustomPrefix, setUseCustomPrefix] = useState(false)
  const [uploadPath, setUploadPath] = useState('')
  const [isInitialized, setIsInitialized] = useState(false)

  const [compressionEnabled, setCompressionEnabled] = useState(false)
  const [maxSizeMB, setMaxSizeMB] = useState(2)
  const [sliderValue, setSliderValue] = useState(2)

  const [privacyStripEnabled, setPrivacyStripEnabled] = useState(false)

  // Debounce slider value to maxSizeMB
  useEffect(() => {
    const timer = setTimeout(() => {
      setMaxSizeMB(sliderValue)
    }, 150)
    return () => clearTimeout(timer)
  }, [sliderValue])

  useEffect(() => {
    if (!token || isInitialized) return
    getStorageSources(token).then(sources => {
      setStorageSources(sources)
      if (sources.length > 0) setUploadSourceId(sources[0].id)
      setIsInitialized(true)
    }).catch(() => setIsInitialized(true))
  }, [token, isInitialized])

  // Reset custom prefix when storage source changes
  useEffect(() => {
    if (!isInitialized) return
    setUseCustomPrefix(false)
    setUploadPath('')
  }, [uploadSourceId, isInitialized])

  const selectedSource = storageSources.find(s => s.id === uploadSourceId)
  const configPrefix = selectedSource?.basePath || undefined

  const loadStories = useCallback(async () => {
    if (!token || stories.length > 0) return
    setLoadingStories(true)
    try {
      const data = await getAdminStories(token)
      setStories(data)
    } finally {
      setLoadingStories(false)
    }
  }, [token, stories.length])

  useEffect(() => {
    if (showStorySelector) {
      loadStories()
    }
  }, [showStorySelector, loadStories])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    queueMicrotask(() => !cancelled && setLoadingAlbums(true))
    getAdminAlbums(token).then(data => !cancelled && setAlbums(data)).finally(() => !cancelled && setLoadingAlbums(false))
    return () => { cancelled = true }
  }, [token])

  const categoryOptions = useMemo(
    () =>
      categories
        .filter((c) => c !== 'all' && c !== '全部')
        .map((c) => ({ value: c, label: c })),
    [categories]
  )

  const albumOptions = useMemo(
    () =>
      albums.map((a) => ({
        value: a.id,
        label: a.name,
        suffix: !a.isPublished ? `(${t('admin.draft')})` : undefined,
      })),
    [albums, t]
  )

  // Notify parent of settings changes
  useEffect(() => {
    const fullStoragePath = useCustomPrefix
      ? (uploadPath.trim() || undefined)
      : (configPrefix
        ? (uploadPath.trim() ? `${configPrefix}/${uploadPath.trim()}` : configPrefix)
        : uploadPath.trim() || undefined)

    onSettingsChange({
      title: uploadTitle,
      categories: uploadCategories,
      storyId: uploadStoryId || undefined,
      albumIds: uploadAlbumIds.length ? uploadAlbumIds : undefined,
      storageSourceId: uploadSourceId || undefined,
      storagePath: fullStoragePath,
      storagePathFull: useCustomPrefix,
      compressionEnabled,
      maxSizeMB,
      privacyStripEnabled,
    })
  }, [
    uploadTitle,
    uploadCategories,
    uploadStoryId,
    uploadAlbumIds,
    uploadSourceId,
    uploadPath,
    useCustomPrefix,
    configPrefix,
    compressionEnabled,
    maxSizeMB,
    privacyStripEnabled,
    onSettingsChange,
  ])

  return (
    <>
      <div className="sticky top-6">
        <div className="flex items-center gap-3 mb-4">
          <Settings2 className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-xs font-medium tracking-wide uppercase text-muted-foreground">{t('admin.upload_params')}</h2>
        </div>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">{t('admin.photo_title')}</label>
            <AdminInput
              value={uploadTitle}
              onChange={e => setUploadTitle(e.target.value)}
              disabled={fileCount > 1}
              placeholder={fileCount > 1 ? t('admin.title_hint_multi') : t('admin.title_hint_single')}
            />
          </div>

          {/* Categories & Albums - 2 column grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">{t('admin.categories')}</label>
              <AdminMultiSelect
                values={uploadCategories}
                options={categoryOptions}
                onChange={setUploadCategories}
                placeholder={t('admin.search_create')}
                inputPlaceholder={t('admin.search_create')}
                allowCreate
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                <FolderOpen className="w-3 h-3" />
                {t('admin.album_select')}
              </label>
              <AdminMultiSelect
                values={uploadAlbumIds}
                options={albumOptions}
                onChange={setUploadAlbumIds}
                placeholder={t('admin.search_album')}
                inputPlaceholder={t('admin.search_album')}
                disabled={loadingAlbums}
              />
            </div>
          </div>

          {/* Story */}
          <div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
              <BookOpen className="w-3 h-3" />
              {t('ui.photo_story')}
            </label>
            <button
              type="button"
              onClick={() => setShowStorySelector(true)}
              disabled={loadingStories}
              className="w-full flex items-center justify-between px-3 py-2 bg-background border border-border text-sm text-left hover:border-primary/50 transition-colors disabled:opacity-50"
            >
              <span className={uploadStoryTitle ? 'text-foreground' : 'text-muted-foreground'}>
                {uploadStoryTitle || t('ui.no_association')}
              </span>
              <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>

          {/* Storage - compact layout */}
          <div className="pt-3 border-t border-border/50">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">{t('admin.storage_provider')}</label>
                <AdminSelect
                  value={uploadSourceId}
                  onChange={setUploadSourceId}
                  options={storageSources.map(s => ({ value: s.id, label: `${s.name} (${s.type})` }))}
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">{t('admin.path_prefix')}</label>
                <div className="flex items-stretch">
                  {configPrefix ? (
                    <PrefixDropdown
                      value={useCustomPrefix ? '/' : configPrefix}
                      options={[
                        { value: configPrefix, label: `${configPrefix}/` },
                        { value: '/', label: '/' },
                      ]}
                      onChange={(v) => {
                        setUseCustomPrefix(v === '/')
                        setUploadPath('')
                      }}
                    />
                  ) : (
                    <div className="self-stretch px-3 bg-muted/50 border border-r-0 border-border text-[10px] text-muted-foreground font-mono flex items-center">
                      <span>/</span>
                    </div>
                  )}
                  <AdminInput
                    value={uploadPath}
                    onChange={e => setUploadPath(e.target.value)}
                    placeholder="path"
                    className="flex-1 rounded-l-none border-l-0"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Privacy & Compression - inline toggles */}
          <div className="pt-3 border-t border-border/50 space-y-3">
            {/* Privacy Strip */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPinOff className="w-3 h-3" />
                {t('admin.strip_gps') || '移除地理位置'}
              </label>
              <button
                type="button"
                onClick={() => setPrivacyStripEnabled(!privacyStripEnabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                  privacyStripEnabled ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`pointer-events-none block size-4 rounded-full bg-background shadow-lg transition-transform ${
                    privacyStripEnabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Compression */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Minimize2 className="w-3 h-3" />
                {t('admin.image_compression')}
              </label>
              <button
                type="button"
                onClick={() => setCompressionEnabled(prev => !prev)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${compressionEnabled ? 'bg-primary' : 'bg-muted'}`}
              >
                <span
                  className={`pointer-events-none block size-4 rounded-full bg-background shadow-lg transition-transform ${
                    compressionEnabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
            {compressionSuggestion && (
              <p className={`text-[10px] leading-relaxed flex items-start gap-1.5 ${
                compressionSuggestion.type === 'suggest_enable' || compressionSuggestion.type === 'suggest_disable'
                  ? 'text-amber-600 dark:text-amber-500'
                  : 'text-muted-foreground/70'
              }`}>
                <span aria-hidden>💡</span>
                <span>{compressionSuggestion.text}</span>
              </p>
            )}
            {compressionEnabled && (
              <div className="space-y-2">
                <div>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <label className="text-[10px] text-muted-foreground">
                      {t('admin.compression_size_label')}
                    </label>
                    <span className="text-[10px] font-mono text-foreground tabular-nums">{sliderValue.toFixed(1)} MB</span>
                  </div>
                  <input
                    type="range"
                    min="0.3"
                    max="20"
                    step="0.1"
                    value={sliderValue}
                    onChange={e => setSliderValue(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:transition-transform [&::-moz-range-thumb]:hover:scale-110"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                  {t('admin.compression_hint')}
                </p>
              </div>
            )}
          </div>

          {/* Upload Button */}
          <AdminButton
            onClick={onUploadClick}
            disabled={uploading || fileCount === 0}
            adminVariant="primary"
            size="lg"
            className="w-full py-3 mt-2 bg-foreground text-background text-sm font-medium tracking-wide hover:bg-primary hover:text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('admin.uploading')}
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                {t('admin.start_upload')}
              </>
            )}
          </AdminButton>
          {uploadError && <p className="text-xs text-destructive text-center mt-1">{uploadError}</p>}
        </div>
      </div>

      <StorySelectorModal
        isOpen={showStorySelector}
        onClose={() => setShowStorySelector(false)}
        onSelect={(storyId, storyTitle) => {
          setUploadStoryId(storyId || '')
          setUploadStoryTitle(storyTitle || '')
        }}
        stories={stories}
        selectedStoryId={uploadStoryId}
        loading={loadingStories}
        t={t}
      />
    </>
  )
}
