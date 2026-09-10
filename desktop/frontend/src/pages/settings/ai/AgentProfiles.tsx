import { Bot, Loader2, Plus, Save, Sparkles, Trash2 } from 'lucide-react'
import { SelectDropdown } from '@/components/ui/SelectDropdown'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import { Field, inputClass, inputStyle, Section, btnOutline, btnPrimary } from '../shared'
import type { AiAgentProfile, AiConfig, AiSettingsView } from './config'

function modelOptions(aiConfig: AiConfig, imageOnly = false) {
  return Object.entries(aiConfig.providers).flatMap(([providerId, provider]) => {
    const models = imageOnly ? provider.image_models : provider.models
    return models.filter(Boolean).map(model => ({
      value: `${providerId}:${model}`,
      label: `${providerId} / ${model}`,
    }))
  })
}

export function AgentProfiles({
  aiConfig,
  selectedAgentId,
  onSelect,
  onAdd,
  onRemove,
  onDefaultChange,
  onUpdate,
  dirty,
  saving,
  onSave,
  view,
  onViewChange,
}: {
  aiConfig: AiConfig
  selectedAgentId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
  onDefaultChange: (id: string) => void
  onUpdate: (id: string, patch: Partial<AiAgentProfile>) => void
  dirty: boolean
  saving: boolean
  onSave: () => void
  /** 左栏面板头：模型源 / Agent 视图切换（与 Agent 扩展页同款，只占左侧区域） */
  view: AiSettingsView
  onViewChange: (view: AiSettingsView) => void
}) {
  const agent = aiConfig.agents.find(item => item.id === selectedAgentId) ?? null
  const chatOptions = modelOptions(aiConfig)
  const imageOptions = modelOptions(aiConfig, true)

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r bg-card" style={{ borderColor: 'var(--border)' }}>
        <div className="shrink-0 border-b p-3" style={{ borderColor: 'var(--border)' }}>
          <SegmentedTabs
            size="sm"
            ariaLabel="AI 视图"
            value={view}
            onChange={onViewChange}
            options={[
              { value: 'providers', label: '模型源', icon: Sparkles },
              { value: 'agents', label: 'Agent', icon: Bot },
            ]}
          />
        </div>
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
          {aiConfig.agents.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <span className="flex size-10 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--muted)' }}>
                <Bot size={18} style={{ color: 'var(--muted-foreground)' }} />
              </span>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>暂无 Agent，点击下方添加</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {aiConfig.agents.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-secondary"
                  style={{ backgroundColor: selectedAgentId === item.id ? 'var(--accent)' : 'transparent' }}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--muted)' }}>
                    <Bot size={14} style={{ color: selectedAgentId === item.id ? 'var(--accent-foreground)' : 'var(--muted-foreground)' }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium" style={{ color: selectedAgentId === item.id ? 'var(--accent-foreground)' : 'var(--foreground)' }}>{item.name}</span>
                      {aiConfig.default_agent_id === item.id ? <span className="shrink-0 rounded px-1 py-px text-[9px]" style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary)' }}>默认</span> : null}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px]" style={{ color: selectedAgentId === item.id ? 'color-mix(in srgb, var(--accent-foreground) 72%, transparent)' : 'var(--muted-foreground)' }}>
                      {item.primary_model || '尚未选择主模型'}
                    </span>
                  </span>
                  <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.enabled ? '#4f9d69' : 'var(--muted-foreground)' }} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 space-y-2 border-t p-3" style={{ borderColor: 'var(--border)' }}>
          <button type="button" onClick={onAdd} className={`${btnOutline} w-full justify-center`}>
            <Plus size={14} /> 添加 Agent
          </button>
          <SelectDropdown
            value={aiConfig.default_agent_id}
            options={aiConfig.agents.map(item => ({ value: item.id, label: item.name }))}
            onChange={value => onDefaultChange(String(value))}
            placeholder="选择默认 Agent"
            clearLabel="不设置默认 Agent"
            emptyText="请先添加 Agent"
            ariaLabel="默认 Agent"
            placement="top"
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!agent ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6" style={{ color: 'var(--muted-foreground)' }}>
            <Bot size={24} />
            <p className="text-sm">创建 Agent 后配置模型角色</p>
          </div>
        ) : (
          <>
            <div className="flex h-12 shrink-0 items-center justify-between border-b px-5" style={{ borderColor: 'var(--border)' }}>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-medium" style={{ color: 'var(--foreground)' }}>{agent.name}</h2>
                <p className="mt-0.5 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{agent.id}</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => onRemove(agent.id)} className={`${btnOutline} text-destructive`} title="删除 Agent" aria-label="删除 Agent">
                  <Trash2 size={13} />
                </button>
                <button type="button" onClick={onSave} disabled={!dirty || saving} className={`${btnPrimary} bg-primary text-primary-foreground`}>
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  保存
                </button>
              </div>
            </div>
            <div className="custom-scrollbar min-h-0 flex-1 overflow-auto">
              <div className="mx-auto max-w-3xl space-y-6 px-6 py-6">
                <Section title="基本信息" description="Agent 是可复用的模型路由配置，调用方只需引用 Agent ID。">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Field label="名称">
                      <input value={agent.name} onChange={event => onUpdate(agent.id, { name: event.target.value })} className={inputClass} style={inputStyle} />
                    </Field>
                    <Field label="状态">
                      <label className="flex h-8 items-center gap-2 text-xs" style={{ color: 'var(--foreground)' }}>
                        <input type="checkbox" checked={agent.enabled} onChange={event => onUpdate(agent.id, { enabled: event.target.checked })} />
                        允许新任务使用此 Agent
                      </label>
                    </Field>
                  </div>
                </Section>

                <Section title="模型路由" description="主模型负责推理、工具调用和最终回复；专用模型为空时回退到主模型。">
                  <Field label="主模型" description="建议选择同时支持工具调用和结构化输出的模型。">
                    <SelectDropdown value={agent.primary_model} options={chatOptions} onChange={value => onUpdate(agent.id, { primary_model: String(value) })} placeholder="请选择主模型" clearLabel="未设置主模型" emptyText="请先在模型源中添加模型" ariaLabel="主模型" size="md" />
                  </Field>
                  <div className="grid gap-4 lg:grid-cols-3">
                    <Field label="文本模型">
                      <SelectDropdown value={agent.text_model} options={chatOptions} onChange={value => onUpdate(agent.id, { text_model: String(value) })} placeholder="跟随主模型" clearLabel="跟随主模型" emptyText="暂无对话模型" ariaLabel="文本模型" />
                    </Field>
                    <Field label="视觉模型">
                      <SelectDropdown value={agent.vision_model} options={chatOptions} onChange={value => onUpdate(agent.id, { vision_model: String(value) })} placeholder="跟随主模型" clearLabel="跟随主模型" emptyText="暂无视觉模型" ariaLabel="视觉模型" />
                    </Field>
                    <Field label="图片模型">
                      <SelectDropdown value={agent.image_model} options={imageOptions} onChange={value => onUpdate(agent.id, { image_model: String(value) })} placeholder="使用默认图片模型" clearLabel="使用默认图片模型" emptyText="请先标记图片模型" ariaLabel="图片模型" />
                    </Field>
                  </div>
                  <Field label="视觉输出方式" description="带图片的对话先由视觉模型理解，再决定由谁生成最终回复。">
                    <SelectDropdown
                      value={agent.vision_output_mode}
                      options={[
                        { value: 'vision', label: '视觉模型直接输出' },
                        { value: 'primary', label: '主模型整理输出' },
                      ]}
                      onChange={value => onUpdate(agent.id, { vision_output_mode: String(value) as 'vision' | 'primary' })}
                      ariaLabel="视觉输出方式"
                    />
                  </Field>
                </Section>

                <Section title="行为与限制">
                  <Field label="系统提示词" description="用于定义 Agent 的长期角色和输出约束。">
                    <textarea value={agent.system_prompt} onChange={event => onUpdate(agent.id, { system_prompt: event.target.value })} rows={7} className={inputClass.replace('h-8', 'min-h-32 py-2') + ' resize-y'} style={inputStyle} placeholder="例如：你是一个严谨的摄影编辑助手……" />
                  </Field>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Field label="最大步骤数" description="限制一次任务中的工具循环次数，范围 1–32。">
                      <input type="number" min={1} max={32} value={agent.max_steps} onChange={event => onUpdate(agent.id, { max_steps: Number(event.target.value) || 1 })} className={inputClass} style={inputStyle} />
                    </Field>
                    <Field label="温度" description="范围 0–2，数值越高输出越有变化。">
                      <input type="number" min={0} max={2} step={0.1} value={agent.temperature} onChange={event => onUpdate(agent.id, { temperature: Number(event.target.value) || 0 })} className={inputClass} style={inputStyle} />
                    </Field>
                  </div>
                </Section>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
