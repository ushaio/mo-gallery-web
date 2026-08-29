// 系统设置 · models.dev 模型目录：官方规格查询与「规格 → 配置字段」映射
//
// 配置即事实来源：添加模型时把官方参数写进配置（用户可改），
// agent 运行时只读配置编排，不再做目录查询。

import {
  GetModelCatalog,
  LookupModelSpecs,
  RefreshModelCatalog,
} from '../../../../wailsjs/go/main/App'
import { isRecord } from '../shared'
import type { AiProviderConfig } from './config'

/** 单个模型的官方规格（models.dev），字段对应 services.ModelCatalogSpec */
export interface ModelSpec {
  catalogModelId: string
  providerId: string
  providerName: string
  name: string
  family: string
  /** 可接收图片/视频输入 */
  vision: boolean
  /** 支持工具调用 */
  toolCall: boolean
  structuredOutput: boolean
  reasoning: boolean
  /** 可输出图片（由 modalities.output 推导） */
  imageOutput: boolean
  knowledge: string
  releaseDate: string
  status: string
  contextLimit: number
  outputLimit: number
  costInput: number
  costOutput: number
}

/** 目录缓存状态，对应 services.ModelCatalogStatus */
export interface CatalogStatus {
  available: boolean
  fetchedAt: string
  providerCount: number
  modelCount: number
  fromCache: boolean
  stale: boolean
  warning: string
  error: string
}

export interface CatalogProviderOption {
  id: string
  name: string
  modelCount: number
}

const emptyStatus: CatalogStatus = {
  available: false,
  fetchedAt: '',
  providerCount: 0,
  modelCount: 0,
  fromCache: false,
  stale: false,
  warning: '',
  error: '',
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function getBool(value: unknown): boolean {
  return value === true
}

function getNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function getStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function parseStatus(value: unknown): CatalogStatus {
  if (!isRecord(value)) return emptyStatus
  return {
    available: getBool(value.available),
    fetchedAt: getString(value.fetchedAt),
    providerCount: getNumber(value.providerCount),
    modelCount: getNumber(value.modelCount),
    fromCache: getBool(value.fromCache),
    stale: getBool(value.stale),
    warning: getString(value.warning),
    error: getString(value.error),
  }
}

function parseSpec(value: unknown): ModelSpec | null {
  if (!isRecord(value)) return null
  const modalities = isRecord(value.modalities) ? value.modalities : {}
  const limit = isRecord(value.limit) ? value.limit : {}
  const cost = isRecord(value.cost) ? value.cost : {}
  // 图片生成能力：官方 modalities.output 含 image
  const imageOutput = getStringList(modalities.output).some(item => item.trim().toLowerCase() === 'image')
  return {
    catalogModelId: getString(value.catalogModelId),
    providerId: getString(value.providerId),
    providerName: getString(value.providerName),
    name: getString(value.name),
    family: getString(value.family),
    vision: getBool(value.vision),
    toolCall: getBool(value.toolCall),
    structuredOutput: getBool(value.structuredOutput),
    reasoning: getBool(value.reasoning),
    imageOutput,
    knowledge: getString(value.knowledge),
    releaseDate: getString(value.releaseDate),
    status: getString(value.status),
    contextLimit: getNumber(limit.context),
    outputLimit: getNumber(limit.output),
    costInput: getNumber(cost.input),
    costOutput: getNumber(cost.output),
  }
}

/** 目录概览：模型源候选 + 缓存状态。目录不可用时返回空列表而非抛错。 */
export async function fetchCatalog(force = false): Promise<{ providers: CatalogProviderOption[]; status: CatalogStatus }> {
  try {
    const result = force ? await RefreshModelCatalog() : await GetModelCatalog()
    const raw: unknown = result
    if (!isRecord(raw)) return { providers: [], status: emptyStatus }
    const providers = Array.isArray(raw.providers)
      ? raw.providers.flatMap((item: unknown) => {
        if (!isRecord(item)) return []
        const id = getString(item.id)
        if (!id) return []
        return [{ id, name: getString(item.name) || id, modelCount: getNumber(item.modelCount) }]
      })
      : []
    providers.sort((a, b) => a.id.localeCompare(b.id))
    return { providers, status: parseStatus(raw.status) }
  } catch {
    // 目录问题绝不阻塞设置页
    return { providers: [], status: emptyStatus }
  }
}

/** 批量查询官方规格，返回 `模型名 → 规格`。未命中的模型不出现在结果中。 */
export async function lookupSpecs(
  provider: Pick<AiProviderConfig, 'base_url' | 'catalog_provider'>,
  modelNames: string[],
): Promise<Map<string, ModelSpec>> {
  const names = [...new Set(modelNames.map(name => name.trim()).filter(Boolean))]
  const specs = new Map<string, ModelSpec>()
  if (names.length === 0) return specs
  try {
    const result = await LookupModelSpecs({
      catalogProviderId: provider.catalog_provider || '',
      baseUrl: provider.base_url || '',
      modelNames: names,
    })
    const raw: unknown = result
    if (!isRecord(raw) || !Array.isArray(raw.items)) return specs
    for (const item of raw.items) {
      if (!isRecord(item) || item.found !== true) continue
      const modelName = getString(item.modelName)
      const spec = parseSpec(item.spec)
      if (modelName && spec) specs.set(modelName, spec)
    }
  } catch {
    return specs
  }
  return specs
}

/** 规格映射到配置字段：这些值会写进配置并被 agent 直接使用 */
export interface SpecCapabilities {
  vision: boolean
  tools: boolean
  structuredOutput: boolean
  image: boolean
  contextWindow: number
}

export function specToCapabilities(spec: ModelSpec): SpecCapabilities {
  return {
    vision: spec.vision,
    tools: spec.toolCall,
    structuredOutput: spec.structuredOutput,
    image: spec.imageOutput,
    contextWindow: spec.contextLimit,
  }
}

/** 配置中该模型的当前值是否与官方规格一致（用于区分「自动」/「已手动修改」） */
export function matchesSpec(provider: AiProviderConfig, model: string, spec: ModelSpec): boolean {
  const expected = specToCapabilities(spec)
  const configured = provider.context_windows[model]
  return provider.vision_models.includes(model) === expected.vision
    && provider.tool_models.includes(model) === expected.tools
    && provider.structured_output_models.includes(model) === expected.structuredOutput
    && provider.image_models.includes(model) === expected.image
    && (expected.contextWindow > 0 ? configured === expected.contextWindow : configured === undefined)
}

export function formatCatalogTimestamp(value: string): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })
}

/** 价格格式化：models.dev 以每百万 token 美元计价 */
export function formatCost(value: number): string {
  if (value <= 0) return '—'
  return `$${value}/M`
}
