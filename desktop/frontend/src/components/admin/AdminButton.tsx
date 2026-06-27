'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const adminButtonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        unstyled: '',
        primary:
          'bg-primary text-primary-foreground hover:opacity-90 text-xs font-bold uppercase tracking-widest',
        primarySoft:
          'bg-primary/10 text-primary hover:bg-primary/20 text-xs font-bold uppercase tracking-widest',
        outline:
          'border border-border text-foreground hover:bg-muted text-xs font-bold uppercase tracking-widest',
        outlineMuted:
          'border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 text-[10px] font-bold uppercase tracking-widest',
        ghost:
          'text-muted-foreground hover:text-foreground hover:bg-muted text-xs font-bold uppercase tracking-widest',
        link:
          'text-muted-foreground hover:text-primary hover:underline text-xs font-bold uppercase tracking-widest',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs font-bold uppercase tracking-widest',
        destructiveOutline:
          'border border-destructive/20 text-destructive hover:bg-destructive/10 text-xs font-bold uppercase tracking-widest',
        tab:
          'border-b-2 transition-colors text-xs font-bold uppercase tracking-[0.2em] data-[state=active]:border-primary data-[state=active]:text-primary data-[state=inactive]:border-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground',
        icon: 'p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted',
        iconPrimary:
          'p-2 rounded-md text-muted-foreground hover:text-primary hover:bg-muted',
        iconDestructive:
          'p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted',
        iconOnDark:
          'p-1.5 rounded bg-black/60 text-white hover:text-amber-400',
        iconOnDarkDanger:
          'p-1.5 rounded bg-black/60 text-white hover:text-destructive',
        iconAccent: 'p-1.5 rounded bg-amber-500 text-white hover:bg-amber-600',
        switch:
          'relative inline-flex h-5 w-10 items-center rounded-full transition-colors data-[state=on]:bg-primary data-[state=off]:bg-muted',
        plain: 'text-sm font-medium',
        subtle: 'text-xs font-medium text-muted-foreground hover:text-foreground',
      },
      size: {
        none: '',
        xs: 'px-2 py-1',
        sm: 'px-3 py-1.5',
        md: 'px-4 py-2',
        lg: 'px-6 py-2',
        xl: 'px-6 py-3',
      },
    },
    defaultVariants: {
      variant: 'unstyled',
      size: 'none',
    },
  }
)

type AdminButtonVariantProps = VariantProps<typeof adminButtonVariants>

export type AdminButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  'variant'
> &
  Omit<AdminButtonVariantProps, 'variant'> & {
    adminVariant?: AdminButtonVariantProps['variant']
    'data-state'?: 'active' | 'inactive' | 'on' | 'off' | 'checked' | 'unchecked'
  }

export function AdminButton({
  adminVariant,
  size,
  className,
  'data-state': dataState,
  ...props
}: AdminButtonProps) {
  const resolvedDataState =
    adminVariant === 'tab'
      ? (dataState ?? 'inactive')
      : adminVariant === 'switch'
        ? (dataState === 'checked' || dataState === 'on' ? 'on' : 'off')
        : undefined
  return (
    <Button
      data-state={resolvedDataState}
      className={cn(
        adminButtonVariants({ variant: adminVariant, size }),
        className
      )}
      {...props}
    />
  )
}

export { adminButtonVariants }