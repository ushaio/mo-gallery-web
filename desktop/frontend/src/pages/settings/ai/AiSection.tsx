// 目录式小节：大字距标签 + 说明，细线分隔替代卡片容器

export function AiSection({ label, description, action, children }: {
  label: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--foreground)' }}>{label}</h3>
          {description && <p className="mt-1 text-[11px] leading-5" style={{ color: 'var(--muted-foreground)' }}>{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}
