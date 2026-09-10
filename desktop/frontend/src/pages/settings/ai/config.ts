// 系统设置 · 模型配置的类型与纯函数（规范化、保存载荷、上下文窗口推断）

import { isRecord } from '../shared'

/** 模型配置页左栏的视图切换：模型源 / Agent */
export type AiSettingsView = 'providers' | 'agents'

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
  default_agent_id: string
  providers: Record<string, AiProviderConfig>
  agents: AiAgentProfile[]
}

export interface AiAgentProfile {
  id: string
  name: string
  enabled: boolean
  primary_model: string
  text_model: string
  image_model: string
  vision_model: string
  vision_output_mode: AiVisionOutputMode
  system_prompt: string
  max_steps: number
  temperature: number
}

export type AiVisionOutputMode = 'vision' | 'primary'

/** 模型能力字段：与模型行中的开关一一对应 */
export type AiCapabilityKey = 'vision_models' | 'tool_models' | 'structured_output_models' | 'image_models'

export const emptyAiConfig: AiConfig = {
  default_model: '', default_image_model: '', default_agent_id: '', providers: {}, agents: [],
}

export function createEmptyAgent(id = 'agent1'): AiAgentProfile {
  return {
    id, name: '新 Agent', enabled: true, primary_model: '', text_model: '', image_model: '',
    vision_model: '', vision_output_mode: 'vision', system_prompt: '', max_steps: 8, temperature: 0.3,
  }
}

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

function normalizeAgents(value: unknown): AiAgentProfile[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.flatMap((entry, index) => {
    const agent = isRecord(entry) ? entry : {}
    const id = getString(agent.id).trim() || `agent${index + 1}`
    if (seen.has(id)) return []
    seen.add(id)
    const maxSteps = typeof agent.max_steps === 'number' && Number.isFinite(agent.max_steps)
      ? Math.min(32, Math.max(1, Math.floor(agent.max_steps)))
      : 8
    const temperature = typeof agent.temperature === 'number' && Number.isFinite(agent.temperature)
      ? Math.min(2, Math.max(0, agent.temperature))
      : 0.3
    return [{
      id,
      name: getString(agent.name).trim() || id,
      enabled: agent.enabled !== false,
      primary_model: getString(agent.primary_model).trim(),
      text_model: getString(agent.text_model).trim(),
      image_model: getString(agent.image_model).trim(),
      vision_model: getString(agent.vision_model).trim(),
      vision_output_mode: getString(agent.vision_output_mode) === 'primary' ? 'primary' : 'vision',
      system_prompt: getString(agent.system_prompt),
      max_steps: maxSteps,
      temperature,
    }]
  })
}

export function normalizeAiConfig(value: unknown): AiConfig {
  const config = isRecord(value) ? value : {}
  const rawProviders = isRecord(config.providers) ? config.providers : {}
  return {
    default_model: getString(config.default_model) || getString(config.model),
    default_image_model: getString(config.default_image_model),
    default_agent_id: getString(config.default_agent_id),
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
    agents: normalizeAgents(config.agents),
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
    default_agent_id: aiConfig.agents.some(agent => agent.id === aiConfig.default_agent_id)
      ? aiConfig.default_agent_id
      : '',
    agents: aiConfig.agents.map(agent => ({
      ...agent,
      primary_model: chatModelIds.has(agent.primary_model) ? agent.primary_model : '',
      text_model: chatModelIds.has(agent.text_model) ? agent.text_model : '',
      image_model: imageModelIds.has(agent.image_model) ? agent.image_model : '',
      vision_model: chatModelIds.has(agent.vision_model) ? agent.vision_model : '',
      max_steps: Math.min(32, Math.max(1, Math.floor(agent.max_steps || 8))),
      temperature: Number.isFinite(agent.temperature) ? Math.min(2, Math.max(0, agent.temperature)) : 0.3,
    })),
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
