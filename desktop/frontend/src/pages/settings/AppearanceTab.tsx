// 系统设置 · 外观

import { Check, Info, Monitor, Moon, Sun } from 'lucide-react'
import { usePreferences } from '@/store/preferences'
import { ACCENTS, DEFAULT_ACCENT } from '@/lib/accents'
import { useTheme } from '@/contexts/ThemeContext'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import { Section } from './shared'
// ─── Tab 2: 外观 ─────────────────────────────────────

const themeChoices = [
  { value: 'light' as const, label: '浅色', icon: Sun },
  { value: 'dark' as const, label: '深色', icon: Moon },
  { value: 'system' as const, label: '跟随系统', icon: Monitor },
]

export function AppearanceTab() {
  const { theme, setTheme, accent, setAccent } = usePreferences()
  const { resolvedTheme } = useTheme()

  // 配色仅作用于浅色模式：选择非默认配色时自动恢复浅色模式
  const handleAccentChange = (id: (typeof ACCENTS)[number]['id']) => {
    setAccent(id)
    if (id !== DEFAULT_ACCENT && theme !== 'light') setTheme('light')
  }

  return (
    <div className="space-y-6">
      <Section title="主题" description="调整应用界面的明暗外观，修改后立即生效。">
        <SegmentedTabs
          semantic="radio"
          ariaLabel="主题"
          value={theme}
          onChange={(value) => setTheme(value)}
          options={themeChoices}
        />
      </Section>

      <Section title="配色方案" description="以胶片品牌命名的主色，影响主按钮、导航选中态与焦点高亮，修改后立即生效。">
        {resolvedTheme === 'dark' && (
          <div className="mb-2 flex items-start gap-2 rounded-md border px-3 py-2.5 text-[11px] leading-5" role="note" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}>
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>配色仅在浅色模式下生效；选择任一配色会自动切换回浅色模式。</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="配色方案">
          {ACCENTS.map(({ id, name, color }) => {
            const selected = accent === id
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => handleAccentChange(id)}
                className="flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                style={selected ? { borderColor: 'var(--primary)', backgroundColor: 'var(--accent)' } : { borderColor: 'var(--border)' }}
              >
                <span
                  className="flex size-5 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: color, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)' }}
                >
                  {selected && <Check size={12} color={id === 'kodak' ? '#1C1500' : '#FFFFFF'} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium">{name}</span>
                  <span className="block font-mono text-[10px] uppercase" style={{ color: 'var(--muted-foreground)' }}>{id}</span>
                </span>
              </button>
            )
          })}
        </div>
      </Section>
    </div>
  )
}
