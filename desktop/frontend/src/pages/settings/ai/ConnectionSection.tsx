// 系统设置 · 模型配置：连接（OpenAI 兼容端点的地址与 Key）+ 官方参数来源

import { useState } from 'react'
import { Eye, EyeOff, RefreshCw } from 'lucide-react'
import { SelectDropdown } from '@/components/ui/SelectDropdown'
import { Field, inputClass, inputStyle } from '../shared'
import { AiSection } from './AiSection'
import { formatCatalogTimestamp, type CatalogProviderOption, type CatalogStatus } from './catalog'
import type { AiProviderConfig } from './config'

export function ConnectionSection({ provider, catalogProviders, catalogStatus, onChange, onCatalogProviderChange, onRefreshCatalog }: {
  provider: AiProviderConfig
  catalogProviders: CatalogProviderOption[]
  catalogStatus: CatalogStatus | null
  onChange: (patch: Partial<AiProviderConfig>) => void
  onCatalogProviderChange: (catalogProviderId: string) => void
  onRefreshCatalog: () => void
}) {
  const [showKey, setShowKey] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const catalogOptions = catalogProviders.map(item => ({
    value: item.id,
    label: `${item.name}（${item.modelCount}）`,
  }))

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await Promise.resolve(onRefreshCatalog())
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <AiSection label="连接" description="OpenAI 兼容端点。填写 API 地址与 Key 后，可通过右上角「获取模型」验证连接并拉取可用模型列表。">
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="API 地址" description="如 https://api.openai.com/v1">
          <input type="text" value={provider.base_url} spellCheck={false}
            onChange={e => onChange({ base_url: e.target.value })}
            className={`${inputClass} font-mono`} style={inputStyle} />
        </Field>
        <Field label="API Key">
          <div className="relative">
            <input type={showKey ? 'text' : 'password'} value={provider.api_key}
              onChange={e => onChange({ api_key: e.target.value })}
              className={`${inputClass} pr-9`} style={inputStyle} />
            <button type="button" onClick={() => setShowKey(prev => !prev)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 transition-colors"
              style={{ color: 'var(--muted-foreground)' }} aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}>
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>
      </div>

      <Field
        label="官方参数来源"
        description="留空时按 API 地址自动判断。聚合站/代理端点建议手动指定，可显著提高模型参数匹配准确度。"
      >
        <div className="flex items-center gap-2">
          <SelectDropdown
            value={provider.catalog_provider}
            options={catalogOptions}
            onChange={value => onCatalogProviderChange(String(value))}
            placeholder="自动判断"
            clearLabel="自动判断"
            emptyText="模型目录不可用"
            ariaLabel="models.dev 官方参数来源"
            className="flex-1"
          />
          <button type="button" onClick={() => void handleRefresh()} disabled={refreshing}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors hover:bg-secondary disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
            title="重新拉取 models.dev 模型目录">
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : undefined} />
            刷新目录
          </button>
        </div>
        <CatalogStatusLine status={catalogStatus} />
      </Field>
    </AiSection>
  )
}

function CatalogStatusLine({ status }: { status: CatalogStatus | null }) {
  if (!status) return null

  if (!status.available) {
    return (
      <p className="mt-1 text-[11px]" style={{ color: '#b45309' }}>
        模型目录不可用{status.error ? `：${status.error}` : ''}，参数需手动填写
      </p>
    )
  }

  const fetchedAt = formatCatalogTimestamp(status.fetchedAt)
  return (
    <p className="mt-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
      目录含 {status.modelCount} 个模型 / {status.providerCount} 个来源
      {fetchedAt ? ` · 更新于 ${fetchedAt}` : ''}
      {status.stale ? ' · 缓存已过期，刷新可获取最新' : ''}
      {status.warning ? ` · ${status.warning}` : ''}
    </p>
  )
}
