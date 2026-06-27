/**
 * 照片日志页 — 故事 + 博客双标签，复用 web 后台管理的 StoriesTab / BlogTab。
 * 数据/交互逻辑与 web 完全一致（直接调用 @/lib/api）。
 */
'use client'

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { useAdmin, AdminLogsProvider } from '@/pages/admin-logs/layout'
import { getPhotos, type PhotoDto } from '@/lib/api'
import { StoriesTab } from '@/pages/admin-logs/StoriesTab'
import { BlogTab } from '@/pages/admin-logs/BlogTab'
import { t } from '@/lib/i18n'
import { FileText, PenTool } from 'lucide-react'

type Tab = 'stories' | 'blogs'

export function PhotoJournalPage() {
  return (
    <AdminLogsProvider>
      <PhotoJournalContent />
    </AdminLogsProvider>
  )
}

function PhotoJournalContent() {
  const { t } = useLanguage()
  const { token } = useAuth()
  const { settings } = useAdmin()
  const [tab, setTab] = useState<Tab>('stories')
  const [photos, setPhotos] = useState<PhotoDto[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  // 博客插入照片需要全部照片
  useEffect(() => {
    if (tab !== 'blogs') return
    let cancelled = false
    ;(async () => {
      try {
        const data = await getPhotos({ all: true })
        if (!cancelled) setPhotos(data)
      } catch (err) {
        console.error('Failed to load photos:', err)
      }
    })()
    return () => { cancelled = true }
  }, [tab])

  const notify = useCallback((message: string, type?: 'success' | 'error' | 'info') => {
    if (type === 'error') toast.error(message)
    else if (type === 'success') toast.success(message)
    else toast(message)
  }, [])

  const triggerRefresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  return (
    <div className="flex h-full flex-col">
      {/* 标签切换栏 */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
          {t('photoJournal.title')}
        </span>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
          <TabButton active={tab === 'stories'} onClick={() => setTab('stories')} icon={FileText} label={t('photoJournal.stories')} />
          <TabButton active={tab === 'blogs'} onClick={() => setTab('blogs')} icon={PenTool} label={t('photoJournal.blogs')} />
        </div>
      </div>

      {/* 内容区 */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {token && (
          tab === 'stories' ? (
            <StoriesTab
              token={token}
              t={t}
              notify={notify}
              refreshKey={refreshKey}
            />
          ) : (
            <BlogTab
              photos={photos}
              settings={settings}
              t={t}
              notify={notify}
              refreshKey={refreshKey}
            />
          )
        )}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, icon: Icon, label }: {
  active: boolean
  onClick: () => void
  icon: any
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors"
      style={{
        backgroundColor: active ? 'var(--background)' : 'transparent',
        color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
      }}>
      <Icon size={14} /> {label}
    </button>
  )
}
