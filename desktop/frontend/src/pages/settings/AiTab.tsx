// 系统设置 · 模型配置（AI 模型源）

import { useState, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { useCachedPageEffect } from '@/hooks/useCachedPageEffect'
import { useDataRevision } from '@/hooks/useDataRevision'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { Skeleton } from '@/components/admin/Skeleton'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import { SelectDropdown } from '@/components/ui/SelectDropdown'
import {
  GetAiConfig,
  GetStoryAiProviderModels,
  UpdateAiConfig,
} from '../../../wailsjs/go/main/App'
import { config as wailsConfig } from '../../../wailsjs/go/models'
import {
  Save,
  Loader2,
  Server,
  RefreshCw,
  Pencil,
  Trash2,
  Plus,
  X,
  Check,
  Sparkles,
  Eye,
  EyeOff,
  Search,
  Wrench,
  Braces,
  Star,
  ListPlus,
  Image as ImageIcon,
} from 'lucide-react'
import { getErrorMessage, inputClass, inputStyle, btnPrimary, btnOutline, STATUS_COLORS, Field, isRecord } from './shared'

// 模型能力清单列头（与模型行中的开关顺序一一对应；激活态统一使用主题主色）
const AI_CAPABILITY_COLUMNS = [
  { label: '视觉理解', icon: Eye },
  { label: '工具调用', icon: Wrench },
  { label: '结构化输出', icon: Braces },
  { label: '图片生成', icon: ImageIcon },
]

interface AiProviderConfig {
  base_url: string
  api_key: string
  models: string[]
  image_models: string[]
  vision_models: string[]
  tool_models: string[]
  structured_output_models: string[]
  context_windows: Record<string, number>
}

interface AiConfig {
  default_model: string
  default_image_model: string
  providers: Record<string, AiProviderConfig>
}

const emptyAiProvider: AiProviderConfig = {
  base_url: '',
  api_key: '',
  models: [''],
  image_models: [],
  vision_models: [],
  tool_models: [],
  structured_output_models: [],
  context_windows: {},
}

function normalizeModelNames(models: string[]): string[] {
  return [...new Set(models.map(model => model.trim()).filter(Boolean))]
}

const DEFAULT_AI_MODEL_CONTEXT_WINDOW = 8192
const INFERRED_AI_MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-5.5': 272000,
}

function inferAiModelContextWindow(model: string): number {
  return INFERRED_AI_MODEL_CONTEXT_WINDOWS[model.trim().toLowerCase()]
    ?? DEFAULT_AI_MODEL_CONTEXT_WINDOW
}

function formatContextWindow(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function getStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function getContextWindows(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => (
    typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0
  )))
}
function normalizeAiConfig(value: unknown): AiConfig {
  const config = isRecord(value) ? value : {}
  const rawProviders = isRecord(config.providers) ? config.providers : {}
  return {
    default_model: getString(config.default_model) || getString(config.model),
    default_image_model: getString(config.default_image_model),
    providers: Object.fromEntries(Object.entries(rawProviders).map(([id, value]) => {
      const provider = isRecord(value) ? value : {}
      const models = getStringList(provider.models)
      return [id, {
        base_url: getString(provider.base_url),
        api_key: getString(provider.api_key),
        models: models.length > 0 ? models : [''],
        image_models: getStringList(provider.image_models),
        vision_models: getStringList(provider.vision_models),
        tool_models: getStringList(provider.tool_models),
        structured_output_models: getStringList(provider.structured_output_models),
        context_windows: getContextWindows(provider.context_windows),
      }]
    })),
  }
}

