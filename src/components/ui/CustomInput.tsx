'use client'

import React, { forwardRef } from 'react'
import { LucideIcon } from 'lucide-react'

type UiVariant = 'admin' | 'site'

interface CustomInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** 输入框变体：
   * - form: 表单样式（底部边框）
   * - search: 搜索样式（完整边框 + 背景色）
   * - config: 配置样式（完整边框 + 背景透明）
   */
  variant?: 'form' | 'search' | 'config'
  /** UI 外观：admin/site */
  uiVariant?: UiVariant
  /** 左侧图标 */
  icon?: LucideIcon
  /** 容器的额外类名 */
  containerClassName?: string
}

export const CustomInput = forwardRef<HTMLInputElement, CustomInputProps>(
  (
    {
      variant = 'form',
      uiVariant = 'admin',
      icon: Icon,
      containerClassName = '',
      className = '',
      ...props
    },
    ref
  ) => {
    const baseInputClass = 'outline-none transition-colors placeholder:text-muted-foreground/30'

    const adminVariantClasses = {
      form: 'w-full p-3 bg-background border-b border-border focus:border-primary text-sm rounded-none',
      search: 'w-full py-2 bg-muted/30 border border-border focus:border-primary text-xs font-mono',
      config: 'w-full p-3 bg-background border border-border focus:border-primary text-xs font-mono',
    } as const

    const siteVariantClasses = {
      form: 'w-full p-3 bg-background border border-border rounded-md focus:border-primary text-sm',
      search:
        'w-full bg-transparent border-none py-2 pl-6 sm:pl-8 text-ui placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0 font-serif',
      config: 'w-full p-3 bg-background border border-border rounded-md focus:border-primary text-sm',
    } as const

    const variantClasses = uiVariant === 'site' ? siteVariantClasses : adminVariantClasses
    const paddingClass =
      uiVariant === 'site' && variant === 'search'
        ? ''
        : Icon
          ? 'pl-10 pr-4'
          : 'px-3'

    const inputClass = `${baseInputClass} ${variantClasses[variant]} ${paddingClass} ${className}`

    if (Icon) {
      return (
        <div className={`relative ${containerClassName}`}>
          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input ref={ref} className={inputClass} {...props} />
        </div>
      )
    }

    return <input ref={ref} className={`${inputClass} ${containerClassName}`} {...props} />
  }
)

CustomInput.displayName = 'CustomInput'
