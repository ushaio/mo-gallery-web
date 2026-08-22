// 系统设置 · 日志

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { useCachedPageEffect } from '@/hooks/useCachedPageEffect'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import { SelectDropdown } from '@/components/ui/SelectDropdown'
import {
  ClearLogs,
  GetLogConfig,
  GetLogs,
  GetLogStats,
  OpenLogDir,
  UpdateLogConfig,
} from '../../../wailsjs/go/main/App'
import { type services } from '../../../wailsjs/go/models'
import {
  Save,
  Loader2,
  FileText,
  Trash,
  Filter,
  FolderOpen,
} from 'lucide-react'
import { getErrorMessage, inputClass, inputStyle, btnOutline, Section, Field } from './shared'
import { CacheStat } from './CacheTab'
// ─── Tab 7: 日志 ──────────────────────────────────────

const LOG_CATEGORIES = [
  { value: '', label: '全部' },
  { value: 'auth', label: '认证' },
  { value: 'upload', label: '上传' },
  { value: 'photo', label: '照片' },
  { value: 'album', label: '相册' },
  { value: 'story', label: '叙事' },
  { value: 'blog', label: '博客' },
  { value: 'storage', label: '存储' },
  { value: 'ai', label: 'AI' },
  { value: 'system', label: '系统' },
]

const LOG_LEVELS = [
  { value: '', label: '全部' },
  { value: 'info', label: '信息' },
  { value: 'warn', label: '警告' },
  { value: 'error', label: '错误' },
]

const LOG_LEVEL_COLORS: Record<string, { bg: string; text: string }> = {
  info: { bg: 'color-mix(in srgb, #3b82f6 14%, transparent)', text: '#3b82f6' },
  warn: { bg: 'color-mix(in srgb, #f59e0b 14%, transparent)', text: '#d97706' },
  error: { bg: 'color-mix(in srgb, var(--destructive) 12%, transparent)', text: 'var(--destructive)' },
}

interface LogStats {
  total?: number
  enabled?: boolean
  by_category?: Record<string, number>
}

