'use client'

import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

/**
 * Master-detail 可折叠左栏（叙事/博客/草稿共用）。
 * 展开态：面板头 = header 插槽（子页签导航），收起/展开控制已移至编辑器顶栏（EditorShell）；
 * 折叠后默认收为 w-14 窄条保留展开入口；编辑态（showCollapsedRail=false）下不再渲染窄条，
 * 因为展开入口已在编辑器顶栏，避免重复。
 * 折叠状态由父级持久化到 localStorage。
 */
export const LIST_PANE_COLLAPSED_KEY = 'mo-gallery:journal:list-pane-collapsed'

interface CollapsibleListPaneProps {
  collapsed: boolean
  onToggle: () => void
  t: (key: string) => string
  header?: ReactNode
  children: ReactNode
  /** 折叠后是否保留 w-14 展开窄条；编辑态传 false（展开入口在 EditorShell 顶栏） */
  showCollapsedRail?: boolean
}

export function CollapsibleListPane({ collapsed, onToggle, t, header, children, showCollapsedRail = true }: CollapsibleListPaneProps) {
  if (collapsed) {
    // 保留挂载以维持列表内部状态（搜索/滚动），仅视觉隐藏
    if (!showCollapsedRail) {
      return <div className="hidden">{children}</div>
    }
    return (
      <aside className="flex w-14 shrink-0 flex-col items-center overflow-hidden border-r border-border pt-2">
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
      {/* 面板头：子页签导航（收起/展开控制已移至编辑器顶栏，见 EditorShell） */}
      <div className="flex shrink-0 items-center gap-1.5 px-2 pb-2 pt-2">{header}</div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </aside>
  )
}
