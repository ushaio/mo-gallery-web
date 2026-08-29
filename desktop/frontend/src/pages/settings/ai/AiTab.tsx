// 系统设置 · 模型配置（AI 模型源）：左栏模型源列表 + 右栏连接 / 模型清单 / 服务发现

import { useState } from 'react'
import { Plus, Sparkles } from 'lucide-react'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { Skeleton } from '@/components/admin/Skeleton'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import { ConnectionSection } from './ConnectionSection'
import { DiscoverySection } from './DiscoverySection'
import { ModelTable } from './ModelTable'
import { ProviderDetailHeader } from './ProviderDetailHeader'
import { ProviderList } from './ProviderList'
import { useAiConfig } from './useAiConfig'

export function AiTab() {
  const { language } = usePreferences()
  const ai = useAiConfig()
  const [deleteProviderId, setDeleteProviderId] = useState<string | null>(null)
  // 新建的模型源标识：详情头部据此自动进入重命名态
  const [createdProviderId, setCreatedProviderId] = useState<string | null>(null)

  const { aiConfig, providerIds, selectedId } = ai
  const provider = selectedId ? aiConfig.providers[selectedId] : null

  const handleAddProvider = () => setCreatedProviderId(ai.addProvider())

  // 手动切换模型源后不再自动进入重命名态
  const handleSelectProvider = (providerId: string) => {
    setCreatedProviderId(null)
    ai.selectProvider(providerId)
  }

  if (ai.loading) return <AiTabSkeleton />

  return (
    <div className="flex h-full min-h-0">
      <ProviderList
        aiConfig={aiConfig}
        providerIds={providerIds}
        selectedId={selectedId}
        onSelect={handleSelectProvider}
        onAdd={handleAddProvider}
        onDefaultModelChange={ai.setDefaultModel}
        onDefaultImageModelChange={ai.setDefaultImageModel}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!provider || !selectedId ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6" style={{ color: 'var(--muted-foreground)' }}>
            <span className="flex size-14 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--muted)' }}>
              <Sparkles size={24} />
            </span>
            <p className="text-sm">暂无模型源，请先添加</p>
            <button onClick={handleAddProvider}
              className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-secondary"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              <Plus size={14} /> 添加模型源
            </button>
          </div>
        ) : (
          <>
            <ProviderDetailHeader
              key={selectedId}
              providerId={selectedId}
              provider={provider}
              isDefault={
                aiConfig.default_model.startsWith(`${selectedId}:`) ||
                aiConfig.default_image_model.startsWith(`${selectedId}:`)
              }
              dirty={ai.dirty}
              saving={ai.saving}
              fetching={ai.fetchingProvider === selectedId}
              autoEdit={createdProviderId === selectedId}
              onRename={nextId => ai.renameProvider(selectedId, nextId)}
              onFetchModels={() => void ai.fetchModels(selectedId)}
              onRequestDelete={() => setDeleteProviderId(selectedId)}
              onSave={() => void ai.save()}
            />

            <div className="custom-scrollbar min-h-0 flex-1 overflow-auto">
              <div className="mx-auto max-w-3xl space-y-8 px-6 py-6">
                <ConnectionSection
                  key={selectedId}
                  provider={provider}
                  catalogProviders={ai.catalogProviders}
                  catalogStatus={ai.catalogStatus}
                  onChange={patch => ai.updateProvider(selectedId, patch)}
                  onCatalogProviderChange={value => ai.setCatalogProvider(selectedId, value)}
                  onRefreshCatalog={() => void ai.refreshCatalog()}
                />

                <div className="space-y-4">
                  <ModelTable
                    providerId={selectedId}
                    provider={provider}
                    aiConfig={aiConfig}
                    specs={ai.specs}
                    autoFilling={ai.autoFilling}
                    catalogAvailable={ai.catalogStatus?.available === true}
                    handlers={{
                      onModelChange: (index, value) => ai.updateModel(selectedId, index, value),
                      onModelCommit: model => ai.commitModelName(selectedId, model),
                      onContextWindowChange: (model, rawValue) => ai.updateContextWindow(selectedId, model, rawValue),
                      onToggleCapability: (model, capability, enabled) => ai.toggleCapability(selectedId, model, capability, enabled),
                      onRemoveModel: index => ai.removeModel(selectedId, index),
                      onRestoreAuto: model => void ai.restoreModelAuto(selectedId, model),
                      onAddModel: () => ai.addModel(selectedId),
                      onRefill: () => void ai.refillFromCatalog(selectedId),
                    }}
                  />
                  <DiscoverySection
                    key={selectedId}
                    provider={provider}
                    candidates={ai.candidates}
                    onAddModels={names => ai.addModels(selectedId, names)}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <SimpleDeleteDialog
        isOpen={!!deleteProviderId}
        title="删除模型源"
        message={deleteProviderId ? `确定要删除模型源「${deleteProviderId}」吗？其模型配置与默认模型选择将一并移除。` : ''}
        onConfirm={() => {
          if (deleteProviderId) ai.removeProvider(deleteProviderId)
          setDeleteProviderId(null)
        }}
        onCancel={() => setDeleteProviderId(null)}
        t={(key) => t(key, language)}
      />
    </div>
  )
}

function AiTabSkeleton() {
  return (
    <div className="flex h-full min-h-0">
      <aside className="w-64 shrink-0 space-y-2 border-r p-3" style={{ borderColor: 'var(--border)' }}>
        <div className="h-5 w-16 animate-pulse rounded" style={{ backgroundColor: 'var(--muted)' }} />
        {[0, 1, 2].map(index => (
          <div key={index} className="h-12 animate-pulse rounded-md" style={{ backgroundColor: 'var(--muted)' }} />
        ))}
      </aside>
      <div className="min-w-0 flex-1 space-y-5 p-6">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  )
}
