'use client'

import { Clock, FileArchive } from 'lucide-react'
import { AdminButton, AdminModal } from '@mo-gallery/admin-console'

/**
 * 本地草稿恢复弹窗。
 *
 * 本阶段起，弹窗本体（结构、观感、portal、Esc/遮罩关闭、右上角 ✕、内容区与动作区
 * 布局）由共享包 `@mo-gallery/admin-console` 的 `AdminModal` 承担；本文件只保留
 * web 后台自己的**差异部分**（差异登记点③）：
 * - 文案键：`admin.draft_found` / `admin.draft_found_message` / `admin.draft_time`
 *   / `admin.draft_restore` / `admin.draft_discard` / `common.cancel`
 * - 图标：FileArchive（`tone="info"`）
 * - 内容插槽：草稿保存时间
 * - 三个动作：取消（原 ✕ 与遮罩点击）、丢弃草稿（使用数据库版本）、恢复草稿
 *
 * 关闭语义与改造前一致：`onClose`（✕ / 遮罩 / Esc）与 `onCancel` 都走宿主的
 * `onCancel` —— 即「关闭弹窗、不恢复也不丢弃」。
 *
 * 对外 props 与改造前一致，调用点零改动。
 */
interface DraftRestoreDialogProps {
  isOpen: boolean
  draftTime: number
  onRestore: () => void
  onDiscard: () => void
  onCancel: () => void
  t: (key: string) => string
}

export function DraftRestoreDialog({
  isOpen,
  draftTime,
  onRestore,
  onDiscard,
  onCancel,
  t,
}: DraftRestoreDialogProps) {
  function formatTime(timestamp: number): string {
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  return (
    <AdminModal
      open={isOpen}
      tone="info"
      size="sm"
      icon={<FileArchive className="h-4 w-4" />}
      title={t('admin.draft_found')}
      description={t('admin.draft_found_message')}
      onClose={onCancel}
      footer={
        <>
          <AdminButton variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </AdminButton>
          <AdminButton variant="danger" onClick={onDiscard}>
            {t('admin.draft_discard')}
          </AdminButton>
          <AdminButton variant="primary" onClick={onRestore}>
            {t('admin.draft_restore')}
          </AdminButton>
        </>
      }
    >
      <div className="mgac-notice is-info">
        <Clock className="h-4 w-4" />
        <span>
          {t('admin.draft_time')}: {formatTime(draftTime)}
        </span>
      </div>
    </AdminModal>
  )
}
