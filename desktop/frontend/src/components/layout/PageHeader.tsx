import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex h-16 shrink-0 items-center justify-between border-b px-6"
      style={{ borderColor: 'var(--border)' }}>
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {description && (
          <p style={{ color: 'var(--muted-foreground)' }}>
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
