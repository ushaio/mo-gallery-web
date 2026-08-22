// 系统设置 · 缓存管理

import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { useCachedPageEffect } from '@/hooks/useCachedPageEffect'
import { clearCloudLibraryPageCache, clearDesktopRuntimeCache, clearEquipmentCache, clearOverviewPageCache, getDesktopCacheSnapshot } from '@/lib/app-cache'
import { clearCurrentPersistentCache, getCurrentPersistentCacheScope } from '@/lib/persistent-cache'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { formatBytes } from '@/lib/utils'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import {
  ClearLocalLibraryPreviewCache,
} from '../../../wailsjs/go/main/App'
import {
  Info,
  Loader2,
  RefreshCw,
  Cloud,
  Trash,
  Database,
  LayoutDashboard,
  Images,
  Image as ImageIcon,
} from 'lucide-react'
import { getErrorMessage, btnOutline, Badge } from './shared'
import { useLocalLibraryCacheInfo } from './LocalLibraryTab'
// ─── Tab 8: 缓存管理 ─────────────────────────────────

const APP_CACHE_STORAGE_PREFIX = 'mo-gallery:desktop-cache-storage'

async function getCurrentAppCacheStorageKeys() {
  if (!('caches' in window)) return []
  const scope = getCurrentPersistentCacheScope()
  if (!scope) return []
  const prefix = `${APP_CACHE_STORAGE_PREFIX}:${scope}:`
  return (await caches.keys()).filter(key => key.startsWith(prefix))
}