export function LogTab() {
  const { language } = usePreferences()
  const [logConfig, setLogConfig] = useState({ enabled: false, max_entries: 1000 })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [logs, setLogs] = useState<services.LogEntry[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [stats, setStats] = useState<LogStats | null>(null)
  const [clearLogsDialog, setClearLogsDialog] = useState(false)

  useCachedPageEffect(() => {
    setLoading(true)
    void GetLogConfig()
      .then((result) => {
        setLogConfig({
          enabled: Boolean(result.enabled),
          max_entries: Number(result.max_entries ?? 1000),
        })
      })
      .finally(() => setLoading(false))
  }, [])

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const result = await GetLogs(categoryFilter, levelFilter, 200)
      setLogs(result || [])
    } catch {} finally { setLogsLoading(false) }
  }, [categoryFilter, levelFilter])

  const fetchStats = useCallback(async () => {
    try {
      const result = await GetLogStats()
      setStats(result as LogStats)
    } catch {}
  }, [])

  useCachedPageEffect(() => { void fetchLogs(); void fetchStats() }, [fetchLogs, fetchStats])

  const handleSaveConfig = async () => {
    setSaving(true)
    try {
      await UpdateLogConfig(logConfig)
      toast.success('日志配置已保存')
    } catch (err: unknown) {
      toast.error('保存失败: ' + getErrorMessage(err))
    } finally { setSaving(false) }
  }

  const handleClearLogs = async () => {
    try {
      await ClearLogs()
      toast.success('日志已清空')
      setClearLogsDialog(false)
      fetchLogs()
      fetchStats()
    } catch {}
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8" style={{ color: 'var(--muted-foreground)' }}>
        <Loader2 size={16} className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 日志配置 */}
      <Section title="日志配置">
        <Field label="启用日志" description="开启后将记录用户操作日志">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox"
              checked={logConfig.enabled}
              onChange={e => setLogConfig(prev => ({ ...prev, enabled: e.target.checked }))}
              className="rounded" />
            <span className="text-xs">启用操作日志</span>
          </label>
        </Field>

        <Field label="最大日志条数" description="超出限制时自动清理旧日志">
          <input type="number" value={logConfig.max_entries}
            onChange={e => setLogConfig(prev => ({ ...prev, max_entries: parseInt(e.target.value) || 1000 }))}
            min={100}
            max={10000}
            className={inputClass}
            style={inputStyle} />
        </Field>

        <div className="pt-2">
          <button onClick={handleSaveConfig} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-xs rounded-md disabled:opacity-50"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </Section>

      {/* 日志统计 */}
      {stats && (
        <Section title="日志统计">
          <div className="grid grid-cols-2 gap-3">
            <CacheStat label="总日志数" value={String(stats.total || 0)} />
            <CacheStat label="状态" value={stats.enabled ? '已启用' : '已禁用'} />
          </div>
          {stats.by_category && (
            <div className="flex flex-wrap gap-2 mt-2">
              {Object.entries(stats.by_category).map(([cat, count]) => (
                <span key={cat} className="text-[10px] px-2 py-0.5 rounded"
                  style={{ backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                  {LOG_CATEGORIES.find(c => c.value === cat)?.label || cat}: {count as number}
                </span>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* 日志查看 */}
      <Section title="操作日志">
        {/* 过滤器 */}
        <div className="flex items-center gap-2 mb-4">
          <Filter size={14} style={{ color: 'var(--muted-foreground)' }} />
          <SelectDropdown
            value={categoryFilter}
            options={LOG_CATEGORIES.filter(c => c.value !== '').map(c => ({ value: c.value, label: c.label }))}
            onChange={value => setCategoryFilter(String(value))}
            placeholder="全部"
            clearLabel="全部"
            size="sm"
            ariaLabel="日志分类筛选"
            className="w-36"
          />
          <SelectDropdown
            value={levelFilter}
            options={LOG_LEVELS.filter(l => l.value !== '').map(l => ({ value: l.value, label: l.label }))}
            onChange={value => setLevelFilter(String(value))}
            placeholder="全部"
            clearLabel="全部"
            size="sm"
            ariaLabel="日志级别筛选"
            className="w-36"
          />
          <div className="flex-1" />
          <button onClick={() => void OpenLogDir()}
            className={btnOutline}>
            <FolderOpen size={12} />
            打开目录
          </button>
          <button onClick={() => setClearLogsDialog(true)}
            className={btnOutline}
            style={{ color: 'var(--destructive)' }}>
            <Trash size={12} />
            清空
          </button>
        </div>

        {/* 日志列表 */}
        {logsLoading ? (
          <div className="flex items-center justify-center py-8" style={{ color: 'var(--muted-foreground)' }}>
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8" style={{ color: 'var(--muted-foreground)' }}>
            <FileText size={24} className="mb-2 opacity-40" />
            <p className="text-xs">暂无日志</p>
          </div>
        ) : (
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {logs.map((log, index) => (
              <div key={index}
                className="flex items-start gap-2 px-3 py-2 rounded text-xs"
                style={{ backgroundColor: index % 2 === 0 ? 'transparent' : 'var(--muted)' }}>
                <span className="text-[10px] font-mono shrink-0 mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                  {new Date(log.timestamp).toLocaleString()}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                  style={{
                    backgroundColor: LOG_LEVEL_COLORS[log.level]?.bg || 'var(--muted)',
                    color: LOG_LEVEL_COLORS[log.level]?.text || 'var(--muted-foreground)',
                  }}>
                  {log.level}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}>
                  {LOG_CATEGORIES.find(c => c.value === log.category)?.label || log.category}
                </span>
                <span className="font-medium">{log.action}</span>
                <span style={{ color: 'var(--muted-foreground)' }}>{log.message}</span>
                {log.details && (
                  <span className="text-[10px] truncate" style={{ color: 'var(--muted-foreground)' }}>
                    {log.details}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <SimpleDeleteDialog
        isOpen={clearLogsDialog}
        title="清空日志"
        message="确定要清空所有操作日志吗？此操作不可撤销。"
        onConfirm={handleClearLogs}
        onCancel={() => setClearLogsDialog(false)}
        t={(key) => t(key, language)}
      />
    </div>
  )
}
