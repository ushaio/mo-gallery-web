// 系统设置 · 模型配置状态（加载 / 脏值 / 保存 / 模型源与模型增删改）

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useCachedPageEffect } from '@/hooks/useCachedPageEffect'
import { useDataRevision } from '@/hooks/useDataRevision'
import {
  GetAiConfig,
  GetStoryAiProviderModels,
  UpdateAiConfig,
} from '../../../../wailsjs/go/main/App'
import { config as wailsConfig } from '../../../../wailsjs/go/models'
import { getErrorMessage } from '../shared'
import {
  fetchCatalog,
  lookupSpecs,
  specToCapabilities,
  type CatalogProviderOption,
  type CatalogStatus,
  type ModelSpec,
} from './catalog'
import {
  buildAiConfigPayload,
  createEmptyAiProvider,
  emptyAiConfig,
  isModelUnconfigured,
  normalizeAiConfig,
  readSelectedAiProvider,
  writeSelectedAiProvider,
  type AiCapabilityKey,
  type AiConfig,
  type AiProviderConfig,
} from './config'
import * as mutate from './mutations'

export function useAiConfig() {
  const [aiConfig, setAiConfig] = useState<AiConfig>(emptyAiConfig)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fetchingProvider, setFetchingProvider] = useState<string | null>(null)
  const [modelCandidates, setModelCandidates] = useState<Record<string, string[]>>({})
  const [selectedProvider, setSelectedProvider] = useState<string | null>(readSelectedAiProvider())
  // 最近一次加载/保存的规范化配置快照，用于脏状态判断
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)
  // models.dev 官方规格：模型源 → 模型名 → 规格。用于「自动/手动」标识与参考信息展示
  const [specs, setSpecs] = useState<Record<string, Record<string, ModelSpec>>>({})
  const [catalogProviders, setCatalogProviders] = useState<CatalogProviderOption[]>([])
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus | null>(null)
  const [autoFilling, setAutoFilling] = useState(false)
  // 已发起过查询的 `模型源:模型名`，避免对同一模型（含未命中的）重复请求
  const attemptedRef = useRef<Record<string, boolean>>({})

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

  // 目录概览随设置页加载一次；不可用时静默降级为纯手动配置
  useEffect(() => {
    let cancelled = false
    void fetchCatalog().then(({ providers, status }) => {
      if (cancelled) return
      setCatalogProviders(providers)
      setCatalogStatus(status)
    })
    return () => { cancelled = true }
  }, [])

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
    writeSelectedAiProvider(selectedId)
  }, [selectedId])

  const updateProvider = (providerId: string, patch: Partial<AiProviderConfig>) => {
    setAiConfig(prev => ({
      ...prev,
      providers: { ...prev.providers, [providerId]: { ...prev.providers[providerId], ...patch } },
    }))
  }

  /**
   * 自动填入：查询官方规格并写进配置。
   * `models` 省略时处理该模型源下全部模型；`overwrite` 为 true 时无视既有配置强制按目录填充
   * （用于「按目录重新填充」与单行「恢复自动」）。
   */
  const autoFillSpecs = async (providerId: string, models?: string[], overwrite = false): Promise<number> => {
    const provider = aiConfig.providers[providerId]
    if (!provider) return 0
    const targets = (models ?? provider.models).map(model => model.trim()).filter(Boolean)
    if (targets.length === 0) return 0

    setAutoFilling(true)
    try {
      const found = await lookupSpecs(provider, targets)
      if (found.size === 0) return 0

      // 记录规格供 UI 判定「自动/手动」与展示参考信息
      setSpecs(prev => ({
        ...prev,
        [providerId]: { ...(prev[providerId] ?? {}), ...Object.fromEntries(found) },
      }))

      setAiConfig(prev => {
        const current = prev.providers[providerId]
        if (!current) return prev
        const applicable = new Map<string, ReturnType<typeof specToCapabilities>>()
        for (const [model, spec] of found) {
          // 非强制模式下只填「尚未配置过」的模型，避免覆盖用户的手动修改
          if (!overwrite && !isModelUnconfigured(current, model)) continue
          applicable.set(model, specToCapabilities(spec))
        }
        if (applicable.size === 0) return prev
        return mutate.applySpecs(prev, providerId, applicable)
      })
      return found.size
    } finally {
      setAutoFilling(false)
    }
  }


  /**
   * 手动输入的模型名确认后自动填入官方参数（onBlur / Enter 触发）。
   * 不用防抖猜测输入结束：明确的确认动作比定时器可靠，也不会对中间态发请求。
   */
  const commitModelName = (providerId: string, model: string) => {
    const modelName = model.trim()
    if (!modelName) return
    const key = `${providerId}:${modelName}`
    if (attemptedRef.current[key] === true) return
    attemptedRef.current[key] = true
    void autoFillSpecs(providerId, [modelName])
  }

  const setDefaultModel = (value: string) => setAiConfig(prev => ({ ...prev, default_model: value }))
  const setDefaultImageModel = (value: string) => setAiConfig(prev => ({ ...prev, default_image_model: value }))

  /** 重命名模型源；标识为空/重复时返回 false，由调用方提示 */
  const renameProvider = (oldId: string, nextId: string): boolean => {
    const id = nextId.trim()
    if (!id || id === oldId) return true
    if (aiConfig.providers[id]) return false
    setAiConfig(prev => mutate.renameProvider(prev, oldId, id))
    setModelCandidates(prev => {
      const { [oldId]: candidates, ...rest } = prev
      return candidates ? { ...rest, [id]: candidates } : rest
    })
    setSelectedProvider(id)
    return true
  }

  /** 新建模型源并选中，返回其标识（调用方据此进入标识编辑态） */
  const addProvider = (): string => {
    let index = providerIds.length + 1
    let providerId = `provider${index}`
    while (aiConfig.providers[providerId]) {
      index += 1
      providerId = `provider${index}`
    }
    setAiConfig(prev => ({
      ...prev,
      providers: { ...prev.providers, [providerId]: createEmptyAiProvider() },
    }))
    setSelectedProvider(providerId)
    return providerId
  }

  const removeProvider = (providerId: string) => {
    setAiConfig(prev => mutate.removeProvider(prev, providerId))
    setModelCandidates(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== providerId)))
  }

  const updateModel = (providerId: string, index: number, value: string) => {
    setAiConfig(prev => mutate.renameModel(prev, providerId, index, value))
  }

  const updateContextWindow = (providerId: string, model: string, rawValue: string) => {
    setAiConfig(prev => mutate.setContextWindow(prev, providerId, model, rawValue))
  }

  const removeModel = (providerId: string, index: number) => {
    setAiConfig(prev => mutate.removeModel(prev, providerId, index))
  }

  const toggleCapability = (providerId: string, model: string, capability: AiCapabilityKey, enabled: boolean) => {
    setAiConfig(prev => mutate.toggleCapability(prev, providerId, model, capability, enabled))
  }

  /** 追加一行空白模型输入 */
  const addModel = (providerId: string) => {
    setAiConfig(prev => {
      const provider = prev.providers[providerId]
      return { ...prev, providers: { ...prev.providers, [providerId]: { ...provider, models: [...provider.models, ''] } } }
    })
  }

  /**
   * 从服务发现结果添加模型（已存在时忽略），并立即按官方参数填入。
   * 这里模型名是确定的，不需要等待输入结束，直接查询。
   */
  const addModels = (providerId: string, names: string[]) => {
    setAiConfig(prev => mutate.appendModels(prev, providerId, names))
    const added = names.map(name => name.trim()).filter(Boolean)
    if (added.length === 0) return
    for (const model of added) attemptedRef.current[`${providerId}:${model}`] = true
    void autoFillSpecs(providerId, added)
  }

  const save = async () => {
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

  /** 按目录重新填充整个模型源：强制覆盖，包含用户手动改过的模型 */
  const refillFromCatalog = async (providerId: string) => {
    const provider = aiConfig.providers[providerId]
    if (!provider) return
    const models = provider.models.map(model => model.trim()).filter(Boolean)
    if (models.length === 0) {
      toast.error('请先添加模型')
      return
    }
    for (const model of models) attemptedRef.current[`${providerId}:${model}`] = true
    const matched = await autoFillSpecs(providerId, models, true)
    if (matched === 0) toast.error('目录中没有匹配到这些模型')
    else toast.success(`已按官方参数填充 ${matched} 个模型`)
  }

  /** 单行恢复自动：清空手动值后重新按目录填充 */
  const restoreModelAuto = async (providerId: string, model: string) => {
    const modelName = model.trim()
    if (!modelName) return
    setAiConfig(prev => mutate.clearModelSpec(prev, providerId, modelName))
    attemptedRef.current[`${providerId}:${modelName}`] = true
    const matched = await autoFillSpecs(providerId, [modelName], true)
    if (matched === 0) toast.error(`目录中没有「${modelName}」，已清空手动参数`)
  }

  /** 切换该模型源对应的 models.dev 模型源，并按新归属重新查询 */
  const setCatalogProvider = (providerId: string, catalogProviderId: string) => {
    updateProvider(providerId, { catalog_provider: catalogProviderId })
    // 归属变化会改变匹配结果，清掉查询记录让自动填入重新评估
    const prefix = `${providerId}:`
    for (const key of Object.keys(attemptedRef.current)) {
      if (key.startsWith(prefix)) delete attemptedRef.current[key]
    }
    setSpecs(prev => {
      const { [providerId]: _dropped, ...rest } = prev
      return rest
    })
  }

  /** 手动刷新目录缓存 */
  const refreshCatalog = async () => {
    const { providers, status } = await fetchCatalog(true)
    setCatalogProviders(providers)
    setCatalogStatus(status)
    if (status.available) toast.success(`模型目录已更新（${status.modelCount} 个模型）`)
    else toast.error(status.error || '模型目录刷新失败')
  }

  /** 获取模型：先保存当前配置，再从该模型源拉取可用模型列表 */
  const fetchModels = async (providerId: string) => {
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

  return {
    aiConfig,
    providerIds,
    selectedId,
    selectProvider: setSelectedProvider,
    candidates: selectedId ? (modelCandidates[selectedId] ?? []) : [],
    loading,
    saving,
    dirty,
    fetchingProvider,
    updateProvider,
    setDefaultModel,
    setDefaultImageModel,
    renameProvider,
    addProvider,
    removeProvider,
    updateModel,
    updateContextWindow,
    removeModel,
    toggleCapability,
    addModel,
    addModels,
    save,
    fetchModels,
    // models.dev 官方参数
    commitModelName,
    specs: selectedId ? (specs[selectedId] ?? {}) : {},
    catalogProviders,
    catalogStatus,
    autoFilling,
    refillFromCatalog,
    restoreModelAuto,
    setCatalogProvider,
    refreshCatalog,
  }
}

export type AiConfigController = ReturnType<typeof useAiConfig>
