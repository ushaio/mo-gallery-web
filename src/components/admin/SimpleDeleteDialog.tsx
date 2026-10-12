'use client'

import { useRef, useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { AdminConfirmDialog } from './AdminConfirmDialog'

/**
 * 单条删除确认弹窗。
 *
 * 弹窗本体（结构、观感、Esc/Enter/遮罩交互、忙碌态）由 web 后台自己的
 * `./AdminConfirmDialog` 承担 —— 它与「退出登录」弹窗同构（直角面板、48px 色块图标、
 * serif 大写标题、等宽 `xl` 按钮）。此前用的是共享包 `@mo-gallery/admin-console` 的同名件，
 * 那是 **admin 区外观**（圆角 + 20px 内边距 + 无衬线小标题 + 右对齐小按钮）；孪生件在
 * 官网 console（`mo-gallery-offical` 的 `console/ui/ConsoleConfirmDialog.tsx`）。
 *
 * 本文件只保留 web 后台自己的**差异部分**：
 * - 文案键：`common.confirm` / `admin.confirm_delete_single` / `common.cancel` / `common.delete`
 * - 图标：色块 AlertTriangle（警示）、确认按钮 Trash2
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
    <AdminConfirmDialog
      open={isOpen}
      tone="danger"
      icon={<AlertTriangle className="w-6 h-6" />}
      title={title || t('common.confirm')}
      description={message || `${t('admin.confirm_delete_single')}?`}
      cancelLabel={t('common.cancel')}
      confirmLabel={t('common.delete')}
      confirmVariant="danger"
      confirmIcon={<Trash2 className="w-4 h-4" />}
      busy={isDeleting}
      confirmOnEnter
      onCancel={onCancel}
      onConfirm={handleConfirm}
    />
  )
}