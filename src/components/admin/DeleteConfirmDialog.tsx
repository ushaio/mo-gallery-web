'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, BookOpen, ExternalLink, Loader2, Trash2 } from 'lucide-react'
import { AdminButton } from './AdminButton'
import { AdminConfirmDialog } from './AdminConfirmDialog'
import type { PhotoWithStories } from '@/lib/api/types'

/**
 * 照片删除确认弹窗（三态）。
 *
 * 弹窗本体（结构、观感、Esc/遮罩关闭、忙碌态屏蔽、勾选框样式、Enter 确认）由 web 后台自己的
 * `./AdminConfirmDialog` 承担 —— 与「退出登录」弹窗同构（直角面板 + 48px 色块图标 + serif
 * 大写标题 + 等宽 `xl` 按钮）；孪生件在官网 console（`console/ui/ConsoleConfirmDialog.tsx`）。
 * 此前用的是共享包 `@mo-gallery/admin-console` 的 `ConsoleConfirmDialog` / `ConsoleModal`
 * （admin 区外观：圆角 + 小按钮），现已统一到站点设计语言。
 *
 * 本文件只保留 web 后台的**差异部分**：
 * - 加载态：`tone="plain"` + 旋转图标 + 文案 `common.loading`，无动作按钮
 * - 阻断态（照片已挂叙事）：`tone="warn"` + 关联故事清单（清单样式与官网 console
 *   `photos/DeleteConfirmDialog` 同款），底部只有单个取消
 * - 普通删除态：`tone="danger"` + `options`（original / thumbnail 两个受控勾选）
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

  // 勾选状态由宿主的两个布尔 props 推导；确认件本身不持有状态
  const selected: string[] = []
  if (deleteOriginal) selected.push('original')
  if (deleteThumbnail) selected.push('thumbnail')

  const handleToggle = (id: string, checked: boolean) => {
    if (id === 'original') setDeleteOriginal(checked)
    else if (id === 'thumbnail') setDeleteThumbnail(checked)
  }

  if (isLoading) {
    return (
      <AdminConfirmDialog
        open={isOpen}
        tone="plain"
        icon={<Loader2 className="w-6 h-6 animate-spin" />}
        title={t('common.loading')}
        onCancel={handleCancel}
      />
    )
  }

  if (hasBlockingStories) {
    return (
      <AdminConfirmDialog
        open={isOpen}
        tone="warn"
        icon={<BookOpen className="w-6 h-6" />}
        title={t('admin.photo_has_stories')}
        eyebrow={t('admin.cannot_delete')}
        description={
          isBulk ? t('admin.photos_have_stories_desc') : t('admin.photo_has_stories_desc')
        }
        cancelLabel={t('common.cancel')}
        onCancel={handleCancel}
      >
        <div className="space-y-4">
          <div className="border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-600">
              {t('admin.associated_stories')} ({uniqueStories.length})
            </p>
            <ul className="max-h-32 space-y-1 overflow-y-auto">
              {uniqueStories.map(story => (
                <li key={story.id}>
                  <AdminButton
                    onClick={() => {
                      router.push(`/admin/logs?editStory=${story.id}`)
                    }}
                    adminVariant="link"
                    size="sm"
                    className="w-full justify-start gap-2 text-left text-sm"
                  >
                    <BookOpen className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                    <span className="min-w-0 flex-1 truncate">
                      {story.title || t('story.untitled')}
                    </span>
                    <ExternalLink className="w-3 h-3 shrink-0 text-muted-foreground" />
                  </AdminButton>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('admin.remove_from_stories_first')}
          </p>
        </div>
      </AdminConfirmDialog>
    )
  }

  return (
    <AdminConfirmDialog
      open={isOpen}
      tone="danger"
      icon={<AlertTriangle className="w-6 h-6" />}
      confirmIcon={<Trash2 className="w-4 h-4" />}
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
