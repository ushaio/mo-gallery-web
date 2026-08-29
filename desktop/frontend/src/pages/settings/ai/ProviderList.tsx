// 系统设置 · 模型配置左栏：模型源列表 + 默认模型选择

import { Plus, Server } from 'lucide-react'
import { SelectDropdown } from '@/components/ui/SelectDropdown'
import { btnOutline } from '../shared'
import { isProviderConfigured, toModelId, type AiConfig, type AiProviderConfig } from './config'

function buildModelOptions(aiConfig: AiConfig, providerIds: string[], key: 'models' | 'image_models') {
  return providerIds.flatMap(providerId => (
    aiConfig.providers[providerId][key]
      .filter(model => model.trim())
      .map(model => ({ value: toModelId(providerId, model.trim()), label: `${providerId} / ${model.trim()}` }))
  ))
}

export function ProviderList({ aiConfig, providerIds, selectedId, onSelect, onAdd, onDefaultModelChange, onDefaultImageModelChange }: {
  aiConfig: AiConfig
  providerIds: string[]
  selectedId: string | null
  onSelect: (providerId: string) => void
  onAdd: () => void
  onDefaultModelChange: (value: string) => void
  onDefaultImageModelChange: (value: string) => void
}) {
  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r bg-card" style={{ borderColor: 'var(--border)' }}>
      <div className="flex h-9 shrink-0 items-center justify-between border-b px-3" style={{ borderColor: 'var(--border)' }}>
        <span className="text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>模型源</span>
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] tabular-nums" style={{ color: 'var(--foreground)' }}>{providerIds.length}</span>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
        {providerIds.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <span className="flex size-10 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--muted)' }}>
              <Server size={18} style={{ color: 'var(--muted-foreground)' }} />
            </span>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>暂无模型源，点击下方添加</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {providerIds.map(providerId => (
              <ProviderListItem
                key={providerId}
                id={providerId}
                provider={aiConfig.providers[providerId]}
                selected={selectedId === providerId}
                isDefault={
                  aiConfig.default_model.startsWith(`${providerId}:`) ||
                  aiConfig.default_image_model.startsWith(`${providerId}:`)
                }
                onClick={() => onSelect(providerId)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-3 border-t p-3" style={{ borderColor: 'var(--border)' }}>
        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-[10px] font-medium" style={{ color: 'var(--muted-foreground)' }}>默认对话模型</label>
            <SelectDropdown
              value={aiConfig.default_model}
              options={buildModelOptions(aiConfig, providerIds, 'models')}
              onChange={value => onDefaultModelChange(String(value))}
              placeholder="请选择对话模型"
              clearLabel="未设置默认模型"
              emptyText="请先添加模型"
              ariaLabel="默认对话模型"
              placement="top"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium" style={{ color: 'var(--muted-foreground)' }}>默认图片模型</label>
            <SelectDropdown
              value={aiConfig.default_image_model}
              options={buildModelOptions(aiConfig, providerIds, 'image_models')}
              onChange={value => onDefaultImageModelChange(String(value))}
              placeholder="请选择图片模型"
              clearLabel="未设置默认图片模型"
              emptyText="请先标记图片生成模型"
              ariaLabel="默认图片生成模型"
              placement="top"
            />
          </div>
        </div>
        <button onClick={onAdd} className={`${btnOutline} w-full justify-center`}>
          <Plus size={14} /> 添加模型源
        </button>
      </div>
    </aside>
  )
}

function ProviderListItem({ id, provider, selected, isDefault, onClick }: {
  id: string
  provider: AiProviderConfig
  selected: boolean
  isDefault: boolean
  onClick: () => void
}) {
  const configured = isProviderConfigured(provider)
  const modelCount = provider.models.filter(model => model.trim()).length
  return (
    <button onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${selected ? '' : 'hover:bg-secondary'}`}
      style={{ backgroundColor: selected ? 'var(--accent)' : 'transparent' }}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md"
        style={{ backgroundColor: selected ? 'color-mix(in srgb, var(--accent-foreground) 14%, transparent)' : 'var(--muted)' }}>
        <Server size={14} style={{ color: selected ? 'var(--accent-foreground)' : 'var(--muted-foreground)' }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium" style={{ color: selected ? 'var(--accent-foreground)' : 'var(--foreground)' }}>{id}</span>
          {isDefault && (
            <span className="shrink-0 rounded px-1 py-px text-[9px] font-medium"
              style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary)' }}>默认</span>
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[10px]"
          style={{ color: selected ? 'color-mix(in srgb, var(--accent-foreground) 72%, transparent)' : 'var(--muted-foreground)' }}>
          <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: configured ? '#4f9d69' : 'var(--muted-foreground)' }} />
          {configured ? `${modelCount} 个模型` : '未配置'}
        </span>
      </span>
    </button>
  )
}
