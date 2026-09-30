'use client'

import { useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { ConsoleConfirmDialog } from '@mo-gallery/admin-console'

/**
 * 单条删除确认弹窗。
 *
 * 阶段 1 起，弹窗本体（结构、观感、Esc/Enter/遮罩交互、忙碌态）由共享包
 * `@mo-gallery/admin-console` 的 `ConsoleConfirmDialog` 承担；本文件只保留 web 后台
 * 自己的**差异部分**（差异登记点③）：
 * - 文案键：`common.confirm` / `admin.confirm_delete_single` / `common.cancel` / `common.delete`
 * - 图标：Trash2
 * - 提交语义：`onConfirm` 可能是异步的，宿主自己持有 busy 状态并串行化（防重复提交）
 *
 * 对外 props 与改造前一致，22 处调用点零改动。
 */
interface SimpleDeleteDialogProps {
  isOpen: boolean
  title?: string
  message?: string
  onConfirm: () => void | Promise<void>
  onCancel: () => void
  t: (key: string) => string
}

export function SimpleDeleteDialog({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  t,
}: SimpleDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const busyRef = useRef(false)

  const handleConfirm = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setIsDeleting(true)
    try {
      await onConfirm()
    } finally {
      busyRef.current = false
      setIsDeleting(false)
    }
  }

  return (
    <ConsoleConfirmDialog
      open={isOpen}
      tone="danger"
      icon={<Trash2 className="h-4 w-4" />}
      title={title || t('common.confirm')}
      description={message || `${t('admin.confirm_delete_single')}?`}
      cancelLabel={t('common.cancel')}
      confirmLabel={t('common.delete')}
      confirmVariant="danger"
      busy={isDeleting}
      confirmOnEnter
      onCancel={onCancel}
      onConfirm={handleConfirm}
    />
  )
}
