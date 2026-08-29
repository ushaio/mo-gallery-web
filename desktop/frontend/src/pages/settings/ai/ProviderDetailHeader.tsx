// 系统设置 · 模型配置详情头部：标识 inline 重命名 + 获取模型 / 删除 / 保存

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Pencil, RefreshCw, Save, Trash2 } from 'lucide-react'
import { STATUS_COLORS, btnOutline, btnPrimary, inputClass, inputStyle } from '../shared'
import { isProviderConfigured, type AiProviderConfig } from './config'

export function ProviderDetailHeader({
  providerId, provider, isDefault, dirty, saving, fetching, autoEdit = false,
  onRename, onFetchModels, onRequestDelete, onSave,
}: {
  providerId: string
  provider: AiProviderConfig
  isDefault: boolean
  dirty: boolean
  saving: boolean
  fetching: boolean
  /** 新建模型源后直接进入标识编辑态，方便直接命名 */
  autoEdit?: boolean
  /** 返回 false 表示标识重复，保持编辑内容不落库 */
  onRename: (nextId: string) => boolean
  onFetchModels: () => void
  onRequestDelete: () => void
  onSave: () => void
}) {
  const [editing, setEditing] = useState(autoEdit)
  const [idDraft, setIdDraft] = useState(providerId)
  const cancelEditRef = useRef(false)
  const configured = isProviderConfigured(provider)

  const startEditing = () => {
    cancelEditRef.current = false
    setIdDraft(providerId)
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    if (cancelEditRef.current) {
      cancelEditRef.current = false
      return
    }
    if (!onRename(idDraft)) toast.error('模型源标识已存在')
  }

  return (
    <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-6 py-2.5" style={{ borderColor: 'var(--border)' }}>
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={idDraft}
            onChange={e => setIdDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                cancelEditRef.current = true
                setEditing(false)
              }
            }}
            className={`${inputClass} h-7 w-52 font-medium`}
            style={inputStyle}
            aria-label="模型源标识"
          />
        ) : (
          <div className="flex items-center gap-2">
            <h2 className="truncate font-serif text-base font-medium" style={{ color: 'var(--foreground)' }}>{providerId}</h2>
            <button onClick={startEditing}
              className="shrink-0 rounded p-1 transition-colors hover:bg-secondary"
              style={{ color: 'var(--muted-foreground)' }}
              aria-label="重命名模型源">
              <Pencil size={13} />
            </button>
            {isDefault && (
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
        <button onClick={onFetchModels} disabled={fetching}
          className={btnOutline} title="保存当前配置，并从该模型源拉取可用模型列表">
          {fetching ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          获取模型
        </button>
        <button onClick={onRequestDelete}
          className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:bg-secondary"
          style={{ borderColor: 'var(--border)', color: 'var(--destructive)' }}
          aria-label={`删除模型源 ${providerId}`}>
          <Trash2 size={14} />
        </button>
        <button onClick={onSave} disabled={!dirty || saving}
          className={btnPrimary}
          style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
          title={dirty ? '保存模型配置' : '没有待保存的更改'}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={14} />}
          {saving ? '保存中...' : dirty ? '保存更改' : '已保存'}
        </button>
      </div>
    </header>
  )
}
