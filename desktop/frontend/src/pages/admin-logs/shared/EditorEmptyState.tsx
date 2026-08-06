'use client'

import { Plus, type LucideIcon } from 'lucide-react'
import { AdminButton } from '@/components/admin/AdminButton'

/**
 * Master-detail 右栏空状态：未选中任何文章时的引导视图。
 */
interface EditorEmptyStateProps {
  icon: LucideIcon
  title: string
  hint?: string
  actionLabel?: string
  onAction?: () => void
}

export function EditorEmptyState({ icon: Icon, title, hint, actionLabel, onAction }: EditorEmptyStateProps) {
  return (
    <div
      className="flex h-full min-h-0 flex-col items-center justify-center rounded-lg border border-dashed px-4 py-16 text-center"
      style={{
        borderColor: 'var(--border)',
        backgroundColor: 'color-mix(in srgb, var(--card) 50%, transparent)',
      }}
    >
      <div
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)' }}
      >
        <Icon className="h-6 w-6" style={{ color: 'var(--muted-foreground)' }} />
      </div>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      {hint && (
        <p className="mb-5 max-w-sm text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>
          {hint}
        </p>
      )}
      {actionLabel && onAction && (
        <AdminButton
          onClick={onAction}
          adminVariant="outline"
          size="sm"
          className="flex items-center gap-1.5 rounded-md"
        >
          <Plus className="h-3.5 w-3.5" />
          {actionLabel}
        </AdminButton>
      )}
    </div>
  )
}
