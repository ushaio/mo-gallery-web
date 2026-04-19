'use client'

import { ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { AdminButton } from '@/components/admin/AdminButton'
import { cn } from '@/lib/utils'

interface AdminCollectionToolbarProps {
  info: ReactNode
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  actions?: ReactNode
  endActions?: ReactNode
  filters?: ReactNode
  activeFilters?: ReactNode
  searchMaxWidthClassName?: string
}

export function AdminCollectionToolbar({
  info,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  actions,
  endActions,
  filters,
  activeFilters,
  searchMaxWidthClassName = 'max-w-md',
}: AdminCollectionToolbarProps) {
  return (
    <div className="bg-muted/30 border border-border rounded-lg p-4">
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex items-center gap-3 shrink-0">
          {info}
        </div>

        <div className={cn('flex-1', searchMaxWidthClassName)}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full h-9 pl-9 pr-4 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
            {searchValue && (
              <AdminButton
                onClick={() => onSearchChange('')}
                adminVariant="unstyled"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </AdminButton>
            )}
          </div>
        </div>

        {actions ? (
          <div className="flex items-center gap-2 shrink-0">
            {actions}
          </div>
        ) : null}

        {endActions ? (
          <div className="flex items-center shrink-0 md:ml-auto">
            {endActions}
          </div>
        ) : null}
      </div>

      {filters ? (
        <div className="mt-4 pt-4 border-t border-border">
          {filters}
        </div>
      ) : null}

      {activeFilters ? activeFilters : null}
    </div>
  )
}
