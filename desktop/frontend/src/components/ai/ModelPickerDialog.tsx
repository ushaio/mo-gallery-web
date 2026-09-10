import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Braces,
  Check,
  Eye,
  Image as ImageIcon,
  MessageSquareText,
  Search,
  Wrench,
  X,
} from 'lucide-react'
import type { StoryAiModelOption } from '@/lib/api/types'

type ModelPickerDialogProps = {
  open: boolean
  mode: 'chat' | 'image'
  models: StoryAiModelOption[]
  selectedModel: string
  onSelect: (modelId: string) => void
  onClose: () => void
}

function formatContextWindow(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'
  return `${new Intl.NumberFormat('en-US').format(value)} tokens`
}

function providerLabel(model: StoryAiModelOption): string {
  return model.provider?.trim() || 'Other'
}

function modelName(model: StoryAiModelOption): string {
  return model.model?.trim() || model.label
}

function Capability({ icon: Icon, children, active = true }: {
  icon: typeof Eye
  children: ReactNode
  active?: boolean
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
      style={{
        color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
        backgroundColor: active ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'var(--muted)',
        opacity: active ? 1 : 0.65,
      }}
    >
      <Icon size={11} />
      {children}
    </span>
  )
}

function ModelRow({ model, selected, mode, onSelect }: {
  model: StoryAiModelOption
  selected: boolean
  mode: 'chat' | 'image'
  onSelect: () => void
}) {
  const supportsImageOutput = model.capabilities?.includes('image') === true
  const inputLabels = model.vision ? '文本、图片' : '文本'
  const outputLabels = mode === 'image' || supportsImageOutput ? '图片' : '文本'

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
      style={{ borderColor: 'var(--border)', backgroundColor: selected ? 'color-mix(in srgb, var(--primary) 7%, transparent)' : 'transparent' }}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="break-all text-xs font-medium" style={{ color: 'var(--foreground)' }} title={model.label}>
            {model.label}
          </div>
          {modelName(model) !== model.label && (
            <div className="mt-0.5 break-all font-mono text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
              {modelName(model)}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Capability icon={MessageSquareText}>输入：{inputLabels}</Capability>
            <Capability icon={mode === 'image' ? ImageIcon : MessageSquareText}>输出：{outputLabels}</Capability>
            <Capability icon={Eye} active={model.vision}>视觉</Capability>
            <Capability icon={Wrench} active={model.tools}>工具调用</Capability>
            <Capability icon={Braces} active={model.structuredOutput}>结构化</Capability>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
            <span>上下文：{formatContextWindow(model.contextWindow)}</span>
            {model.model && <span>模型 ID：{model.model}</span>}
          </div>
        </div>
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: selected ? 'var(--primary)' : 'var(--border)', color: selected ? 'var(--primary)' : 'transparent' }}>
          <Check size={13} />
        </span>
      </div>
    </button>
  )
}

export function ModelPickerDialog({ open, mode, models, selectedModel, onSelect, onClose }: ModelPickerDialogProps) {
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    requestAnimationFrame(() => searchRef.current?.focus())
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  const groups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const filtered = models.filter(model => {
      if (!normalizedQuery) return true
      return [model.label, model.model, model.provider]
        .filter(Boolean)
        .some(value => value!.toLowerCase().includes(normalizedQuery))
    })
    const grouped = new Map<string, StoryAiModelOption[]>()
    for (const model of filtered) {
      const provider = providerLabel(model)
      const current = grouped.get(provider) || []
      current.push(model)
      grouped.set(provider, current)
    }
    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))
  }, [models, query])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 sm:p-6">
      <button type="button" aria-label="关闭模型选择" className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="model-picker-title" className="relative flex max-h-[min(80vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)', boxShadow: '0 10px 24px rgb(0 0 0 / 0.16)' }}>
        <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md" style={{ color: 'var(--primary)', backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)' }}>
            {mode === 'image' ? <ImageIcon size={16} /> : <MessageSquareText size={16} />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="model-picker-title" className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>选择{mode === 'image' ? '图片' : '对话'}模型</h2>
            <p className="mt-0.5 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>按供应商查看模型能力与配置参数</p>
          </div>
          <button type="button" onClick={onClose} className="flex size-7 items-center justify-center rounded transition-colors hover:bg-accent" style={{ color: 'var(--muted-foreground)' }} aria-label="关闭模型选择">
            <X size={15} />
          </button>
        </div>

        <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
            <input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索模型或供应商" className="h-9 w-full rounded-md border bg-transparent pl-9 pr-3 text-xs outline-none focus:ring-1 focus:ring-ring" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }} />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
          {groups.length === 0 ? (
            <div className="flex min-h-32 items-center justify-center px-6 text-xs" style={{ color: 'var(--muted-foreground)' }}>没有匹配的模型</div>
          ) : groups.map(([provider, providerModels]) => (
            <section key={provider}>
              <div className="sticky top-0 z-10 border-b px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)', backgroundColor: 'var(--muted)' }}>{provider}</div>
              {providerModels.map(model => (
                <ModelRow key={model.id} model={model} mode={mode} selected={model.id === selectedModel} onSelect={() => { onSelect(model.id); onClose() }} />
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
