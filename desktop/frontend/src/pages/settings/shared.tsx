// 系统设置 · 各标签页共享的表单样式与通用组件

export const inputStyle = {
  backgroundColor: 'var(--background)',
  borderColor: 'var(--border)',
  color: 'var(--foreground)',
}

// 桌面端统一的表单控件样式（与资源库、信息面板一致）
export const inputClass = 'h-8 w-full rounded-md border bg-input px-2.5 text-xs outline-none focus:ring-1 focus:ring-ring'
export const textareaClass = 'w-full rounded-md border bg-input px-2.5 py-2 text-xs outline-none focus:ring-1 focus:ring-ring resize-none'
export const btnPrimary = 'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50'
export const btnOutline = 'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-secondary disabled:opacity-50'

// 语义色（与桌面端状态点一致），深色/浅色主题均可读
export const STATUS_COLORS: Record<string, { fg: string; bg: string }> = {
  green: { fg: '#4f9d69', bg: 'color-mix(in srgb, #4f9d69 14%, transparent)' },
  red: { fg: 'var(--destructive)', bg: 'color-mix(in srgb, var(--destructive) 12%, transparent)' },
  amber: { fg: '#b45309', bg: 'color-mix(in srgb, #f59e0b 14%, transparent)' },
}

export function Badge({ children, tone, style: extraStyle }: {
  children: React.ReactNode
  tone?: keyof typeof STATUS_COLORS
  style?: React.CSSProperties
}) {
  const toneStyle = tone ? STATUS_COLORS[tone] : null
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]"
      style={{
        borderColor: toneStyle ? 'color-mix(in srgb, currentColor 30%, transparent)' : 'var(--border)',
        backgroundColor: toneStyle?.bg || 'var(--muted)',
        color: toneStyle?.fg || 'var(--muted-foreground)',
        ...extraStyle,
      }}>
      {children}
    </span>
  )
}

export function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
      <div className="mb-4">
        <h3 className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{title}</h3>
        {description && <p className="mt-1 text-[11px] leading-5" style={{ color: 'var(--muted-foreground)' }}>{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

export function Field({ label, description, children }: {
  label: string; description?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>
        {label}
      </label>
      {children}
      {description && (
        <p className="mt-1 text-[11px] leading-4" style={{ color: 'var(--muted-foreground)' }}>{description}</p>
      )}
    </div>
  )
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : 'Unknown error'
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
