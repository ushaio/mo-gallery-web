// 系统设置 · 本地资源库

import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { useCachedPageEffect } from '@/hooks/useCachedPageEffect'
import { formatBytes } from '@/lib/utils'
import { Skeleton } from '@/components/admin/Skeleton'
import {
  GetLocalLibraryCacheStats,
  GetLocalLibraryPreferences,
  SetLocalLibraryImportMode,
} from '../../../wailsjs/go/main/App'
import { local_library } from '../../../wailsjs/go/models'
import {
  Loader2,
  HardDrive,
  RefreshCw,
  Check,
  FolderInput,
  Copy,
  Database,
  Images,
  ChevronRight,
  Image as ImageIcon,
} from 'lucide-react'
import { getErrorMessage, btnOutline, Section, Field } from './shared'
// ─── 本地资源库 ──────────────────────────────────────

type LocalLibraryCacheInfo = {
  loading: boolean
  stats: local_library.LocalLibraryCacheStats | null
  error: string | null
}

export function useLocalLibraryCacheInfo() {
  const [cacheInfo, setCacheInfo] = useState<LocalLibraryCacheInfo>({ loading: true, stats: null, error: null })
  const requestIdRef = useRef(0)

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setCacheInfo(prev => ({ ...prev, loading: true, error: null }))
    try {
      const stats = await GetLocalLibraryCacheStats()
      if (requestId !== requestIdRef.current) return
      setCacheInfo({ loading: false, stats, error: null })
    } catch (error: unknown) {
      if (requestId !== requestIdRef.current) return
      setCacheInfo({
        loading: false,
        stats: null,
        error: error instanceof Error ? error.message : '本地资源库不可用',
      })
    }
  }, [])

  useCachedPageEffect(() => { void refresh() }, [refresh])
  return { ...cacheInfo, refresh }
}

export function LocalLibraryTab({ onManageCache }: { onManageCache: () => void }) {
  const [importMode, setImportMode] = useState<'copy' | 'move' | undefined>()
  const [preferencesLoading, setPreferencesLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const localCacheInfo = useLocalLibraryCacheInfo()

  useCachedPageEffect(() => {
    void GetLocalLibraryPreferences()
      .then((result) => setImportMode(result?.importMode === 'copy' || result?.importMode === 'move' ? result.importMode : undefined))
      .catch((error) => toast.error('读取本地资源库设置失败: ' + getErrorMessage(error)))
      .finally(() => setPreferencesLoading(false))
  }, [])

  const chooseMode = async (mode: 'copy' | 'move') => {
    if (saving || mode === importMode) return
    setSaving(true)
    try {
      const result = await SetLocalLibraryImportMode(mode)
      setImportMode(result.importMode === 'copy' || result.importMode === 'move' ? result.importMode : mode)
      toast.success('本地资源库导入方式已更新')
    } catch (error) {
      toast.error('保存失败: ' + getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const stats = localCacheInfo.stats

  return (
    <div className="space-y-6">
      <Section title="本地资源库">
        <Field label="应用内导入方式" description="选择或拖入库外照片时使用。系统文件资源管理器中的复制、移动操作不受此设置影响。">
          {preferencesLoading ? (
            <div className="flex h-20 items-center justify-center"><Loader2 size={16} className="animate-spin" /></div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" disabled={saving} onClick={() => chooseMode('copy')}
                className="rounded-lg border p-4 text-left transition-colors hover:bg-secondary disabled:opacity-50"
                style={{ borderColor: importMode === 'copy' ? 'var(--primary)' : 'var(--border)', backgroundColor: importMode === 'copy' ? 'var(--accent)' : undefined }}>
                <span className="flex items-center gap-2 text-sm font-medium"><Copy size={16} />复制到资源库{importMode === 'copy' && <Check size={15} style={{ color: 'var(--primary)' }} />}</span>
                <span className="mt-2 block text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>保留库外源文件，库内副本成为资源库管理的文件。</span>
              </button>
              <button type="button" disabled={saving} onClick={() => chooseMode('move')}
                className="rounded-lg border p-4 text-left transition-colors hover:bg-secondary disabled:opacity-50"
                style={{ borderColor: importMode === 'move' ? 'var(--primary)' : 'var(--border)', backgroundColor: importMode === 'move' ? 'var(--accent)' : undefined }}>
                <span className="flex items-center gap-2 text-sm font-medium"><FolderInput size={16} />移动到资源库{importMode === 'move' && <Check size={15} style={{ color: 'var(--primary)' }} />}</span>
                <span className="mt-2 block text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>确认安全写入资源库后，从原位置移除源文件。</span>
              </button>
            </div>
          )}
          {!preferencesLoading && !importMode && <p className="mt-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>尚未选择。首次导入照片时会提示选择。</p>}
        </Field>
      </Section>

      <Section title="存储占用" description="统计当前资源库的 .mo-gallery 保留目录。资源库数据不可再生，不会被缓存清理删除。">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] leading-5" style={{ color: 'var(--muted-foreground)' }}>
            缩略图与大图预览可由原文件重新生成；数据库、清单、备份和回收站属于资源库数据。
          </p>
          <button type="button" onClick={() => void localCacheInfo.refresh()} disabled={localCacheInfo.loading}
            className={`${btnOutline} shrink-0`} title="重新统计存储占用">
            <RefreshCw size={13} className={localCacheInfo.loading ? 'animate-spin' : ''} />
            重新统计
          </button>
        </div>

        {localCacheInfo.loading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded-md" />
            <Skeleton className="h-14 w-full rounded-md" />
            <Skeleton className="h-14 w-full rounded-md" />
          </div>
        ) : stats ? (
          <div className="divide-y border-y" style={{ borderColor: 'var(--border)' }}>
            <StorageUsageRow icon={HardDrive} label=".mo-gallery 总占用" value={formatBytes(stats.internal.bytes)} detail={`${stats.internal.fileCount} 个文件`} />
            <StorageUsageRow icon={Database} label="资源库数据" value={formatBytes(stats.libraryData.bytes)} detail={`${stats.libraryData.fileCount} 个文件 · 不可作为缓存清理`} />
            <StorageUsageRow icon={Images} label="网格缩略图" value={formatBytes(stats.thumbnails.bytes)} detail={`${stats.thumbnails.fileCount} 个文件 · 长期保留以保证浏览速度`} />
            <StorageUsageRow icon={ImageIcon} label="大图预览" value={formatBytes(stats.previews.bytes)} detail={`${stats.previews.fileCount} 个文件 · 空间上限 ${formatBytes(stats.previewLimitBytes)}`} />
          </div>
        ) : (
          <div className="rounded-md border border-dashed px-4 py-6 text-center" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-medium">当前未打开本地资源库</p>
            <p className="mt-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{localCacheInfo.error || '打开资源库后可查看实际磁盘占用。'}</p>
          </div>
        )}

        <div className="flex justify-end">
          <button type="button" onClick={onManageCache} className={btnOutline}>
            <Database size={13} />
            管理缓存
            <ChevronRight size={13} />
          </button>
        </div>
      </Section>
    </div>
  )
}

function StorageUsageRow({ icon: Icon, label, value, detail }: {
  icon: typeof Database
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--muted)' }}>
        <Icon size={15} style={{ color: 'var(--muted-foreground)' }} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{label}</p>
        <p className="mt-0.5 text-[10px] leading-4" style={{ color: 'var(--muted-foreground)' }}>{detail}</p>
      </div>
      <span className="shrink-0 text-xs font-medium tabular-nums">{value}</span>
    </div>
  )
}
