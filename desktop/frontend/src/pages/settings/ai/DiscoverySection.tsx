// 系统设置 · 服务发现结果：候选模型 chips + 搜索 + 全部添加

import { useState } from 'react'
import { Check, ListPlus, Plus, Search } from 'lucide-react'
import { inputClass, inputStyle } from '../shared'
import type { AiProviderConfig } from './config'

export function DiscoverySection({ provider, candidates, onAddModels }: {
  provider: AiProviderConfig
  candidates: string[]
  onAddModels: (names: string[]) => void
}) {
  const [query, setQuery] = useState('')
  if (candidates.length === 0) return null

  const isAdded = (candidate: string) => provider.models.some(model => model.trim() === candidate)
  // 服务发现结果中尚未加入清单的模型
  const missingCount = candidates.filter(candidate => !isAdded(candidate)).length
  const keyword = query.trim().toLowerCase()
  const visibleCandidates = keyword
    ? candidates.filter(candidate => candidate.toLowerCase().includes(keyword))
    : candidates

  return (
    <div className="rounded-md border border-dashed p-3" style={{ borderColor: 'var(--border)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>
          服务发现 · {candidates.length} 个模型
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="搜索模型" spellCheck={false}
              className={`${inputClass} h-6 w-40 pl-7 text-[11px]`} style={inputStyle}
              aria-label="搜索发现的模型" />
          </div>
          {missingCount > 0 && (
            <button onClick={() => onAddModels(candidates)}
              className="flex h-6 items-center gap-1 rounded px-2 text-[10px] font-medium transition-colors hover:bg-secondary"
              style={{ color: 'var(--primary)' }}
              title={`添加剩余 ${missingCount} 个模型`}>
              <ListPlus size={12} /> 全部添加
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {visibleCandidates.map(candidate => isAdded(candidate) ? (
          <span key={candidate}
            className="inline-flex h-6 max-w-full items-center gap-1 rounded border px-2 font-mono text-[10px]"
            style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
            <Check size={11} className="shrink-0" />
            <span className="truncate">{candidate}</span>
          </span>
        ) : (
          <button key={candidate} onClick={() => onAddModels([candidate])}
            className="inline-flex h-6 max-w-full items-center gap-1 rounded border px-2 font-mono text-[10px] transition-colors hover:bg-secondary"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
            title={`添加模型 ${candidate}`}>
            <Plus size={11} className="shrink-0" />
            <span className="truncate">{candidate}</span>
          </button>
        ))}
        {visibleCandidates.length === 0 && (
          <p className="py-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>没有匹配的模型</p>
        )}
      </div>
    </div>
  )
}
