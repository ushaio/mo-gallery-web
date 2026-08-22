// 系统设置 · 关于

import { useState, useEffect, useCallback } from 'react'
import { version } from '../../../package.json'
import { toast } from 'sonner'
import { t } from '@/lib/i18n'
import { formatBytes } from '@/lib/utils'
import { checkForUpdates, downloadUpdate, isDevelopmentBuild, openDownloadedUpdate, UpdateDownloadProgress, UpdateDownloadResult, UpdateInfo } from '@/lib/app-updater'
import { BrowserOpenURL } from '../../../wailsjs/runtime/runtime'
import {
  Loader2,
  RefreshCw,
  Github,
  ExternalLink,
  Download,
  CircleCheck,
  TriangleAlert,
} from 'lucide-react'
import { getErrorMessage, btnPrimary, btnOutline, Section } from './shared'
// ─── Tab 9: 关于 ────────────────────────────────────

const APP_REPO_URL = 'https://github.com/ushaio/mo-gallery-web'

const APP_FEATURES: { title: string; description: string }[] = [
  { title: '图库管理', description: '宫格、瀑布流与时间线视图，自动提取 EXIF 与主色调' },
  { title: '相册与胶卷', description: '相册封面与详情页，胶卷帧排序、元数据和批量添加' },
  { title: '批量上传', description: '多图拖拽、压缩、SHA-256 去重与上传进度追踪' },
  { title: '内容创作', description: '故事、博客、照片日志与 Zine 编排，TipTap 富文本编辑' },
  { title: 'AI 助手', description: '多轮对话、编辑器内 AI 操作与图片生成，支持 OpenAI 兼容 API' },
  { title: '本地资源库', description: '本地照片索引、全文搜索、预览与文件夹管理' },
  { title: '存储整理', description: 'Local / S3 / R2 / GitHub 多存储源与孤立文件检测' },
  { title: '管理与审核', description: '评论审核、友链管理、操作日志与系统设置' },
]

const APP_TECH_STACK: { label: string; value: string }[] = [
  { label: '桌面端', value: 'Wails 2 · Go · React 19 · Vite · GORM' },
  { label: 'Web 端', value: 'Next.js 16 · Hono · Prisma 7 · PostgreSQL' },
  { label: '存储后端', value: 'Local · S3 · Cloudflare R2 · GitHub' },
  { label: '共享包', value: 'packages/tiptap-editor · packages/ai-agent' },
]

