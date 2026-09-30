'use client'

import type { ReactNode } from 'react'

import { useConsoleRuntime } from '../runtime/ConsoleRuntimeProvider'

export interface ConsoleTopbarProps {
  /** 左侧品牌区；不传则用内置品牌（含 ADMIN 标签） */
  brand?: ReactNode
  /** 品牌区目标地址；传 `null` 表示品牌不可点（例如它就是当前页面标题） */
  brandHref?: string | null
  /** 右侧动作区（主题/语言切换、返回前台入口等由宿主传） */
  actions?: ReactNode
  collapsed?: boolean
  onToggleCollapse?: () => void
  /** 窄屏打开侧栏抽屉；提供后外壳自己渲染打开入口（宿主不必再补按钮） */
  onOpenMobile?: () => void
  /** 窄屏关闭侧栏抽屉；与 `mobileOpen` 一起决定渲染打开还是关闭入口 */
  onCloseMobile?: () => void
  mobileOpen?: boolean
}

export function ConsoleTopbar({
  brand,
  brandHref = '/',
  actions,
  collapsed,
  onToggleCollapse,
  onOpenMobile,
  onCloseMobile,
  mobileOpen = false,
}: ConsoleTopbarProps) {
  const { adapter, labels } = useConsoleRuntime()
  const user = adapter.user
  const brandNode = brand ?? (
    <span className="mgac-brand">
      Emulsion
      <span className="mgac-brand-tag">{labels.admin}</span>
    </span>
  )

  const brandContent =
    brandHref === null ? (
      <span className="mgac-top-brand">{brandNode}</span>
    ) : adapter.renderLink ? (
      // 品牌区同样走宿主链接渲染器：共享包不直接依赖 next/link
      <span className="mgac-top-brand">
        {adapter.renderLink({
          href: brandHref,
          className: 'mgac-top-brand-link',
          children: brandNode,
        })}
      </span>
    ) : (
      <a className="mgac-top-brand" href={brandHref}>
        {brandNode}
      </a>
    )

  return (
    <header className="mgac-top">
      <div className="mgac-top-left">
        {/* 窄屏：抽屉关闭时给打开入口，打开时给关闭入口（两者都只在窄屏出现） */}
        {onOpenMobile && !mobileOpen ? (
          <button
            type="button"
            className="mgac-icon-btn mgac-only-mobile"
            onClick={onOpenMobile}
            aria-label={labels.openRail}
            title={labels.openRail}
          >
            ☰
          </button>
        ) : null}
        {onCloseMobile && mobileOpen ? (
          <button
            type="button"
            className="mgac-icon-btn mgac-only-mobile"
            onClick={onCloseMobile}
            aria-label={labels.closeRail}
            title={labels.closeRail}
          >
            ✕
          </button>
        ) : null}
        {onToggleCollapse ? (
          <button
            type="button"
            className="mgac-icon-btn mgac-only-desktop"
            onClick={onToggleCollapse}
            aria-label={labels.toggleRail}
            aria-expanded={!collapsed}
            title={labels.toggleRail}
          >
            ☰
          </button>
        ) : null}
        {brandContent}
      </div>

      <div className="mgac-top-right">
        {actions}
        {user?.username ? (
          <div
            className="mgac-user-badge"
            title={`${labels.currentUser}：${user.displayName ?? user.username} (${user.role ?? 'ADMIN'})`}
          >
            <span className="mgac-user-avatar" aria-hidden="true" />
            <span className="mgac-user-name">{user.displayName ?? user.username}</span>
          </div>
        ) : null}
      </div>
    </header>
  )
}
