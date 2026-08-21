import type { ReactNode } from 'react'

interface LibrarySelectionBarProps {
  children: ReactNode
  countLabel?: string
  className?: string
}

/**
 * 资源库通用浮动选中栏「内层」表面。外层定位（云端 sticky / 本地 absolute）
 * 由调用方各自提供，因为两端布局模型不同；此处只统一卡片表面。
 * i18n 无关：countLabel 由调用方拼接后传入。
 */
export function LibrarySelectionBar({
  children,
  countLabel,
  className,
}: LibrarySelectionBarProps) {
  return (
    <div
      className={`pointer-events-auto flex items-center gap-0.5 rounded-lg border px-1.5 py-1.5 shadow-lg ${className ?? ''}`}
      style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
    >
      {countLabel && (
        <>
          <span className="whitespace-nowrap px-2 text-xs font-medium">
            {countLabel}
          </span>
          <div className="mx-0.5 h-4 w-px" style={{ backgroundColor: 'var(--border)' }} />
        </>
      )}
      {children}
    </div>
  )
}
