// 系统设置 · 模型配置的纯状态迁移（能力数组 / context_windows / 默认模型 id 同步维护）

import type { SpecCapabilities } from './catalog'
import {
  normalizeModelNames,
  toModelId,
  type AiCapabilityKey,
  type AiConfig,
  type AiProviderConfig,
} from './config'

const CAPABILITY_KEYS: AiCapabilityKey[] = [
  'image_models',
  'vision_models',
  'tool_models',
  'structured_output_models',
]

function withProvider(config: AiConfig, providerId: string, provider: AiProviderConfig): AiConfig {
  return { ...config, providers: { ...config.providers, [providerId]: provider } }
}

/** 重命名模型源：迁移默认模型 id 的前缀 */
export function renameProvider(config: AiConfig, oldId: string, nextId: string): AiConfig {
  const { [oldId]: provider, ...rest } = config.providers
  const migrate = (modelId: string) => modelId.startsWith(`${oldId}:`)
    ? `${nextId}:${modelId.slice(oldId.length + 1)}`
    : modelId
  return {
    ...config,
    default_model: migrate(config.default_model),
    default_image_model: migrate(config.default_image_model),
    providers: { ...rest, [nextId]: provider },
  }
}

/** 删除模型源：清理其下的默认模型选择 */
export function removeProvider(config: AiConfig, providerId: string): AiConfig {
  const providers = Object.fromEntries(Object.entries(config.providers).filter(([id]) => id !== providerId))
  const owned = (modelId: string) => modelId.startsWith(`${providerId}:`)
  return {
    ...config,
    default_model: owned(config.default_model) ? '' : config.default_model,
    default_image_model: owned(config.default_image_model) ? '' : config.default_image_model,
    providers,
  }
}

/** 重命名模型：同步迁移能力数组、context_windows 与默认模型 id */
export function renameModel(config: AiConfig, providerId: string, index: number, value: string): AiConfig {
  const provider = config.providers[providerId]
  const previousModel = provider.models[index].trim()
  const nextModel = value.trim()
  const renameIn = (capabilityModels: string[]) => capabilityModels
    .map(model => model === previousModel ? nextModel : model)
    .filter(Boolean)
  const context_windows = { ...provider.context_windows }
  if (previousModel && previousModel !== nextModel && context_windows[previousModel] !== undefined) {
    const contextWindow = context_windows[previousModel]
    delete context_windows[previousModel]
    if (nextModel) context_windows[nextModel] = contextWindow
  }
  const previousId = toModelId(providerId, previousModel)
  const nextId = nextModel ? toModelId(providerId, nextModel) : ''
  const next = withProvider(config, providerId, {
    ...provider,
    models: provider.models.map((model, i) => i === index ? value : model),
    image_models: renameIn(provider.image_models),
    vision_models: renameIn(provider.vision_models),
    tool_models: renameIn(provider.tool_models),
    structured_output_models: renameIn(provider.structured_output_models),
    context_windows,
  })
  return {
    ...next,
    default_model: config.default_model === previousId ? nextId : config.default_model,
    default_image_model: config.default_image_model === previousId ? nextId : config.default_image_model,
  }
}

/** 删除模型：同时移除其能力标记、上下文窗口与默认模型引用 */
export function removeModel(config: AiConfig, providerId: string, index: number): AiConfig {
  const provider = config.providers[providerId]
  const removed = provider.models[index].trim()
  const models = provider.models.filter((_, i) => i !== index)
  const removedId = toModelId(providerId, removed)
  const context_windows = { ...provider.context_windows }
  delete context_windows[removed]
  const next = withProvider(config, providerId, {
    ...provider,
    models: models.length > 0 ? models : [''],
    image_models: provider.image_models.filter(model => model !== removed),
    vision_models: provider.vision_models.filter(model => model !== removed),
    tool_models: provider.tool_models.filter(model => model !== removed),
    structured_output_models: provider.structured_output_models.filter(model => model !== removed),
    context_windows,
  })
  return {
    ...next,
    default_model: config.default_model === removedId ? '' : config.default_model,
    default_image_model: config.default_image_model === removedId ? '' : config.default_image_model,
  }
}

/** 上下文窗口：留空表示回退到自动推断；非法输入原样返回 */
export function setContextWindow(config: AiConfig, providerId: string, model: string, rawValue: string): AiConfig {
  const modelName = model.trim()
  if (!modelName) return config
  const provider = config.providers[providerId]
  const context_windows = { ...provider.context_windows }
  const value = rawValue.trim()
  if (!value) {
    delete context_windows[modelName]
  } else {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) return config
    context_windows[modelName] = Math.floor(parsed)
  }
  return withProvider(config, providerId, { ...provider, context_windows })
}

