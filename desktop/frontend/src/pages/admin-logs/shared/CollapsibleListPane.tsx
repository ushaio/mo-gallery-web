'use client'

import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react'

/**
 * Master-detail 可折叠左栏（叙事/博客/草稿共用）。
 * 折叠样式遵循 desktop 端惯例（参考本地资源库分区标题）：
 * 面板头 = 折叠箭头 + header 插槽（子页签导航），hover 高亮；
 * 折叠后收为 w-14 窄条，保留展开入口。
 * 折叠状态由父级持久化到 localStorage。
 */
export const LIST_PANE_COLLAPSED_KEY = 'mo-gallery:journal:list-pane-collapsed'

interface CollapsibleListPaneProps {
  collapsed: boolean
  onToggle: () => void
  icon: LucideIcon
  t: (key: string) => string
  header?: ReactNode
  children: ReactNode
}

export function CollapsibleListPane({ collapsed, onToggle, icon: Icon, t, header, children }: CollapsibleListPaneProps) {
  if (collapsed) {
    return (
      <aside className="flex w-14 shrink-0 flex-col items-center overflow-hidden border-r border-border pt-2">
        {/* 保留挂载以维持列表内部状态（搜索/滚动），仅视觉隐藏 */}
        <div className="hidden w-full">{children}</div>
        <button
          type="button"
          onClick={onToggle}
          title={t('admin.expand_list')}
          aria-label={t('admin.expand_list')}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          <ChevronRight size={14} />
        </button>
      </aside>
    )
  }

  return (
    <aside className="flex w-[300px] min-w-0 shrink-0 flex-col overflow-hidden border-r border-border xl:w-[340px]">
      {/* 面板头：折叠箭头 + 子页签导航 */}
      <div className="flex shrink-0 items-center gap-1.5 px-2 pb-2 pt-2">
        <button
          type="button"
          onClick={onToggle}
          title={t('admin.collapse_list')}
          aria-label={t('admin.collapse_list')}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          <ChevronLeft size={13} />
        </button>
        {header ? (
          header
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>
            <Icon size={12} className="shrink-0" />
            <span className="truncate">{t('admin.article_list')}</span>
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </aside>
  )
}
