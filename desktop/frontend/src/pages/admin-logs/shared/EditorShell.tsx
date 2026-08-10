'use client'

import type { ReactNode } from 'react'
import { Check, ChevronLeft, ChevronRight, Clock, Eye, Maximize2, Minimize2, Save, X } from 'lucide-react'
import { AdminButton } from '@/components/admin/AdminButton'
import { cn } from '@/lib/utils'

/**
 * 共用编辑器外壳（叙事 / 博客一致）：
 * - 顶栏：退出选中 + 标题输入 + 草稿状态指示 ｜ 发布开关 + 预览 + 沉浸 + 保存
 * - 元信息条：类型相关字段（分类/标签/日期）在 metaLeft，统计信息在 metaRight
 * - 内容区：children 承载编辑器与素材面板
 */
export interface EditorShellProps {
  title: string
  onTitleChange: (value: string) => void
  titlePlaceholder: string
  onClose: () => void
  closeDisabled?: boolean
  closeLabel?: string

  // 草稿 / 保存状态
  draftSaved?: boolean
  lastSavedAt?: number | null
  saving?: boolean

  // 发布
  isPublished: boolean
  onTogglePublished: () => void
  publishedLabel: string
  draftLabel: string

  onSave: () => void
  saveDisabled?: boolean
  saveLabel: string
  savingLabel: string

  // 预览 / 沉浸
  onPreview?: () => void
  previewLabel?: string
  isImmersiveMode?: boolean
  onToggleImmersive?: () => void
  immersiveLabel?: string

  // 左栏列表收起/展开（编辑态内嵌控制）
  listPaneCollapsed?: boolean
  onToggleListPane?: () => void

  // 元信息条
  metaLeft?: ReactNode
  metaRight?: ReactNode

  disabled?: boolean
  className?: string
  children: ReactNode
  t: (key: string) => string
}

export function EditorShell({
  title,
  onTitleChange,
  titlePlaceholder,
  onClose,
  closeDisabled,
  closeLabel,
  draftSaved,
  lastSavedAt,
  saving,
  isPublished,
  onTogglePublished,
  publishedLabel,
  draftLabel,
  onSave,
  saveDisabled,
  saveLabel,
  savingLabel,
  onPreview,
  previewLabel,
  isImmersiveMode,
  onToggleImmersive,
  immersiveLabel,
  listPaneCollapsed,
  onToggleListPane,
  metaLeft,
  metaRight,
  disabled,
  className,
  children,
  t,
}: EditorShellProps) {
  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-4 overflow-hidden', className)}>
      {/* 顶栏 */}
      <fieldset
        disabled={disabled}
        className="flex shrink-0 items-center justify-between gap-4 border-0 border-b border-border px-3 py-2.5"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {onToggleListPane ? (
            <AdminButton
              onClick={onToggleListPane}
              adminVariant="outlineMuted"
              size="sm"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
              title={listPaneCollapsed ? t('admin.expand_list') : t('admin.collapse_list')}
              aria-label={listPaneCollapsed ? t('admin.expand_list') : t('admin.collapse_list')}
            >
              {listPaneCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
            </AdminButton>
          ) : null}
          <AdminButton
            onClick={onClose}
            disabled={closeDisabled}
            adminVariant="outlineMuted"
            size="sm"
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-md"
            title={closeLabel || t('admin.close_editor')}
            aria-label={closeLabel || t('admin.close_editor')}
          >
            <X className="h-3.5 w-3.5" />
          </AdminButton>
          <div className="hidden h-5 w-px shrink-0 bg-border sm:block" />
          <input
            type="text"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder={titlePlaceholder}
            className="min-w-0 flex-1 border-0 border-b border-border/40 bg-transparent px-0 py-1 font-serif text-xl font-light leading-none tracking-tight shadow-none transition-colors placeholder:font-serif placeholder:text-muted-foreground/35 hover:border-foreground/25 focus:border-primary focus-visible:ring-0 md:text-2xl"
          />
          {draftSaved ? (
            <span className="hidden shrink-0 items-center gap-1 rounded border border-green-500/25 bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600 sm:flex dark:text-green-400">
              <Check className="h-3 w-3" />
              {t('story.draft_saved')}
            </span>
          ) : null}
          {!draftSaved && lastSavedAt ? (
            <span className="hidden shrink-0 items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70 sm:flex">
              <Clock className="h-3 w-3" />
              {new Date(lastSavedAt).toLocaleTimeString()}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <div className="flex shrink-0 items-center gap-2">
            <AdminButton
              onClick={onTogglePublished}
              adminVariant="switch"
              data-state={isPublished ? 'checked' : 'unchecked'}
              title={isPublished ? draftLabel : publishedLabel}
              aria-label={isPublished ? draftLabel : publishedLabel}
            >
              <span
                className={cn(
                  'absolute left-0.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform duration-200',
                  isPublished ? 'translate-x-[20px]' : 'translate-x-0',
                )}
              />
            </AdminButton>
            <span
              className={cn(
                'text-[10px] font-bold uppercase tracking-widest transition-colors',
                isPublished ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {isPublished ? publishedLabel : draftLabel}
            </span>
          </div>
          {onPreview ? (
            <AdminButton
              onClick={onPreview}
              adminVariant="outline"
              className="flex h-8 shrink-0 items-center gap-2 rounded-md border border-border/80 bg-card px-2.5 text-[10px] shadow-none transition-all hover:bg-accent hover:text-accent-foreground"
            >
              <Eye className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{previewLabel || t('admin.preview')}</span>
            </AdminButton>
          ) : null}
          {onToggleImmersive ? (
            <AdminButton
              onClick={onToggleImmersive}
              adminVariant="outline"
              className="flex h-8 shrink-0 items-center gap-2 rounded-md border border-border/80 bg-card px-2.5 text-[10px] shadow-none transition-all hover:bg-accent hover:text-accent-foreground"
              title={isImmersiveMode ? `${immersiveLabel || t('ui.immersive')} (Esc)` : immersiveLabel || t('ui.immersive')}
              aria-pressed={isImmersiveMode}
            >
              {isImmersiveMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              <span className="hidden md:inline">{immersiveLabel || t('ui.immersive')}</span>
            </AdminButton>
          ) : null}
          <AdminButton
            onClick={onSave}
            disabled={saveDisabled}
            adminVariant="primary"
            size="md"
            className="flex h-9 shrink-0 items-center gap-2 rounded-md px-3.5 shadow-none"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{saving ? savingLabel : saveLabel}</span>
          </AdminButton>
        </div>
      </fieldset>

      {/* 元信息条 */}
      {(metaLeft || metaRight) ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-5 gap-y-2 px-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">{metaLeft}</div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">{metaRight}</div>
        </div>
      ) : null}

      {/* 内容区：编辑器 + 素材面板 */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  )
}
