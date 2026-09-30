'use client'

import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { AdminConfirmDialog } from '@mo-gallery/admin-console'

/**
 * 存储切换后的 URL 变更确认弹窗。
 *
 * 本阶段起，弹窗本体（结构、观感、portal、Esc/遮罩关闭、勾选框样式、动作区）
 * 由共享包 `@mo-gallery/admin-console` 的 `AdminConfirmDialog` 承担；本文件只保留
 * web 后台自己的**差异部分**（差异登记点③）：
 * - 文案键：`admin.url_change_detected` / `admin.storage_configuration` /
 *   `admin.url_change_message` / `admin.old_url` / `admin.new_url` / `admin.not_set` /
 *   `admin.note` / `admin.url_update_note` / `admin.update_photo_urls` /
 *   `admin.save_without_updating` / `common.cancel`
 * - 图标：AlertCircle
 * - 勾选字段：改造前是「更新照片地址 / 仅保存配置」两个动作按钮，共享确认件只有
 *   「取消 + 确认」两个出口，因此把「是否同步更新照片 URL」显式化为受控勾选
 *   （`options`），`onConfirm(updateUrls)` 的布尔由 `selected` 推导。
 *
 * 对外 props 与改造前一致，调用点零改动。
 */
interface UrlUpdateConfirmDialogProps {
  isOpen: boolean
  oldUrl: string
  newUrl: string
  onConfirm: (updateUrls: boolean) => void
  onCancel: () => void
  t: (key: string) => string
}

export function UrlUpdateConfirmDialog(props: UrlUpdateConfirmDialogProps) {
  // 关闭时直接卸载，让「是否同步更新 URL」每次打开都回到默认勾选（改造前每次打开
  // 都是未决状态，不存在跨次残留的选择）。
  if (!props.isOpen) return null
  return <UrlUpdateConfirmDialogContent {...props} />
}

function UrlUpdateConfirmDialogContent({
  oldUrl,
  newUrl,
  onConfirm,
  onCancel,
  t,
}: UrlUpdateConfirmDialogProps) {
  // 默认勾选：改造前主按钮就是「更新照片地址」。
  const [updateUrls, setUpdateUrls] = useState(true)

  return (
    <AdminConfirmDialog
      open
      tone="info"
      icon={<AlertCircle className="h-4 w-4" />}
      title={t('admin.url_change_detected')}
      eyebrow={t('admin.storage_configuration')}
      description={t('admin.url_change_message')}
      options={{
        items: [{ id: 'update_urls', label: t('admin.update_photo_urls') }],
        selected: updateUrls ? ['update_urls'] : [],
        onToggle: (_id, checked) => setUpdateUrls(checked),
      }}
      cancelLabel={t('common.cancel')}
      confirmLabel={updateUrls ? t('admin.update_photo_urls') : t('admin.save_without_updating')}
      confirmVariant="primary"
      onCancel={onCancel}
      onConfirm={() => onConfirm(updateUrls)}
    >
      <div className="space-y-2">
        <div className="mgac-kv">
          <div>
            <span>{t('admin.old_url')}</span>
            <strong className="font-mono break-all">{oldUrl || t('admin.not_set')}</strong>
          </div>
          <div>
            <span>{t('admin.new_url')}</span>
            <strong className="font-mono break-all text-primary">{newUrl || t('admin.not_set')}</strong>
          </div>
        </div>

        <div className="mgac-notice is-warn">
          <p>
            <strong>{t('admin.note')}:</strong> {t('admin.url_update_note')}
          </p>
        </div>
      </div>
    </AdminConfirmDialog>
  )
}
