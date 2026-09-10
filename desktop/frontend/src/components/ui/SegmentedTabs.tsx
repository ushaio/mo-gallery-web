'use client'

import type { ComponentType, KeyboardEvent, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * 分段式多页签控件（系统设置「主题」同款视觉）：
 * - 容器为圆角描边条，选中项以 accent 填充；
 * - semantic="tabs" 渲染 tablist/tab 语义（roving tabindex）；
 *   semantic="radio" 渲染 radiogroup/radio 语义（设置项互斥选择）；
 * - size="md" 用于设置表单行，size="sm" 用于工具栏 / 面板头等紧凑场景；
 * - itemAttributes / onItemKeyDown 供宿主透传自动化定位属性与键盘导航。
 */

export interface SegmentedTabOption<T extends string = string> {
  value: T
  label: string
  icon?: ComponentType<{ size?: number; className?: string }>
  /** 标签右侧附加节点；传入函数时以选中态作为参数（如随选中变色的徽标） */
  trailing?: ReactNode | ((active: boolean) => ReactNode)
  title?: string
}

interface SegmentedTabsProps<T extends string = string> {
  value: T
  options: SegmentedTabOption<T>[]
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  semantic?: 'tabs' | 'radio'
  /** 按钮是否平分容器宽度（默认 true；工具栏内联场景传 false） */
  fill?: boolean
  ariaLabel?: string
  className?: string
  itemAttributes?: (value: T) => Record<string, string>
  onItemKeyDown?: (event: KeyboardEvent<HTMLButtonElement>, value: T) => void
}

export function SegmentedTabs<T extends string = string>({
  value,
  options,
  onChange,
  size = 'md',
  semantic = 'tabs',
  fill = true,
  ariaLabel,
  className,
  itemAttributes,
  onItemKeyDown,
}: SegmentedTabsProps<T>) {
  const isLarge = size === 'md'
  return (
    <div
      role={semantic === 'radio' ? 'radiogroup' : 'tablist'}
      aria-label={ariaLabel}
      className={cn(
        'flex items-center rounded-md border bg-background p-0.5',
        isLarge ? 'h-10' : 'h-8',
        className,
      )}
    >
      {options.map(({ value: optionValue, label, icon: Icon, trailing, title }) => {
        const active = optionValue === value
        return (
          <button
            key={optionValue}
            type="button"
            role={semantic === 'radio' ? 'radio' : 'tab'}
            {...(semantic === 'radio'
              ? { 'aria-checked': active }
              : { 'aria-selected': active, tabIndex: active ? 0 : -1 })}
            onClick={() => onChange(optionValue)}
            onKeyDown={onItemKeyDown
              ? (event) => onItemKeyDown(event, optionValue)
              : undefined}
            title={title}
            {...itemAttributes?.(optionValue)}
            className={cn(
              'flex min-w-0 items-center justify-center rounded font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              isLarge ? 'h-8 gap-2 px-3 text-xs' : 'h-7 gap-1.5 px-2.5 text-[11px]',
              fill && 'min-w-0 flex-1',
            )}
            style={{
              backgroundColor: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
            }}
          >
            {Icon ? <Icon size={isLarge ? 14 : 12} className="shrink-0" /> : null}
            <span className="truncate">{label}</span>
            {typeof trailing === 'function' ? trailing(active) : trailing}
          </button>
        )
      })}
    </div>
  )
}
