'use client'

import type { ReactNode } from 'react'

import type { AdminNavItem } from '../adapters'
import { useAdminRuntime } from '../runtime/AdminRuntimeProvider'

/** 能力判定：宿主未实现（键不存在/null/false/空对象）即视为缺席。 */
export function isCapabilityAvailable(
  item: AdminNavItem,
  capabilities?: Record<string, unknown>,
): boolean {
  if (!item.capability) return true
  const value = capabilities?.[item.capability]
  if (value === undefined || value === null || value === false) return false
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
    return false
  }
  return true
}

export interface AdminRailProps {
  items: AdminNavItem[]
  activeId?: string
  onSelectNav?: (id: string) => void
  onNavigate?: () => void
  header?: ReactNode
  footer?: ReactNode
  ariaLabel?: string
}

export function AdminRail({
  items,
  activeId,
  onSelectNav,
  onNavigate,
  header,
  footer,
  ariaLabel = '后台导航',
}: AdminRailProps) {
  const { adapter, labels } = useAdminRuntime()

  return (
    <aside className="mgac-rail">
      {header ? <div className="mgac-rail-head">{header}</div> : null}

      <nav className="mgac-rail-nav" aria-label={ariaLabel}>
        {items.map((item) => {
          const isActive = activeId === item.id
          const showCount = !item.hideCount && item.count !== null && item.count !== undefined
          const inner = (
            <>
              {item.icon ? <span className="mgac-rail-icon">{item.icon}</span> : null}
              <span className="mgac-rail-label">
                <strong>{item.label}</strong>
                {item.description ? <small>{item.description}</small> : null}
              </span>
              {showCount ? <span className="mgac-rail-count">{item.count}</span> : null}
            </>
          )
          const className = `mgac-rail-item${isActive ? ' is-active' : ''}`
          const title = item.description ? `${item.label} · ${item.description}` : item.label

          // 单页 tab 模式：宿主给 onSelectNav，外壳渲染按钮并回调 id。
          if (onSelectNav) {
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={title}
                className={className}
                onClick={() => {
                  onSelectNav(item.id)
                  onNavigate?.()
                }}
              >
                {inner}
              </button>
            )
          }

          // 链接模式：宿主给 href，路由实现由 renderLink 注入（缺省回落原生 <a>）。
          const href = item.href ?? '#'
          const linkProps = {
            href,
            className,
            title,
            'aria-current': isActive ? ('page' as const) : undefined,
            onClick: onNavigate,
          }
          if (adapter.renderLink) {
            return <span key={item.id}>{adapter.renderLink({ ...linkProps, children: inner })}</span>
          }
          return (
            <a key={item.id} {...linkProps}>
              {inner}
            </a>
          )
        })}
      </nav>

      <div className="mgac-rail-foot">
        {footer ?? (
          <>
            <span>{labels.admin}</span>
            <span className="mgac-online">
              <i />
              {labels.online}
            </span>
          </>
        )}
      </div>
    </aside>
  )
}
