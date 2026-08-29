// 系统设置 · 模型清单：能力由 models.dev 官方参数自动填入，可手动覆盖

import {
  Braces, Eye, Image as ImageIcon, Loader2, Plus, RotateCcw, Sparkles, Star, Wrench, X,
} from 'lucide-react'
import { btnOutline, inputClass, inputStyle } from '../shared'
import { AiSection } from './AiSection'
import { formatCost, matchesSpec, type ModelSpec } from './catalog'
import {
  formatContextWindow,
  inferAiModelContextWindow,
  toModelId,
  type AiCapabilityKey,
  type AiConfig,
  type AiProviderConfig,
} from './config'

// 列头与模型行中的开关顺序一一对应；激活态统一使用主题主色
const AI_CAPABILITY_COLUMNS: { label: string; icon: typeof Eye; key: AiCapabilityKey }[] = [
  { label: '视觉理解', icon: Eye, key: 'vision_models' },
  { label: '工具调用', icon: Wrench, key: 'tool_models' },
  { label: '结构化输出', icon: Braces, key: 'structured_output_models' },
  { label: '图片生成', icon: ImageIcon, key: 'image_models' },
]

// 窄宽度下横向滚动而不是挤压列宽：模型名列保留最小宽度
const ROW_GRID = 'grid grid-cols-[minmax(160px,1fr)_24px_104px_repeat(4,30px)_52px] items-center gap-x-2 px-3'

export interface ModelTableHandlers {
  onModelChange: (index: number, value: string) => void
  onModelCommit: (model: string) => void
  onContextWindowChange: (model: string, rawValue: string) => void
  onToggleCapability: (model: string, capability: AiCapabilityKey, enabled: boolean) => void
  onRemoveModel: (index: number) => void
  onRestoreAuto: (model: string) => void
  onAddModel: () => void
  onRefill: () => void
}

