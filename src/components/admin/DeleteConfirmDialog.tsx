'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, BookOpen, ExternalLink } from 'lucide-react'
import { ConsoleButton, ConsoleConfirmDialog, ConsoleModal } from '@mo-gallery/admin-console'
import type { PhotoWithStories } from '@/lib/api/types'

/**
 * 照片删除确认弹窗（三态）。
 *
 * 阶段 2 起，弹窗本体（结构、观感、portal、Esc/遮罩关闭、忙碌态屏蔽、勾选框样式、
 * Enter 确认）由共享包 `@mo-gallery/admin-console` 承担；本文件只保留 web 后台的
 * **差异部分**（差异登记点③：文案键、图标、勾选字段、阻断态的关联故事清单）：
 * - 加载态：`ConsoleModal`（居中 spinner，文案 `common.loading`）
 * - 阻断态（照片已挂叙事）：`ConsoleModal` tone="warn" + `.mgac-notice.is-warn` 列表
 * - 普通删除态：`ConsoleConfirmDialog` + `options`（original / thumbnail 两个受控勾选）
 *
 * 对外 props 与改造前一字不差，调用点零改动。
 */
interface DeleteConfirmDialogProps {
  isOpen: boolean
  isBulk: boolean
  count: number
  deleteOriginal: boolean
  setDeleteOriginal: (val: boolean) => void
  deleteThumbnail: boolean
  setDeleteThumbnail: (val: boolean) => void
  onConfirm: () => void
  onCancel: () => void
  t: (key: string) => string
  // New props for story check
  isLoading?: boolean
  photosWithStories?: PhotoWithStories[]
}

export function DeleteConfirmDialog({
  isOpen,
  isBulk,
  count,
  deleteOriginal,
  setDeleteOriginal,
  deleteThumbnail,
  setDeleteThumbnail,
  onConfirm,
  onCancel,
  t,
  isLoading = false,
  photosWithStories = [],
}: DeleteConfirmDialogProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)

  const hasBlockingStories = photosWithStories.length > 0

  const handleConfirm = async () => {
    setIsDeleting(true)
    try {
      await onConfirm()
    } finally {
      setIsDeleting(false)
    }
  }

  const handleCancel = () => {
    if (isDeleting) return
    onCancel()
  }

  // Get unique stories from all photos
  const uniqueStories = photosWithStories.reduce((acc, photo) => {
    photo.stories.forEach(story => {
      if (!acc.find(s => s.id === story.id)) {
        acc.push(story)
      }
    })
    return acc
  }, [] as { id: string; title: string }[])

  // 勾选状态由宿主的两个布尔 props 推导；共享包不持有状态
  const selected: string[] = []
  if (deleteOriginal) selected.push('original')
  if (deleteThumbnail) selected.push('thumbnail')

  const handleToggle = (id: string, checked: boolean) => {
    if (id === 'original') setDeleteOriginal(checked)
    else if (id === 'thumbnail') setDeleteThumbnail(checked)
  }

  if (isLoading) {
    return (
      <ConsoleModal open={isOpen} size="sm" onClose={handleCancel}>
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-muted-foreground">
          <span className="mgac-spinner" aria-hidden="true" />
          <p className="text-sm">{t('common.loading')}</p>
        </div>
      </ConsoleModal>
    )
  }

  if (hasBlockingStories) {
    return (
      <ConsoleModal
        open={isOpen}
        size="sm"
        tone="warn"
        icon={<BookOpen className="h-4 w-4" />}
        title={t('admin.photo_has_stories')}
        eyebrow={t('admin.cannot_delete')}
        description={
          isBulk ? t('admin.photos_have_stories_desc') : t('admin.photo_has_stories_desc')
        }
        footer={
          <ConsoleButton variant="outline" onClick={handleCancel}>
            {t('common.cancel')}
          </ConsoleButton>
        }
        onClose={handleCancel}
      >
        <div className="space-y-3">
          <div className="mgac-notice is-warn is-column">
            <p className="text-xs font-bold uppercase tracking-wider">
              {t('admin.associated_stories')} ({uniqueStories.length})
            </p>
            <ul className="w-full space-y-1" style={{ maxHeight: 128, overflowY: 'auto' }}>
              {uniqueStories.map(story => (
                <li key={story.id}>
                  <ConsoleButton
                    variant="ghost"
                    size="sm"
                    fullWidth
                    onClick={() => {
                      router.push(`/admin/logs?editStory=${story.id}`)
                    }}
                  >
                    <BookOpen className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-left">
                      {story.title || t('story.untitled')}
                    </span>
                    <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                  </ConsoleButton>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('admin.remove_from_stories_first')}
          </p>
        </div>
      </ConsoleModal>
    )
  }

  return (
    <ConsoleConfirmDialog
      open={isOpen}
      tone="danger"
      icon={<AlertTriangle className="h-4 w-4" />}
      title={t('common.confirm')}
      eyebrow={isBulk ? `${count} ${t('admin.photos')}` : `1 ${t('admin.photos').replace(/s$/, '')}`}
      description={
        isBulk
          ? `${t('admin.confirm_delete_multiple')} ${count} ${t('admin.photos')}?`
          : `${t('admin.confirm_delete_single')}?`
      }
      options={{
        items: [
          { id: 'original', label: t('admin.delete_original'), hint: t('admin.delete_original_hint') },
          { id: 'thumbnail', label: t('admin.delete_thumbnail'), hint: t('admin.delete_thumbnail_hint') },
        ],
        selected,
        onToggle: handleToggle,
      }}
      cancelLabel={t('common.cancel')}
      confirmLabel={t('common.delete')}
      confirmVariant="danger"
      busy={isDeleting}
      confirmOnEnter
      onCancel={handleCancel}
      onConfirm={handleConfirm}
    />
  )
}