export function AboutTab() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [updateError, setUpdateError] = useState('')
  const [checking, setChecking] = useState(true)
  const [developmentBuild, setDevelopmentBuild] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState<UpdateDownloadProgress | null>(null)
  const [downloaded, setDownloaded] = useState<UpdateDownloadResult | null>(null)

  const check = useCallback(async (silent = false, force = false) => {
    setChecking(true)
    setUpdateError('')
    try {
      const info = await checkForUpdates(version, force)
      setUpdateInfo(info)
      setDownloaded(null)
      setProgress(null)
      if (!silent && !info.updateAvailable) toast.success('当前已是最新版本')
    } catch (error: unknown) {
      setUpdateError(getErrorMessage(error))
    } finally {
      setChecking(false)
    }
  }, [])


  useEffect(() => {
    let active = true
    void isDevelopmentBuild()
      .then((isDev) => {
        if (!active) return
        setDevelopmentBuild(isDev)
        if (isDev) {
          setChecking(false)
          return
        }
        void check(true)
      })
      .catch(() => void check(true))
    return () => { active = false }
  }, [check])

  const startDownload = async () => {
    setDownloading(true)
    setUpdateError('')
    setProgress({ downloaded: 0, total: updateInfo?.asset?.size || 0, percent: 0 })
    try {
      const result = await downloadUpdate(setProgress)
      setDownloaded(result)
      toast.success('更新包下载并校验完成')
    } catch (error: unknown) {
      setUpdateError(getErrorMessage(error))
    } finally {
      setDownloading(false)
    }
  }

  const installUpdate = async () => {
    try {
      await openDownloadedUpdate()
      if (downloaded?.installMode === 'reveal') toast.success('已打开更新包所在目录')
    } catch (error: unknown) {
      setUpdateError(getErrorMessage(error))
    }
  }

  const progressPercent = Math.min(100, Math.max(0, progress?.percent || 0))

  return (
    <div className="space-y-6">
      {/* 项目介绍 */}
      <div className="rounded-lg border p-6 text-center" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl text-sm font-semibold tracking-wide"
          style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          E
        </div>
        <h2 className="mt-4 text-base font-semibold">Emulsion</h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
          面向摄影作品展示、内容叙事与图库管理的一体化平台，与 Next.js Web 站点共用仓库与核心能力。
        </p>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}>
          <Github size={13} />
          v{version}
        </span>
      </div>

      <Section title="版本信息">
        <div className="grid gap-3 sm:grid-cols-2">
          <AboutInfoRow label="桌面端版本" value={`v${version}`} />
          <AboutInfoRow label="产品名称" value="Emulsion" />
          <AboutInfoRow label="许可协议" value="MIT License" />
          <AboutInfoRow label="版权所有" value="© 2026 ushaio" />
        </div>
      </Section>

      <Section title="软件更新">
        <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}>
              {checking ? <Loader2 size={16} className="animate-spin" /> : updateError ? <TriangleAlert size={16} /> : <CircleCheck size={16} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {checking
                  ? '正在检查更新...'
                  : updateError
                    ? '无法检查更新'
                    : updateInfo?.updateAvailable
                      ? `发现新版本 v${updateInfo.latestVersion}`
                      : developmentBuild && !updateInfo
                        ? '开发模式未自动检查更新'
                        : '当前已是最新版本'}
              </p>
              <p className="mt-1 text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>
                当前版本 v{version}
                {updateInfo?.publishedAt && ` · 最新版本发布于 ${new Date(updateInfo.publishedAt).toLocaleDateString('zh-CN')}`}
                {developmentBuild && !updateInfo && ' · 点击右侧按钮手动检查'}
              </p>
              {updateError && <p role="alert" className="mt-2 text-xs text-destructive">{updateError}</p>}
            </div>
            <button type="button" onClick={() => void check(false, true)} disabled={checking || downloading} className={btnOutline}>
              <RefreshCw size={13} className={checking ? 'animate-spin' : ''} />
              检查更新
            </button>
          </div>

          {updateInfo?.updateAvailable && (
            <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
              {updateInfo.notes && (
                <div className="max-h-44 overflow-y-auto rounded-md p-3 text-xs leading-5 whitespace-pre-wrap custom-scrollbar"
                  style={{ backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                  {updateInfo.notes}
                </div>
              )}

              {downloading && (
                <div className="mt-3">
                  <div className="mb-1.5 flex items-center justify-between text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                    <span>正在下载并校验更新包</span>
                    <span>{progressPercent.toFixed(0)}% · {formatBytes(progress?.downloaded || 0)} / {progress?.total ? formatBytes(progress.total) : '未知大小'}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--muted)' }}>
                    <div className="h-full rounded-full transition-[width]" style={{ width: `${progressPercent}%`, backgroundColor: 'var(--primary)' }} />
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {downloaded ? (
                  <button type="button" onClick={() => void installUpdate()} className={btnPrimary}
                    style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                    <Download size={13} />
                    {downloaded.installMode === 'installer' ? '安装更新' : '打开更新目录'}
                  </button>
                ) : updateInfo.asset ? (
                  <button type="button" onClick={() => void startDownload()} disabled={downloading} className={btnPrimary}
                    style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                    {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                    {downloading ? '下载中...' : `下载 v${updateInfo.latestVersion}`}
                  </button>
                ) : (
                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>当前系统或架构暂无自动更新包。</span>
                )}
                <button type="button" onClick={() => BrowserOpenURL(updateInfo.releaseUrl)} className={btnOutline}>
                  <ExternalLink size={13} />
                  查看 Release
                </button>
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section title="GitHub 仓库">
        <p className="text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
          项目为开源软件（MIT License），欢迎前往 GitHub 查看源码、报告问题或参与贡献。
        </p>
        <div className="space-y-2">
          <AboutLinkRow label="项目仓库" value="github.com/ushaio/mo-gallery-web" url={APP_REPO_URL} />
          <AboutLinkRow label="Releases" value="github.com/ushaio/mo-gallery-web/releases" url={`${APP_REPO_URL}/releases`} />
          <AboutLinkRow label="更新日志" value="RELEASE.md" url={`${APP_REPO_URL}/blob/main/RELEASE.md`} />
        </div>
      </Section>

      <Section title="功能特性">
        <div className="grid gap-3 sm:grid-cols-2">
          {APP_FEATURES.map(feature => (
            <AboutFeature key={feature.title} title={feature.title} description={feature.description} />
          ))}
        </div>
      </Section>

      <Section title="技术栈">
        <div className="grid gap-3 sm:grid-cols-2">
          {APP_TECH_STACK.map(item => (
            <AboutInfoRow key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
      </Section>
    </div>
  )
}

function AboutInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--muted)' }}>
      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
      <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--foreground)' }}>{value}</p>
    </div>
  )
}

function AboutLinkRow({ label, value, url }: { label: string; value: string; url: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
      <div className="flex-1 min-w-0">
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
        <p className="text-sm font-medium mt-0.5 truncate" style={{ color: 'var(--foreground)' }}>{value}</p>
      </div>
      <button
        onClick={() => BrowserOpenURL(url)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-opacity hover:opacity-70"
        style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
        aria-label={`打开 ${label}`}
        title={`打开 ${label}`}
      >
        <ExternalLink size={14} />
      </button>
    </div>
  )
}

function AboutFeature({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border p-3.5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>{description}</p>
    </div>
  )
}