function buildAiConfigPayload(aiConfig: AiConfig): AiConfig {
  const providers: Record<string, AiProviderConfig> = {}
  for (const [providerId, provider] of Object.entries(aiConfig.providers)) {
    const id = providerId.trim()
    if (!id) continue
    const models = normalizeModelNames(provider.models)
    const configuredModels = new Set(models)
    providers[id] = {
      ...provider,
      models,
      image_models: normalizeModelNames(provider.image_models).filter(model => configuredModels.has(model)),
      vision_models: normalizeModelNames(provider.vision_models).filter(model => configuredModels.has(model)),
      tool_models: normalizeModelNames(provider.tool_models).filter(model => configuredModels.has(model)),
      structured_output_models: normalizeModelNames(provider.structured_output_models).filter(model => configuredModels.has(model)),
      context_windows: Object.fromEntries(Object.entries(provider.context_windows).filter(([model, size]) => (
        configuredModels.has(model) && Number.isFinite(size) && size > 0
      ))),
    }
  }
  const chatModelIds = new Set(Object.entries(providers).flatMap(([providerId, provider]) => (
    provider.models.map(model => `${providerId}:${model}`)
  )))
  const imageModelIds = new Set(Object.entries(providers).flatMap(([providerId, provider]) => (
    provider.image_models.map(model => `${providerId}:${model}`)
  )))
  return {
    ...aiConfig,
    default_model: chatModelIds.has(aiConfig.default_model) ? aiConfig.default_model : '',
    default_image_model: imageModelIds.has(aiConfig.default_image_model) ? aiConfig.default_image_model : '',
    providers,
  }
}

const AI_SELECTED_PROVIDER_KEY = 'mo-gallery:ai:selected-provider'

function readSelectedAiProvider(): string | null {
  try {
    return window.localStorage.getItem(AI_SELECTED_PROVIDER_KEY)
  } catch {
    return null
  }
}

