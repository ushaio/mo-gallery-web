// 系统设置 · 外观

import { useState } from 'react'
import { toast } from 'sonner'
import { useCachedPageEffect } from '@/hooks/useCachedPageEffect'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { Skeleton } from '@/components/admin/Skeleton'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import { getWindowAppearance, restartApplication, updateWindowStyle, WindowAppearance, WindowStyle } from '@/lib/window-appearance'
import {
  Info,
  Loader2,
  Check,
  AppWindow,
  Monitor,
  Moon,
  Sun,
} from 'lucide-react'
import { getErrorMessage, Section } from './shared'
// ─── Tab 2: 外观 ─────────────────────────────────────

const themeChoices = [
  { value: 'light' as const, label: '浅色', icon: Sun },
  { value: 'dark' as const, label: '深色', icon: Moon },
  { value: 'system' as const, label: '跟随系统', icon: Monitor },
]

const windowStyleChoices: { value: WindowStyle; label: string; description: string }[] = [
  { value: 'native', label: '原生', description: '使用操作系统提供的标题栏与窗口控制按钮。' },
  { value: 'integrated', label: '一体化', description: '窗口控件与侧栏合为同一行，使用与应用界面一致的紧凑标题栏。' },
]

export function AppearanceTab() {
  const { theme, setTheme, language } = usePreferences()
  const [appearance, setAppearance] = useState<WindowAppearance | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingStyle, setSavingStyle] = useState<WindowStyle | null>(null)
  const [restartDialogOpen, setRestartDialogOpen] = useState(false)

  useCachedPageEffect(() => {
    void getWindowAppearance()
      .then((result) => setAppearance(result))
      .catch((error: unknown) => toast.error('读取窗口外观失败: ' + getErrorMessage(error)))
      .finally(() => setLoading(false))
  }, [])

  const handleWindowStyleChange = async (style: WindowStyle) => {
    if (savingStyle || appearance?.configuredStyle === style) return
    setSavingStyle(style)
    try {
      const result = await updateWindowStyle(style)
      setAppearance(result)
      if (result.activeStyle === result.configuredStyle) {
        toast.success('窗口风格已保存')
      } else {
        setRestartDialogOpen(true)
      }
    } catch (error: unknown) {
      toast.error('保存窗口风格失败: ' + getErrorMessage(error))
    } finally {
      setSavingStyle(null)
    }
  }

  const handleRestartConfirm = async () => {
    toast.success('正在重新加载窗口…')
    try {
      await restartApplication()
      setRestartDialogOpen(false)
    } catch (error: unknown) {
      toast.error('自动切换窗口风格失败: ' + getErrorMessage(error))
    }
  }

  const handleRestartCancel = () => {
    setRestartDialogOpen(false)
    toast.info('窗口风格已保存，将在下次启动时生效')
  }

  const configuredStyle = appearance?.configuredStyle ?? 'native'
  const restartRequired = Boolean(appearance && appearance.activeStyle !== appearance.configuredStyle)

  return (
    <div className="space-y-6">
      <Section title="主题" description="调整应用界面的明暗外观，修改后立即生效。">
        <div className="flex h-10 items-center rounded-md border bg-background p-0.5" role="radiogroup" aria-label="主题">
          {themeChoices.map(({ value, label, icon: Icon }) => {
            const selected = theme === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setTheme(value)}
                className="flex h-8 min-w-0 flex-1 items-center justify-center gap-2 rounded px-3 text-xs font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                style={{
                  backgroundColor: selected ? 'var(--accent)' : 'transparent',
                  color: selected ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
                }}
              >
                <Icon size={14} />
                <span className="truncate">{label}</span>
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="窗口风格" description="窗口边框由桌面运行时创建，保存后会询问是否立即重启以应用新的外观。">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full rounded-md" />
            <Skeleton className="h-16 w-full rounded-md" />
          </div>
        ) : (
          <div className="divide-y border-y" role="radiogroup" aria-label="窗口风格" style={{ borderColor: 'var(--border)' }}>
            {windowStyleChoices.map(({ value, label, description }) => {
              const selected = configuredStyle === value
              const saving = savingStyle === value
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={savingStyle !== null}
                  onClick={() => void handleWindowStyleChange(value)}
                  className="flex w-full items-center gap-3 px-2 py-3 text-left transition-colors hover:bg-secondary disabled:cursor-wait disabled:opacity-60"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--muted)' }}>
                    {value === 'native' ? <Monitor size={16} /> : <AppWindow size={16} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium">{label}</span>
                    <span className="mt-0.5 block text-[11px] leading-4" style={{ color: 'var(--muted-foreground)' }}>{description}</span>
                  </span>
                  {saving ? <Loader2 size={14} className="shrink-0 animate-spin" /> : selected ? <Check size={14} className="shrink-0" /> : null}
                </button>
              )
            })}
          </div>
        )}

        {restartRequired && (
          <div className="flex items-start gap-2 rounded-md border px-3 py-2.5 text-[11px] leading-5" role="status" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}>
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>当前窗口仍使用“{appearance?.activeStyle === 'integrated' ? '一体化' : '原生'}”风格；已保存的“{configuredStyle === 'integrated' ? '一体化' : '原生'}”风格将在下次启动时生效。</span>
          </div>
        )}
      </Section>

      <SimpleDeleteDialog
        isOpen={restartDialogOpen}
        title="应用窗口风格"
        message={`窗口风格已保存为“${configuredStyle === 'integrated' ? '一体化' : '原生'}”。是否立即重启 MO Gallery Desktop 以应用新风格？`}
        confirmLabel="立即重启"
        cancelLabel="稍后重启"
        pendingLabel="正在重启..."
        confirmIcon="refresh"
        confirmVariant="primary"
        onConfirm={handleRestartConfirm}
        onCancel={handleRestartCancel}
        t={(key) => t(key, language)}
      />
    </div>
  )
}
