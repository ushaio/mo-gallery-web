import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b shrink-0"
      style={{ borderColor: 'var(--border)' }}>
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {description && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
