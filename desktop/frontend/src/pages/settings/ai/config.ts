// 系统设置 · 模型配置的类型与纯函数（规范化、保存载荷、上下文窗口推断）

import { isRecord } from '../shared'

export interface AiProviderConfig {
  base_url: string
  api_key: string
  models: string[]
  image_models: string[]
  vision_models: string[]
  tool_models: string[]
  structured_output_models: string[]
  context_windows: Record<string, number>
  /** 该模型源对应的 models.dev 模型源标识，用于提高官方规格匹配准确度 */
  catalog_provider: string
}

export interface AiConfig {
  default_model: string
  default_image_model: string
  providers: Record<string, AiProviderConfig>
}

/** 模型能力字段：与模型行中的开关一一对应 */
export type AiCapabilityKey = 'vision_models' | 'tool_models' | 'structured_output_models' | 'image_models'

export const emptyAiConfig: AiConfig = { default_model: '', default_image_model: '', providers: {} }

export function createEmptyAiProvider(): AiProviderConfig {
  return {
    base_url: '',
    api_key: '',
    models: [''],
    image_models: [],
    vision_models: [],
    tool_models: [],
    structured_output_models: [],
    context_windows: {},
    catalog_provider: '',
  }
}

/** 模型的全局标识：`模型源:模型名` */
export function toModelId(providerId: string, model: string): string {
  return `${providerId}:${model}`
}

export function normalizeModelNames(models: string[]): string[] {
  return [...new Set(models.map(model => model.trim()).filter(Boolean))]
}

/**
 * 未配置上下文窗口时的兜底值，必须与 Go 侧 defaultDesktopModelContextWindow 保持一致
 * （desktop/services/editor-ai.go）。官方参数由 models.dev 目录在添加模型时写入配置，
 * 这里只是「配置为空」时的真实生效值。
 */
export const DEFAULT_AI_MODEL_CONTEXT_WINDOW = 8192

export function inferAiModelContextWindow(_model: string): number {
  return DEFAULT_AI_MODEL_CONTEXT_WINDOW
}

export function formatContextWindow(value: number): string {
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

export function normalizeAiConfig(value: unknown): AiConfig {
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
        catalog_provider: getString(provider.catalog_provider),
      }]
    })),
  }
}

/** 保存载荷：能力数组只保留已配置的模型，并清理失效的默认模型 */
export function buildAiConfigPayload(aiConfig: AiConfig): AiConfig {
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
    provider.models.map(model => toModelId(providerId, model))
  )))
  const imageModelIds = new Set(Object.entries(providers).flatMap(([providerId, provider]) => (
    provider.image_models.map(model => toModelId(providerId, model))
  )))
  return {
    ...aiConfig,
    default_model: chatModelIds.has(aiConfig.default_model) ? aiConfig.default_model : '',
    default_image_model: imageModelIds.has(aiConfig.default_image_model) ? aiConfig.default_image_model : '',
    providers,
  }
}

export function isProviderConfigured(provider: AiProviderConfig): boolean {
  return Boolean(provider.base_url.trim() && provider.api_key.trim())
}

/**
 * 模型是否尚未配置过任何参数。自动填入据此判断能否安全写入：
 * 有任意能力标记或上下文窗口，就说明用户（或上一次填充）已经设置过，不再覆盖。
 */
export function isModelUnconfigured(provider: AiProviderConfig, model: string): boolean {
  const modelName = model.trim()
  if (!modelName) return false
  return !provider.vision_models.includes(modelName)
    && !provider.tool_models.includes(modelName)
    && !provider.structured_output_models.includes(modelName)
    && !provider.image_models.includes(modelName)
    && provider.context_windows[modelName] === undefined
}

/** 模型源选中项持久化（跨页面/重启保留，与胶卷页视图偏好一致） */
const AI_SELECTED_PROVIDER_KEY = 'mo-gallery:ai:selected-provider'

export function readSelectedAiProvider(): string | null {
  try {
    return window.localStorage.getItem(AI_SELECTED_PROVIDER_KEY)
  } catch {
    return null
  }
}

export function writeSelectedAiProvider(providerId: string | null): void {
  try {
    if (providerId) window.localStorage.setItem(AI_SELECTED_PROVIDER_KEY, providerId)
    else window.localStorage.removeItem(AI_SELECTED_PROVIDER_KEY)
  } catch {
    // localStorage 不可用时忽略
  }
}