export function ModelTable({ providerId, provider, aiConfig, specs, autoFilling, catalogAvailable, handlers }: {
  providerId: string
  provider: AiProviderConfig
  aiConfig: AiConfig
  specs: Record<string, ModelSpec>
  autoFilling: boolean
  catalogAvailable: boolean
  handlers: ModelTableHandlers
}) {
  const modelCount = provider.models.filter(model => model.trim()).length
  return (
    <AiSection
      label="模型清单"
      description={catalogAvailable
        ? '添加模型后自动填入 models.dev 的官方参数；需要时可手动覆盖，覆盖后该行标为「手动」。'
        : '模型目录当前不可用，参数需手动填写；目录恢复后可用「按官方参数填充」补齐。'}
      action={
        <div className="flex items-center gap-2">
          {autoFilling && (
            <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
              <Loader2 size={11} className="animate-spin" /> 获取官方参数
            </span>
          )}
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
            {modelCount} 个模型
          </span>
        </div>
      }
    >
      <div className="overflow-hidden rounded-md border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
        <div className="custom-scrollbar overflow-x-auto">
          <div className="min-w-[560px]">
            <div className={`${ROW_GRID} border-b py-2`}
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
              <span className="sr-only">操作</span>
            </div>
            {provider.models.map((model, index) => (
              <ModelRow
                key={index}
                index={index}
                model={model}
                providerId={providerId}
                provider={provider}
                aiConfig={aiConfig}
                spec={specs[model.trim()]}
                handlers={handlers}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button onClick={handlers.onAddModel} className={btnOutline}>
          <Plus size={14} /> 添加模型
        </button>
        {catalogAvailable && (
          <button onClick={handlers.onRefill} className={btnOutline}
            title="按 models.dev 官方参数重新填充全部模型，会覆盖手动修改">
            <Sparkles size={14} /> 按官方参数填充
          </button>
        )}
      </div>
    </AiSection>
  )
}

function ModelRow({ index, model, providerId, provider, aiConfig, spec, handlers }: {
  index: number
  model: string
  providerId: string
  provider: AiProviderConfig
  aiConfig: AiConfig
  spec: ModelSpec | undefined
  handlers: ModelTableHandlers
}) {
  const modelName = model.trim()
  const modelId = toModelId(providerId, modelName)
  const isDefaultChat = Boolean(modelName) && aiConfig.default_model === modelId
  const isDefaultImage = Boolean(modelName) && aiConfig.default_image_model === modelId
  const configuredContextWindow = provider.context_windows[modelName]
  const inferredContextWindow = inferAiModelContextWindow(modelName)
  const effectiveContextWindow = configuredContextWindow ?? inferredContextWindow
  // 官方参数与当前配置一致 → 自动；不一致 → 已手动覆盖
  const isAuto = Boolean(modelName) && spec !== undefined && matchesSpec(provider, modelName, spec)
  const overridden = Boolean(modelName) && spec !== undefined && !isAuto

  return (
    <div className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
      <div className={`${ROW_GRID} py-2.5`}>
        <input value={model}
          onChange={e => handlers.onModelChange(index, e.target.value)}
          onBlur={e => handlers.onModelCommit(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handlers.onModelCommit(e.currentTarget.value) }}
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
          onChange={event => handlers.onContextWindowChange(model, event.target.value)}
          aria-label={`${modelName || '未命名模型'} 上下文窗口 (tokens)`}
          title={configuredContextWindow === undefined
            ? `未配置，实际生效 ${formatContextWindow(effectiveContextWindow)} tokens`
            : `${formatContextWindow(effectiveContextWindow)} tokens`}
          className={`${inputClass} pr-2 text-right tabular-nums disabled:opacity-40`}
          style={inputStyle}
        />
        {AI_CAPABILITY_COLUMNS.map(({ label, icon: Icon, key }) => {
          const active = Boolean(modelName) && provider[key].includes(modelName)
          return (
            <CapabilityCell key={key} icon={Icon} label={label} active={active} disabled={!modelName}
              onClick={() => handlers.onToggleCapability(model, key, !active)} />
          )
        })}
        <div className="flex items-center justify-end gap-0.5">
          {overridden && (
            <button onClick={() => handlers.onRestoreAuto(model)}
              className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-secondary"
              style={{ color: 'var(--muted-foreground)' }}
              title="恢复官方参数"
              aria-label={`恢复 ${modelName} 的官方参数`}>
              <RotateCcw size={12} />
            </button>
          )}
          <button onClick={() => handlers.onRemoveModel(index)}
            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-secondary"
            style={{ color: 'var(--muted-foreground)' }}
            aria-label={`删除模型 ${modelName || index + 1}`}>
            <X size={13} />
          </button>
        </div>
      </div>

      {modelName && (spec || overridden) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pb-2 text-[10px]"
          style={{ color: 'var(--muted-foreground)' }}>
          <SpecBadge auto={isAuto} overridden={overridden} />
          {spec && (
            <>
              {spec.name && <span>{spec.name}</span>}
              {spec.reasoning && <span>· 推理</span>}
              {spec.outputLimit > 0 && <span>· 输出上限 {formatContextWindow(spec.outputLimit)}</span>}
              {spec.knowledge && <span>· 知识截止 {spec.knowledge}</span>}
              {spec.costInput > 0 && <span>· 入 {formatCost(spec.costInput)} / 出 {formatCost(spec.costOutput)}</span>}
              <span className="opacity-60">· 来源 {spec.providerName || spec.providerId}</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function SpecBadge({ auto, overridden }: { auto: boolean; overridden: boolean }) {
  if (auto) {
    return (
      <span className="rounded px-1.5 py-0.5 font-medium"
        style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }}>
        官方参数
      </span>
    )
  }
  if (!overridden) return null
  return (
    <span className="rounded px-1.5 py-0.5 font-medium"
      style={{ backgroundColor: 'color-mix(in srgb, #f59e0b 16%, transparent)', color: '#b45309' }}>
      已手动覆盖
    </span>
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