/**
 * 切换模型能力。图片生成额外维护默认图片模型：
 * 首次标记时自动补齐默认值，取消标记时清除失效默认值。
 */
export function toggleCapability(
  config: AiConfig,
  providerId: string,
  model: string,
  capability: AiCapabilityKey,
  enabled: boolean,
): AiConfig {
  const modelName = model.trim()
  if (!modelName || !CAPABILITY_KEYS.includes(capability)) return config
  const provider = config.providers[providerId]
  const capabilityModels = enabled
    ? normalizeModelNames([...provider[capability], modelName])
    : provider[capability].filter(item => item !== modelName)
  const next = withProvider(config, providerId, { ...provider, [capability]: capabilityModels })
  if (capability !== 'image_models') return next
  const modelId = toModelId(providerId, modelName)
  return {
    ...next,
    default_image_model: enabled && !config.default_image_model
      ? modelId
      : (!enabled && config.default_image_model === modelId ? '' : config.default_image_model),
  }
}

/**
 * 把 models.dev 官方规格写入配置字段（自动填入的落地动作）。
 * 这些值随后由 agent 直接读取用于编排，因此必须写成具体值而非运行时推断。
 * 只处理传入的模型，其余模型的既有配置原样保留。
 */
export function applySpecs(
  config: AiConfig,
  providerId: string,
  specs: Map<string, SpecCapabilities>,
): AiConfig {
  const provider = config.providers[providerId]
  if (!provider || specs.size === 0) return config

  const setMembership = (list: string[], model: string, enabled: boolean): string[] => (
    enabled
      ? (list.includes(model) ? list : [...list, model])
      : list.filter(item => item !== model)
  )

  let image_models = provider.image_models
  let vision_models = provider.vision_models
  let tool_models = provider.tool_models
  let structured_output_models = provider.structured_output_models
  const context_windows = { ...provider.context_windows }

  for (const [model, capabilities] of specs) {
    const modelName = model.trim()
    if (!modelName) continue
    vision_models = setMembership(vision_models, modelName, capabilities.vision)
    tool_models = setMembership(tool_models, modelName, capabilities.tools)
    structured_output_models = setMembership(structured_output_models, modelName, capabilities.structuredOutput)
    image_models = setMembership(image_models, modelName, capabilities.image)
    if (capabilities.contextWindow > 0) {
      context_windows[modelName] = capabilities.contextWindow
    } else {
      delete context_windows[modelName]
    }
  }

  const next = withProvider(config, providerId, {
    ...provider,
    image_models: normalizeModelNames(image_models),
    vision_models: normalizeModelNames(vision_models),
    tool_models: normalizeModelNames(tool_models),
    structured_output_models: normalizeModelNames(structured_output_models),
    context_windows,
  })

  // 自动标记出图片模型后补齐默认图片模型（与手动切换保持一致的行为）
  if (config.default_image_model) return next
  const firstImageModel = [...specs.entries()].find(([, capabilities]) => capabilities.image)?.[0]
  if (!firstImageModel) return next
  return { ...next, default_image_model: toModelId(providerId, firstImageModel.trim()) }
}

/** 清除模型的全部能力标记与上下文窗口（「恢复自动」前的重置） */
export function clearModelSpec(config: AiConfig, providerId: string, model: string): AiConfig {
  const modelName = model.trim()
  if (!modelName) return config
  const provider = config.providers[providerId]
  if (!provider) return config
  const context_windows = { ...provider.context_windows }
  delete context_windows[modelName]
  const next = withProvider(config, providerId, {
    ...provider,
    image_models: provider.image_models.filter(item => item !== modelName),
    vision_models: provider.vision_models.filter(item => item !== modelName),
    tool_models: provider.tool_models.filter(item => item !== modelName),
    structured_output_models: provider.structured_output_models.filter(item => item !== modelName),
    context_windows,
  })
  const modelId = toModelId(providerId, modelName)
  return {
    ...next,
    default_image_model: config.default_image_model === modelId ? '' : config.default_image_model,
  }
}

/** 追加模型（去重，顺带清理空白行）；无新增时原样返回 */
export function appendModels(config: AiConfig, providerId: string, names: string[]): AiConfig {
  const provider = config.providers[providerId]
  const existing = new Set(provider.models.map(model => model.trim()))
  const additions = names.map(name => name.trim()).filter(name => name && !existing.has(name))
  if (additions.length === 0) return config
  return withProvider(config, providerId, {
    ...provider,
    models: [...provider.models.filter(model => model.trim()), ...additions],
  })
}