export function AiTab() {
  const { language } = usePreferences()
  const [aiConfig, setAiConfig] = useState<AiConfig>({ default_model: '', default_image_model: '', providers: {} })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [fetchingProvider, setFetchingProvider] = useState<string | null>(null)
  const [modelCandidates, setModelCandidates] = useState<Record<string, string[]>>({})
  const [candidateQuery, setCandidateQuery] = useState('')
  const [deleteProviderId, setDeleteProviderId] = useState<string | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<string | null>(readSelectedAiProvider())
  const [editingId, setEditingId] = useState(false)
  const [idDraft, setIdDraft] = useState('')
  const cancelEditRef = useRef(false)
  // 最近一次加载/保存的规范化配置快照，用于脏状态判断
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)

  const aiConfigRevision = useDataRevision('settings')
  useCachedPageEffect(() => {
    setLoading(true)
    void GetAiConfig()
      .then(result => {
        const normalized = normalizeAiConfig(result)
        setAiConfig(normalized)
        setSavedSnapshot(JSON.stringify(buildAiConfigPayload(normalized)))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [aiConfigRevision])

  const dirty = useMemo(() => (
    savedSnapshot !== null && JSON.stringify(buildAiConfigPayload(aiConfig)) !== savedSnapshot
  ), [aiConfig, savedSnapshot])

  const providerIds = Object.keys(aiConfig.providers).sort()
  // 选中项跟随数据变化：删除/重命名后自动回退到第一个可用模型源
  const selectedId = selectedProvider && aiConfig.providers[selectedProvider]
    ? selectedProvider
    : providerIds[0] ?? null

  // 选中模型源持久化（与胶卷页视图偏好一致：跨页面/重启保留）
  useEffect(() => {
    try {
      if (selectedId) window.localStorage.setItem(AI_SELECTED_PROVIDER_KEY, selectedId)
      else window.localStorage.removeItem(AI_SELECTED_PROVIDER_KEY)
    } catch {
      // localStorage 不可用时忽略
    }
  }, [selectedId])

  // 切换模型源时退出标识编辑态，并清空服务发现搜索词
  useEffect(() => {
    setEditingId(false)
    setCandidateQuery('')
  }, [selectedId])
  const defaultOptions = providerIds.flatMap(providerId => (
    aiConfig.providers[providerId].models
      .filter(model => model.trim())
      .map(model => ({ value: `${providerId}:${model.trim()}`, label: `${providerId} / ${model.trim()}` }))
  ))
  const defaultImageOptions = providerIds.flatMap(providerId => (
    aiConfig.providers[providerId].image_models
      .filter(model => model.trim())
      .map(model => ({ value: `${providerId}:${model.trim()}`, label: `${providerId} / ${model.trim()}` }))
  ))

  const updateProvider = (providerId: string, patch: Partial<AiProviderConfig>) => {
    setAiConfig(prev => ({
      ...prev,
      providers: {
        ...prev.providers,
        [providerId]: { ...prev.providers[providerId], ...patch },
      },
    }))
  }

  const updateProviderId = (oldId: string, nextId: string) => {
    const id = nextId.trim()
    if (!id || id === oldId || aiConfig.providers[id]) return
    setAiConfig(prev => {
      const { [oldId]: provider, ...rest } = prev.providers
      const defaultModel = prev.default_model.startsWith(`${oldId}:`)
        ? `${id}:${prev.default_model.slice(oldId.length + 1)}`
        : prev.default_model
      const defaultImageModel = prev.default_image_model.startsWith(`${oldId}:`)
        ? `${id}:${prev.default_image_model.slice(oldId.length + 1)}`
        : prev.default_image_model
      return {
        ...prev,
        default_model: defaultModel,
        default_image_model: defaultImageModel,
        providers: { ...rest, [id]: provider },
      }
    })
    setModelCandidates(prev => {
      const { [oldId]: candidates, ...rest } = prev
      return candidates ? { ...rest, [id]: candidates } : rest
    })
  }

  const addProvider = () => {
    let index = providerIds.length + 1
    let providerId = `provider${index}`
    while (aiConfig.providers[providerId]) {
      index += 1
      providerId = `provider${index}`
    }
    setAiConfig(prev => ({
      ...prev,
      providers: {
        ...prev.providers,
        [providerId]: {
          ...emptyAiProvider,
          models: [''],
          image_models: [],
          vision_models: [],
          tool_models: [],
          structured_output_models: [],
          context_windows: {},
        },
      },
    }))
    // 新建后自动选中并进入标识编辑态，方便直接命名
    cancelEditRef.current = false
    setSelectedProvider(providerId)
    setIdDraft(providerId)
    setEditingId(true)
  }

  const commitProviderId = () => {
    setEditingId(false)
    if (cancelEditRef.current) {
      cancelEditRef.current = false
      return
    }
    if (!selectedId) return
    const next = idDraft.trim()
    if (!next || next === selectedId) return
    if (aiConfig.providers[next]) {
      toast.error('模型源标识已存在')
      return
    }
    updateProviderId(selectedId, next)
    setSelectedProvider(next)
  }

  const removeProvider = (providerId: string) => {
    setAiConfig(prev => {
      const providers = Object.fromEntries(Object.entries(prev.providers).filter(([id]) => id !== providerId))
      const default_model = prev.default_model.startsWith(`${providerId}:`) ? '' : prev.default_model
      const default_image_model = prev.default_image_model.startsWith(`${providerId}:`) ? '' : prev.default_image_model
      return { ...prev, default_model, default_image_model, providers }
    })
    setModelCandidates(prev => {
      const rest = Object.fromEntries(Object.entries(prev).filter(([id]) => id !== providerId))
      return rest
    })
    setDeleteProviderId(null)
  }

  const updateModel = (providerId: string, index: number, value: string) => {
    setAiConfig(prev => {
      const provider = prev.providers[providerId]
      const previousModel = provider.models[index].trim()
      const nextModel = value.trim()
      const models = provider.models.map((model, i) => i === index ? value : model)
      const renameCapabilityModel = (capabilityModels: string[]) => capabilityModels
        .map(model => model === previousModel ? nextModel : model)
        .filter(Boolean)
      const context_windows = { ...provider.context_windows }
      if (previousModel && previousModel !== nextModel && context_windows[previousModel] !== undefined) {
        const contextWindow = context_windows[previousModel]
        delete context_windows[previousModel]
        if (nextModel) context_windows[nextModel] = contextWindow
      }
      const previousId = `${providerId}:${previousModel}`
      const nextId = nextModel ? `${providerId}:${nextModel}` : ''
      return {
        ...prev,
        default_model: prev.default_model === previousId ? nextId : prev.default_model,
        default_image_model: prev.default_image_model === previousId ? nextId : prev.default_image_model,
        providers: {
          ...prev.providers,
          [providerId]: {
            ...provider,
            models,
            image_models: renameCapabilityModel(provider.image_models),
            vision_models: renameCapabilityModel(provider.vision_models),
            tool_models: renameCapabilityModel(provider.tool_models),
            structured_output_models: renameCapabilityModel(provider.structured_output_models),
            context_windows,
          },
        },
      }
    })
  }

  const updateContextWindow = (providerId: string, model: string, rawValue: string) => {
    const modelName = model.trim()
    if (!modelName) return

    setAiConfig(prev => {
      const provider = prev.providers[providerId]
      const context_windows = { ...provider.context_windows }
      const value = rawValue.trim()

      if (!value) {
        delete context_windows[modelName]
      } else {
        const parsed = Number(value)
        if (!Number.isFinite(parsed) || parsed <= 0) return prev
        context_windows[modelName] = Math.floor(parsed)
      }

      return {
        ...prev,
        providers: {
          ...prev.providers,
          [providerId]: { ...provider, context_windows },
        },
      }
    })
  }

  const addModel = (providerId: string) => {
    const provider = aiConfig.providers[providerId]
    updateProvider(providerId, { models: [...provider.models, ''] })
  }

  // 从服务发现结果添加指定模型（已存在时忽略；顺带清理空白行）
  const addModelWithName = (providerId: string, name: string) => {
    const provider = aiConfig.providers[providerId]
    const trimmed = name.trim()
    if (!trimmed || provider.models.some(model => model.trim() === trimmed)) return
    updateProvider(providerId, { models: [...provider.models.filter(model => model.trim()), trimmed] })
  }

  const addAllModels = (providerId: string, names: string[]) => {
    const provider = aiConfig.providers[providerId]
    const existing = new Set(provider.models.map(model => model.trim()))
    const additions = names.map(name => name.trim()).filter(name => name && !existing.has(name))
    if (additions.length === 0) return
    updateProvider(providerId, { models: [...provider.models.filter(model => model.trim()), ...additions] })
  }

  const removeModel = (providerId: string, index: number) => {
    setAiConfig(prev => {
      const provider = prev.providers[providerId]
      const removed = provider.models[index].trim()
      const models = provider.models.filter((_, i) => i !== index)
      const removedId = `${providerId}:${removed}`
      const context_windows = { ...provider.context_windows }
      delete context_windows[removed]
      return {
        ...prev,
        default_model: prev.default_model === removedId ? '' : prev.default_model,
        default_image_model: prev.default_image_model === removedId ? '' : prev.default_image_model,
        providers: {
          ...prev.providers,
          [providerId]: {
            ...provider,
            models: models.length > 0 ? models : [''],
            image_models: provider.image_models.filter(model => model !== removed),
            vision_models: provider.vision_models.filter(model => model !== removed),
            tool_models: provider.tool_models.filter(model => model !== removed),
            structured_output_models: provider.structured_output_models.filter(model => model !== removed),
            context_windows,
          },
        },
      }
    })
  }

  const toggleImageModel = (providerId: string, model: string, enabled: boolean) => {
    const modelName = model.trim()
    if (!modelName) return
    setAiConfig(prev => {
      const provider = prev.providers[providerId]
      const image_models = enabled
        ? normalizeModelNames([...provider.image_models, modelName])
        : provider.image_models.filter(item => item !== modelName)
      const modelId = `${providerId}:${modelName}`
      return {
        ...prev,
        default_image_model: enabled && !prev.default_image_model
          ? modelId
          : (!enabled && prev.default_image_model === modelId ? '' : prev.default_image_model),
        providers: {
          ...prev.providers,
          [providerId]: { ...provider, image_models },
        },
      }
    })
  }

  const toggleCapabilityModel = (
    providerId: string,
    model: string,
    capability: 'vision_models' | 'tool_models' | 'structured_output_models',
    enabled: boolean,
  ) => {
    const modelName = model.trim()
    if (!modelName) return
    setAiConfig(prev => {
      const provider = prev.providers[providerId]
      const capabilityModels = enabled
        ? normalizeModelNames([...provider[capability], modelName])
        : provider[capability].filter(item => item !== modelName)
      return {
        ...prev,
        providers: {
          ...prev.providers,
          [providerId]: { ...provider, [capability]: capabilityModels },
        },
      }
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = buildAiConfigPayload(aiConfig)
      await UpdateAiConfig(wailsConfig.AIConfig.createFrom(payload))
      setSavedSnapshot(JSON.stringify(payload))
      toast.success('配置已保存')
    } catch (error: unknown) {
      toast.error('保存失败: ' + getErrorMessage(error))
    } finally { setSaving(false) }
  }

  const handleFetchModels = async (providerId: string) => {
    const provider = aiConfig.providers[providerId]
    if (!provider?.base_url || !provider?.api_key) {
      toast.error('请先填写 API 地址和 Key')
      return
    }
    setFetchingProvider(providerId)
    try {
      await UpdateAiConfig(wailsConfig.AIConfig.createFrom(buildAiConfigPayload(aiConfig)))
      const result = await GetStoryAiProviderModels(providerId)
      const list = result?.models
        ?.map(model => model.model || String(model.id || '').split(':').slice(1).join(':'))
        .filter(Boolean) || []
      setModelCandidates(prev => ({ ...prev, [providerId]: list }))
      toast.success(`获取到 ${list.length} 个模型`)
    } catch (error: unknown) {
      toast.error('获取模型失败: ' + getErrorMessage(error))
    } finally { setFetchingProvider(null) }
  }

  if (loading) {
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

  const provider = selectedId ? aiConfig.providers[selectedId] : null
  const showKey = selectedId ? showKeys[selectedId] === true : false
  const candidates = selectedId ? (modelCandidates[selectedId] || []) : []
  const configured = Boolean(provider && provider.base_url.trim() && provider.api_key.trim())
  // 服务发现结果中尚未加入清单的模型
  const discoveredMissing = provider
    ? candidates.filter(candidate => !provider.models.some(model => model.trim() === candidate))
    : []
  // 服务发现搜索过滤
  const discoveryQuery = candidateQuery.trim().toLowerCase()
  const visibleCandidates = discoveryQuery
    ? candidates.filter(candidate => candidate.toLowerCase().includes(discoveryQuery))
    : candidates

  return (
    <div className="flex h-full min-h-0">
      {/* ── 左侧：模型源列表（master-detail 主列表） ── */}
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
                  onClick={() => setSelectedProvider(providerId)}
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
                options={defaultOptions}
                onChange={value => setAiConfig(prev => ({ ...prev, default_model: String(value) }))}
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
                options={defaultImageOptions}
                onChange={value => setAiConfig(prev => ({ ...prev, default_image_model: String(value) }))}
                placeholder="请选择图片模型"
                clearLabel="未设置默认图片模型"
                emptyText="请先标记图片生成模型"
                ariaLabel="默认图片生成模型"
                placement="top"
              />
            </div>
          </div>
          <button onClick={addProvider} className={`${btnOutline} w-full justify-center`}>
            <Plus size={14} /> 添加模型源
          </button>
        </div>
      </aside>

      {/* ── 右侧：模型源详情 ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!provider || !selectedId ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6" style={{ color: 'var(--muted-foreground)' }}>
            <span className="flex size-14 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--muted)' }}>
              <Sparkles size={24} />
            </span>
            <p className="text-sm">暂无模型源，请先添加</p>
            <button onClick={addProvider}
              className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-secondary"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              <Plus size={14} /> 添加模型源
            </button>
          </div>
        ) : (
          <>
            {/* 详情头部 */}
            <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-6" style={{ borderColor: 'var(--border)' }}>
              <div className="min-w-0">
                {editingId ? (
                  <input
                    autoFocus
                    value={idDraft}
                    onChange={e => setIdDraft(e.target.value)}
                    onBlur={commitProviderId}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitProviderId()
                      if (e.key === 'Escape') {
                        cancelEditRef.current = true
                        setEditingId(false)
                      }
                    }}
                    className={`${inputClass} h-7 w-52 font-medium`}
                    style={inputStyle}
                    aria-label="模型源标识"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-serif text-base font-medium" style={{ color: 'var(--foreground)' }}>{selectedId}</h2>
                    <button
                      onClick={() => { cancelEditRef.current = false; setIdDraft(selectedId); setEditingId(true) }}
                      className="rounded p-1 transition-colors hover:bg-secondary"
                      style={{ color: 'var(--muted-foreground)' }}
                      aria-label="重命名模型源"
                    >
                      <Pencil size={13} />
                    </button>
                    {(aiConfig.default_model.startsWith(`${selectedId}:`) || aiConfig.default_image_model.startsWith(`${selectedId}:`)) && (
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
                        style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary)' }}>
                        默认
                      </span>
                    )}
                  </div>
                )}
                <p className="mt-0.5 flex items-center text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                  <span className="truncate">{provider.base_url || '未配置 API 地址'}</span>
                  <span className="mx-1.5">·</span>
                  <span className="shrink-0">{configured ? '已连接' : '未配置'}</span>
                  {dirty && (
                    <span className="ml-1.5 inline-flex shrink-0 items-center gap-1" style={{ color: STATUS_COLORS.amber.fg }}>
                      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
                      未保存更改
                    </span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={() => handleFetchModels(selectedId)} disabled={fetchingProvider === selectedId}
                  className={btnOutline} title="保存当前配置，并从该模型源拉取可用模型列表">
                  {fetchingProvider === selectedId ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  获取模型
                </button>
                <button onClick={() => setDeleteProviderId(selectedId)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:bg-secondary"
                  style={{ borderColor: 'var(--border)', color: 'var(--destructive)' }}
                  aria-label={`删除模型源 ${selectedId}`}>
                  <Trash2 size={14} />
                </button>
                <button onClick={handleSave} disabled={!dirty || saving}
                  className={btnPrimary}
                  style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={14} />}
                  {saving ? '保存中...' : dirty ? '保存更改' : '已保存'}
                </button>
              </div>
            </header>

            {/* 详情内容 */}
            <div className="custom-scrollbar min-h-0 flex-1 overflow-auto">
              <div className="mx-auto max-w-3xl space-y-8 px-6 py-6">
                <AiSection label="连接" description="OpenAI 兼容端点。填写 API 地址与 Key 后，可通过右上角「获取模型」验证连接并拉取可用模型列表。">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Field label="API 地址" description="如 https://api.openai.com/v1">
                      <input type="text" value={provider.base_url} spellCheck={false}
                        onChange={e => updateProvider(selectedId, { base_url: e.target.value })}
                        className={`${inputClass} font-mono`} style={inputStyle} />
                    </Field>
                    <Field label="API Key">
                      <div className="relative">
                        <input type={showKey ? 'text' : 'password'} value={provider.api_key}
                          onChange={e => updateProvider(selectedId, { api_key: e.target.value })}
                          className={`${inputClass} pr-9`} style={inputStyle} />
                        <button type="button" onClick={() => setShowKeys(prev => ({ ...prev, [selectedId]: !showKey }))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 transition-colors"
                          style={{ color: 'var(--muted-foreground)' }} aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}>
                          {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </Field>
                  </div>
                </AiSection>

                <AiSection label="模型清单" description="逐项标记每个模型的能力；「上下文」留空时按型号自动推断，输入框占位符即生效值（tokens）。">
                  {/* 规格清单：一行一个型号，能力按列对齐，便于纵向扫读 */}
                  <div className="overflow-hidden rounded-md border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
                    <div className="grid grid-cols-[minmax(0,1fr)_24px_104px_repeat(4,30px)_28px] items-center gap-x-2 border-b px-3 py-2"
                      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)' }}>
                      <span className="text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>模型</span>
                      <span />
                      <span className="text-right text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>上下文</span>
                      {AI_CAPABILITY_COLUMNS.map(({ label, icon: Icon }) => (
                        <span key={label} className="flex justify-center" title={label}>
                          <Icon size={12} style={{ color: 'var(--muted-foreground)' }} />
                          <span className="sr-only">{label}</span>
                        </span>
                      ))}
                      <span className="sr-only">删除模型</span>
                    </div>
                    {provider.models.map((model, index) => {
                      const modelName = model.trim()
                      const modelId = `${selectedId}:${modelName}`
                      const isDefaultChat = Boolean(modelName) && aiConfig.default_model === modelId
                      const isDefaultImage = Boolean(modelName) && aiConfig.default_image_model === modelId
                      const supportsVision = Boolean(modelName) && provider.vision_models.includes(modelName)
                      const supportsTools = Boolean(modelName) && provider.tool_models.includes(modelName)
                      const supportsStructuredOutput = Boolean(modelName) && provider.structured_output_models.includes(modelName)
                      const supportsImage = Boolean(modelName) && provider.image_models.includes(modelName)
                      const configuredContextWindow = provider.context_windows[modelName]
                      const inferredContextWindow = inferAiModelContextWindow(modelName)
                      const effectiveContextWindow = configuredContextWindow ?? inferredContextWindow
                      return (
                        <div key={index}
                          className="grid grid-cols-[minmax(0,1fr)_24px_104px_repeat(4,30px)_28px] items-center gap-x-2 border-b px-3 py-2.5 last:border-b-0"
                          style={{ borderColor: 'var(--border)' }}>
                          <input value={model} onChange={e => updateModel(selectedId, index, e.target.value)}
                            placeholder="gpt-4o" spellCheck={false}
                            className={`${inputClass} font-mono`} style={inputStyle}
                            aria-label={`模型 ${index + 1} 名称`} />
                          <span className="flex items-center gap-0.5">
                            {isDefaultChat && (
                              <span title="默认对话模型">
                                <Star size={11} fill="currentColor" style={{ color: 'var(--primary)' }} />
                                <span className="sr-only">默认对话模型</span>
                              </span>
                            )}
                            {isDefaultImage && (
                              <span title="默认图片模型">
                                <ImageIcon size={11} fill="currentColor" style={{ color: 'var(--primary)' }} />
                                <span className="sr-only">默认图片模型</span>
                              </span>
                            )}
                          </span>
                          <input
                            type="number"
                            min={1}
                            step={1000}
                            value={configuredContextWindow ?? ''}
                            placeholder={formatContextWindow(inferredContextWindow)}
                            disabled={!modelName}
                            onChange={event => updateContextWindow(selectedId, model, event.target.value)}
                            aria-label={`${modelName || '未命名模型'} 上下文窗口 (tokens)`}
                            title={configuredContextWindow === undefined
                              ? `自动推断 ${formatContextWindow(effectiveContextWindow)} tokens`
                              : `自定义 ${formatContextWindow(effectiveContextWindow)} tokens`}
                            className={`${inputClass} pr-2 text-right tabular-nums disabled:opacity-40`}
                            style={inputStyle}
                          />
                          <CapabilityCell icon={Eye} label="视觉理解" active={supportsVision} disabled={!modelName}
                            onClick={() => toggleCapabilityModel(selectedId, model, 'vision_models', !supportsVision)} />
                          <CapabilityCell icon={Wrench} label="工具调用" active={supportsTools} disabled={!modelName}
                            onClick={() => toggleCapabilityModel(selectedId, model, 'tool_models', !supportsTools)} />
                          <CapabilityCell icon={Braces} label="结构化输出" active={supportsStructuredOutput} disabled={!modelName}
                            onClick={() => toggleCapabilityModel(selectedId, model, 'structured_output_models', !supportsStructuredOutput)} />
                          <CapabilityCell icon={ImageIcon} label="图片生成" active={supportsImage} disabled={!modelName}
                            onClick={() => toggleImageModel(selectedId, model, !supportsImage)} />
                          <button onClick={() => removeModel(selectedId, index)}
                            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-secondary"
                            style={{ color: 'var(--muted-foreground)' }}
                            aria-label={`删除模型 ${modelName || index + 1}`}>
                            <X size={13} />
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  <div className="mt-3">
                    <button onClick={() => addModel(selectedId)} className={btnOutline}>
                      <Plus size={14} /> 添加模型
                    </button>
                  </div>

                  {candidates.length > 0 && (
                    <div className="mt-4 rounded-md border border-dashed p-3" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>
                          服务发现 · {candidates.length} 个模型
                        </p>
                        <div className="flex shrink-0 items-center gap-2">
                          <div className="relative">
                            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
                            <input value={candidateQuery} onChange={e => setCandidateQuery(e.target.value)}
                              placeholder="搜索模型" spellCheck={false}
                              className={`${inputClass} h-6 w-40 pl-7 text-[11px]`} style={inputStyle}
                              aria-label="搜索发现的模型" />
                          </div>
                          {discoveredMissing.length > 0 && (
                            <button onClick={() => addAllModels(selectedId, candidates)}
                              className="flex h-6 items-center gap-1 rounded px-2 text-[10px] font-medium transition-colors hover:bg-secondary"
                              style={{ color: 'var(--primary)' }}>
                              <ListPlus size={12} /> 全部添加
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {visibleCandidates.map(candidate => {
                          const added = provider.models.some(model => model.trim() === candidate)
                          return added ? (
                            <span key={candidate}
                              className="inline-flex h-6 items-center gap-1 rounded border px-2 font-mono text-[10px]"
                              style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                              <Check size={11} /> {candidate}
                            </span>
                          ) : (
                            <button key={candidate} onClick={() => addModelWithName(selectedId, candidate)}
                              className="inline-flex h-6 items-center gap-1 rounded border px-2 font-mono text-[10px] transition-colors hover:bg-secondary"
                              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                              title={`添加模型 ${candidate}`}>
                              <Plus size={11} /> {candidate}
                            </button>
                          )
                        })}
                        {visibleCandidates.length === 0 && (
                          <p className="py-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>没有匹配的模型</p>
                        )}
                      </div>
                    </div>
                  )}
                </AiSection>

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
          if (deleteProviderId) removeProvider(deleteProviderId)
        }}
        onCancel={() => setDeleteProviderId(null)}
        t={(key) => t(key, language)}
      />
    </div>
  )
}

// ─── AiTab 辅助组件（桌面 master-detail 风格） ─────────

function ProviderListItem({ id, provider, selected, isDefault, onClick }: {
  id: string
  provider: AiProviderConfig
  selected: boolean
  isDefault: boolean
  onClick: () => void
}) {
  const configured = Boolean(provider.base_url.trim() && provider.api_key.trim())
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

// 目录式小节：大字距标签 + 说明，细线分隔替代卡片容器
function AiSection({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--foreground)' }}>{label}</h3>
        {description && <p className="mt-1 text-[11px] leading-5" style={{ color: 'var(--muted-foreground)' }}>{description}</p>}
      </div>
      {children}
    </section>
  )
}

// 能力开关单元格：激活态统一使用主题主色（浅色墨色 / 深色金），靠列对齐而非颜色区分能力
function CapabilityCell({ label, icon: Icon, active, disabled, onClick }: {
  label: string
  icon: typeof Eye
  active: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      aria-pressed={active}
      aria-label={`${label}${active ? '：已启用' : '：未启用'}`}
      title={label}
      className={`flex size-7 items-center justify-center rounded border transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none ${
        disabled ? 'cursor-not-allowed opacity-30' : active ? '' : 'opacity-45 hover:opacity-80'
      }`}
      style={active ? {
        borderColor: 'color-mix(in srgb, var(--primary) 40%, transparent)',
        backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)',
        color: 'var(--primary)',
      } : {
        borderColor: 'var(--border)',
        color: 'var(--muted-foreground)',
      }}>
      <Icon size={13} />
    </button>
  )
}