export function CacheTab() {
  const { language } = usePreferences()
  const [snapshot, setSnapshot] = useState(getDesktopCacheSnapshot)
  const [clearingPage, setClearingPage] = useState<'overview' | 'cloud' | null>(null)
  const [clearingApplication, setClearingApplication] = useState(false)
  const [clearingLocalPreviews, setClearingLocalPreviews] = useState(false)
  const [clearingCacheStorage, setClearingCacheStorage] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'application' | 'previews' | null>(null)
  const [cacheStorageInfo, setCacheStorageInfo] = useState({
    supported: false,
    loading: true,
    count: 0,
    bytes: 0,
    error: null as string | null,
  })
  const cacheStorageRequestIdRef = useRef(0)
  const localCacheInfo = useLocalLibraryCacheInfo()

  const refreshSnapshot = () => setSnapshot(getDesktopCacheSnapshot())

  const refreshCacheStorageInfo = useCallback(async () => {
    const requestId = ++cacheStorageRequestIdRef.current
    if (!('caches' in window)) {
      setCacheStorageInfo({ supported: false, loading: false, count: 0, bytes: 0, error: null })
      return
    }

    setCacheStorageInfo(prev => ({ ...prev, supported: true, loading: true, error: null }))
    try {
      const keys = await getCurrentAppCacheStorageKeys()
      let count = 0
      let bytes = 0
      for (const key of keys) {
        const cache = await caches.open(key)
        const requests = await cache.keys()
        count += requests.length
        for (const request of requests) {
          const response = await cache.match(request)
          if (!response) continue
          bytes += (await response.clone().blob()).size
        }
      }
      if (requestId !== cacheStorageRequestIdRef.current) return
      setCacheStorageInfo({ supported: true, loading: false, count, bytes, error: null })
    } catch (error: unknown) {
      if (requestId !== cacheStorageRequestIdRef.current) return
      setCacheStorageInfo({
        supported: true,
        loading: false,
        count: 0,
        bytes: 0,
        error: error instanceof Error ? error.message : '统计失败',
      })
    }
  }, [])

  useCachedPageEffect(() => { void refreshCacheStorageInfo() }, [refreshCacheStorageInfo])

  const refreshAll = () => {
    refreshSnapshot()
    void refreshCacheStorageInfo()
    void localCacheInfo.refresh()
  }

  const handleClearPageCache = (scope: 'overview' | 'cloud') => {
    setClearingPage(scope)
    if (scope === 'overview') {
      clearOverviewPageCache()
      clearEquipmentCache()
    } else {
      clearCloudLibraryPageCache()
    }
    refreshSnapshot()
    setClearingPage(null)
    toast.success(scope === 'overview' ? '概览页缓存已清理，下次进入时会重新加载' : '云端照片列表缓存已清理，下次进入时会重新加载')
  }

  const deleteCacheStorage = async () => {
    if (!('caches' in window)) return 0
    cacheStorageRequestIdRef.current += 1
    const keys = await getCurrentAppCacheStorageKeys()
    await Promise.all(keys.map(key => caches.delete(key)))
    return keys.length
  }

  const handleClearCacheStorage = async () => {
    if (!cacheStorageInfo.supported) {
      toast.error('当前 WebView 不支持 CacheStorage')
      return
    }

    setClearingCacheStorage(true)
    try {
      const count = await deleteCacheStorage()
      await refreshCacheStorageInfo()
      toast.success(count > 0 ? `已清理 ${count} 个 CacheStorage` : '没有可清理的 CacheStorage')
    } catch (error: unknown) {
      toast.error('清理 CacheStorage 失败: ' + getErrorMessage(error))
    } finally {
      setClearingCacheStorage(false)
    }
  }

  const handleClearApplicationCache = async () => {
    setClearingApplication(true)
    try {
      clearDesktopRuntimeCache()
      clearCurrentPersistentCache()
      await deleteCacheStorage()
      refreshSnapshot()
      await refreshCacheStorageInfo()
      toast.success('应用缓存已清理；相关页面会在下次进入时自动重建')
    } catch (error: unknown) {
      refreshSnapshot()
      await refreshCacheStorageInfo()
      toast.error('部分应用缓存清理失败: ' + getErrorMessage(error))
    } finally {
      setClearingApplication(false)
      setConfirmAction(null)
    }
  }

  const handleClearLocalPreviews = async () => {
    setClearingLocalPreviews(true)
    try {
      await ClearLocalLibraryPreviewCache()
      await localCacheInfo.refresh()
      toast.success('本地大图预览已清理；查看照片时会按需重新生成')
    } catch (error: unknown) {
      toast.error('清理本地大图预览失败: ' + getErrorMessage(error))
    } finally {
      setClearingLocalPreviews(false)
      setConfirmAction(null)
    }
  }

  const cachedPageCount = Number(snapshot.overviewLoaded || snapshot.cameraLoaded || snapshot.lensLoaded) + Number(snapshot.photosLoaded)
  const runtimeBytes = snapshot.overviewPageBytes + snapshot.photosBytes
  const applicationDiskBytes = snapshot.persistentBytes + cacheStorageInfo.bytes
  const previewBytes = localCacheInfo.stats?.previews.bytes ?? 0
  const reclaimableBytes = applicationDiskBytes + previewBytes
  const hasApplicationCache = cachedPageCount > 0 || snapshot.persistentResourceCount > 0 || cacheStorageInfo.count > 0
  const isClearing = clearingApplication || clearingLocalPreviews || clearingCacheStorage || clearingPage !== null
  const isRefreshing = cacheStorageInfo.loading || localCacheInfo.loading || isClearing
  const previewUsagePercent = localCacheInfo.stats?.previewLimitBytes
    ? Math.min(100, Math.round((previewBytes / localCacheInfo.stats.previewLimitBytes) * 100))
    : 0

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-5" style={{ borderColor: 'var(--border)' }}>
        <div className="min-w-0">
          <h2 className="text-sm font-medium">缓存与空间</h2>
          <p className="mt-0.5 truncate text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
            释放可再生数据占用，或在页面数据异常时清理并重建缓存。
          </p>
        </div>
        <button type="button" onClick={refreshAll} disabled={isRefreshing} className={btnOutline} title="重新统计缓存">
          <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
          重新统计
        </button>
      </header>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-auto p-5">
        <div className="mx-auto max-w-4xl space-y-5">
          <section className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
            <div className="flex items-start justify-between gap-4 border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>可释放空间</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{isRefreshing ? '正在统计' : formatBytes(reclaimableBytes)}</p>
                <p className="mt-1 text-[11px] leading-5" style={{ color: 'var(--muted-foreground)' }}>
                  仅计算可清理的磁盘数据，不包含运行时内存、原文件或资源库数据。
                </p>
              </div>
              <Badge tone={reclaimableBytes > 0 ? 'green' : undefined}>{reclaimableBytes > 0 ? '可清理' : '无需清理'}</Badge>
            </div>
            <div className="grid sm:grid-cols-3 sm:divide-x" style={{ borderColor: 'var(--border)' }}>
              <CacheSummaryMetric label="应用磁盘缓存" value={formatBytes(applicationDiskBytes)} detail={`${snapshot.persistentResourceCount} 项持久化数据 · ${cacheStorageInfo.count} 项当前账号网络响应`} />
              <CacheSummaryMetric label="本地大图预览" value={localCacheInfo.loading ? '统计中' : localCacheInfo.stats ? formatBytes(previewBytes) : '未打开资源库'} detail={localCacheInfo.stats ? `${localCacheInfo.stats.previews.fileCount} 个文件` : '打开本地资源库后可统计'} />
              <CacheSummaryMetric label="页面运行时状态" value={formatBytes(runtimeBytes)} detail={`${cachedPageCount}/2 个页面已缓存 · 不计入磁盘空间`} />
            </div>
          </section>

          <CacheDetailSection
            title="应用数据缓存"
            description="包含页面运行时状态、按账号保存的页面数据和 CacheStorage。清理后不会退出登录，相关页面会在下次进入时重新请求。"
            footer={(
              <button type="button" onClick={() => setConfirmAction('application')}
                disabled={isRefreshing || !hasApplicationCache} className={btnOutline} style={{ color: 'var(--destructive)' }}>
                {clearingApplication ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                清理并重建
              </button>
            )}
          >
            <CacheManagementRow
              icon={LayoutDashboard}
              title="概览页"
              description="统计概览、相机列表和镜头列表的已加载数据。"
              status={snapshot.overviewLoaded || snapshot.cameraLoaded || snapshot.lensLoaded ? '已缓存' : '未缓存'}
              detail={`${formatBytes(snapshot.overviewPageBytes)} 运行时估算 · 相机 ${snapshot.cameraCount} · 镜头 ${snapshot.lensCount}`}
              actionLabel="清理"
              onAction={() => handleClearPageCache('overview')}
              disabled={isRefreshing || !(snapshot.overviewLoaded || snapshot.cameraLoaded || snapshot.lensLoaded)}
              loading={clearingPage === 'overview'}
            />
            <CacheManagementRow
              icon={Images}
              title="云端照片列表"
              description="已加载的分页数据与滚动位置。"
              status={snapshot.photosLoaded ? '已缓存' : '未缓存'}
              detail={snapshot.photosLoaded ? `${snapshot.photosCount} 张 · ${formatBytes(snapshot.photosBytes)} 运行时估算` : '进入云端照片页面后生成'}
              actionLabel="清理"
              onAction={() => handleClearPageCache('cloud')}
              disabled={isRefreshing || !snapshot.photosLoaded}
              loading={clearingPage === 'cloud'}
            />
            <CacheManagementRow
              icon={Database}
              title="持久化页面数据"
              description="按当前服务端与登录账号保存的概览、相册、分类、胶卷、故事和朋友列表。"
              status={snapshot.persistentResourceCount > 0 ? `${snapshot.persistentResourceCount} 项` : '无缓存'}
              detail={`${formatBytes(snapshot.persistentBytes)} 磁盘估算 · 清理并重建时统一移除`}
            />
            <CacheManagementRow
              icon={Cloud}
              title="CacheStorage"
              description="由 MO Gallery 网页功能写入、按当前服务端与账号隔离的网络响应缓存。"
              status={cacheStorageInfo.loading ? '计算中' : cacheStorageInfo.error ? '统计失败' : cacheStorageInfo.supported ? `${cacheStorageInfo.count} 项` : '不支持'}
              detail={cacheStorageInfo.error || (cacheStorageInfo.supported ? `${formatBytes(cacheStorageInfo.bytes)} 磁盘估算` : '当前 WebView 未提供 CacheStorage')}
              actionLabel="清理"
              onAction={handleClearCacheStorage}
              disabled={isRefreshing || !cacheStorageInfo.supported || cacheStorageInfo.count === 0}
              loading={clearingCacheStorage}
            />
          </CacheDetailSection>

          <CacheDetailSection
            title="本地预览缓存"
            description="管理当前本地资源库按需生成的 2048px 屏幕预览。清理不会影响 512px 网格缩略图、原文件、索引或整理数据。"
            footer={localCacheInfo.stats ? (
              <button type="button" onClick={() => setConfirmAction('previews')}
                disabled={isRefreshing || localCacheInfo.stats.previews.fileCount === 0}
                className={btnOutline} style={{ color: 'var(--destructive)' }}>
                {clearingLocalPreviews ? <Loader2 size={13} className="animate-spin" /> : <Trash size={13} />}
                清理大图预览
              </button>
            ) : undefined}
          >
            <CacheManagementRow
              icon={ImageIcon}
              title="大图预览"
              description="首次查看照片时生成，之后直接复用；清理后首次打开可能需要等待重新生成。"
              status={localCacheInfo.loading ? '计算中' : localCacheInfo.stats ? formatBytes(previewBytes) : '未打开资源库'}
              detail={localCacheInfo.stats
                ? `${localCacheInfo.stats.previews.fileCount} 个文件 · 已使用上限的 ${previewUsagePercent}% · 上限 ${formatBytes(localCacheInfo.stats.previewLimitBytes)}`
                : localCacheInfo.error || '打开本地资源库后可统计和清理'}
            />
          </CacheDetailSection>

          <div className="flex items-start gap-2 rounded-md border px-4 py-3 text-[11px] leading-5" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>缓存清理不会删除账户、设置、照片原文件或资源库数据库。系统 WebView 管理的 HTTP 图片缓存无法准确统计，因此不计入可释放空间。</span>
          </div>
        </div>
      </div>

      <SimpleDeleteDialog
        isOpen={confirmAction === 'application'}
        title="清理并重建应用缓存"
        message={`将清理约 ${formatBytes(applicationDiskBytes)} 的应用磁盘缓存，以及当前页面运行时状态。不会退出登录或删除任何照片；相关页面会在下次进入时重新加载。`}
        confirmLabel="清理并重建"
        pendingLabel="正在清理..."
        confirmIcon="refresh"
        onConfirm={handleClearApplicationCache}
        onCancel={() => setConfirmAction(null)}
        t={(key) => t(key, language)}
      />
      <SimpleDeleteDialog
        isOpen={confirmAction === 'previews'}
        title="清理本地大图预览"
        message={`将释放约 ${formatBytes(previewBytes)} 的大图预览缓存。原文件、网格缩略图和资源库数据会保留；之后首次查看照片时需要重新生成预览。`}
        confirmLabel="清理预览"
        pendingLabel="正在清理..."
        onConfirm={handleClearLocalPreviews}
        onCancel={() => setConfirmAction(null)}
        t={(key) => t(key, language)}
      />
    </div>
  )
}

function CacheSummaryMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="px-5 py-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-[10px] leading-4" style={{ color: 'var(--muted-foreground)' }}>{detail}</p>
    </div>
  )
}

function CacheDetailSection({ title, description, footer, children }: {
  title: string
  description: string
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-3">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="mt-1 max-w-3xl text-[11px] leading-5" style={{ color: 'var(--muted-foreground)' }}>{description}</p>
      </div>
      <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>{children}</div>
        {footer && (
          <div className="flex justify-end border-t px-4 py-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)' }}>
            {footer}
          </div>
        )}
      </div>
    </section>
  )
}

function CacheManagementRow({ icon: Icon, title, description, status, detail, actionLabel, onAction, disabled, loading }: {
  icon: typeof Database
  title: string
  description: string
  status: string
  detail: string
  actionLabel?: string
  onAction?: () => void
  disabled?: boolean
  loading?: boolean
}) {
  return (
    <div className="flex min-h-20 items-center gap-4 px-4 py-3.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--muted)' }}>
        <Icon size={16} style={{ color: 'var(--muted-foreground)' }} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-xs font-medium">{title}</h4>
          <Badge>{status}</Badge>
        </div>
        <p className="mt-1 text-[11px] leading-4" style={{ color: 'var(--muted-foreground)' }}>{description}</p>
        <p className="mt-0.5 text-[10px] leading-4" style={{ color: 'var(--muted-foreground)' }}>{detail}</p>
      </div>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} disabled={disabled} className={`${btnOutline} shrink-0`}>
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Trash size={13} />}
          {actionLabel}
        </button>
      )}
    </div>
  )
}

export function CacheStat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--muted)' }}>
      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
      <p className="mt-0.5 text-sm font-medium" style={{ color: 'var(--foreground)' }}>{value}</p>
      {detail && <p className="mt-0.5 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{detail}</p>}
    </div>
  )
}
