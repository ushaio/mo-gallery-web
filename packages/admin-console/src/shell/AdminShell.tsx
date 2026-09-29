'use client'

import type { ReactNode } from 'react'

import type { AdminCapabilities, AdminNavItem } from '../adapters'
import { AdminRail, isCapabilityAvailable } from './AdminRail'
import { AdminTopbar } from './AdminTopbar'

export interface AdminShellProps {
  /** 导航配置由宿主提供：菜单差异（web 有存储整理、official 没有）就落在这一处。 */
  nav: AdminNavItem[]
  /** 当前选中项 id（链接模式可传当前路由推导出的 id） */
  activeId?: string
  /** 单页 tab 模式：选中回调；不给则按 `AdminNavItem.href` 渲染链接 */
  onSelectNav?: (id: string) => void
  /** 端能力表：`AdminNavItem.capability` 命中的能力缺席时该项自动隐藏 */
  capabilities?: AdminCapabilities

  /* ---- 结构状态（由宿主持有，便于持久化到 localStorage / 路由） ---- */
  collapsed?: boolean
  onToggleCollapse?: () => void
  mobileOpen?: boolean
  /** 窄屏打开侧栏抽屉（提供后顶栏自己渲染 ☰，宿主不必再补按钮） */
  onOpenMobile?: () => void
  onCloseMobile?: () => void

  /* ---- 插槽：端特有 UI 一律走插槽，永远不需要改共享包 ---- */
  /** 品牌区（不传用内置品牌） */
  brand?: ReactNode
  /** 品牌区目标地址；传 `null` 表示品牌不可点（例如它就是当前页面标题） */
  brandHref?: string | null
  /** 侧栏导航的 aria-label（宿主可传自己的 i18n 文案） */
  railLabel?: string
  /** 整块自定义顶栏；传了就不再渲染内置顶栏 */
  topbar?: ReactNode
  /** 顶栏右侧动作区（主题/语言/退出等） */
  topbarActions?: ReactNode
  /** 侧栏顶部（站点标题、返回前台入口等） */
  railHeader?: ReactNode
  /** 侧栏底部（当前用户、主题切换等） */
  railFooter?: ReactNode
  /** 内容区上方通栏横幅（如代登录提示条） */
  banner?: ReactNode
  /** 内容区下方（页脚） */
  footer?: ReactNode
  /** 浮层挂载点（弹窗、上传进度浮窗等固定定位 UI） */
  overlay?: ReactNode

  className?: string
  contentClassName?: string
  children: ReactNode
}

/**
 * 后台管理台外壳。
 *
 * 「一次改动两端生效」的边界就在这个文件与其样式里：外壳、设计令牌、原子件
 * 放在 shared，改一次 `pnpm sync` 后 web 与 official 同时生效；端特有的菜单、
 * 面板、取数与全局状态分别落在 `nav` / `children` / 插槽 / 宿主自身，不受同步影响。
 */
export function AdminShell({
  nav,
  activeId,
  onSelectNav,
  capabilities,
  collapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  onOpenMobile,
  onCloseMobile,
  brand,
  brandHref,
  railLabel,
  topbar,
  topbarActions,
  railHeader,
  railFooter,
  banner,
  footer,
  overlay,
  className,
  contentClassName,
  children,
}: AdminShellProps) {
  const visibleNav = nav.filter((item) => isCapabilityAvailable(item, capabilities))
  const rootClassName = [
    'mgac',
    collapsed ? 'is-collapsed' : '',
    mobileOpen ? 'is-mobile-open' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={rootClassName}>
      <AdminRail
        items={visibleNav}
        activeId={activeId}
        onSelectNav={onSelectNav}
        onNavigate={mobileOpen ? onCloseMobile : undefined}
        header={railHeader}
        footer={railFooter}
        ariaLabel={railLabel}
      />

      {/* 移动端遮罩：仅在小屏且侧栏展开时可见（样式控制） */}
      {onCloseMobile ? (
        <button
          type="button"
          className="mgac-scrim"
          aria-label="关闭侧栏"
          tabIndex={-1}
          onClick={onCloseMobile}
        />
      ) : null}

      <div className="mgac-main">
        {topbar ?? (
          <AdminTopbar
            brand={brand}
            brandHref={brandHref}
            actions={topbarActions}
            collapsed={collapsed}
            onToggleCollapse={onToggleCollapse}
            onOpenMobile={onOpenMobile}
            onCloseMobile={onCloseMobile}
            mobileOpen={mobileOpen}
          />
        )}
        {banner}
        <div className={['mgac-content', contentClassName ?? ''].filter(Boolean).join(' ')}>
          {children}
        </div>
        {footer}
      </div>

      {overlay}
    </div>
  )
}
