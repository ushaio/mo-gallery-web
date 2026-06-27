import { PageHeader } from '@/components/layout/PageHeader'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { Bot } from 'lucide-react'

export function AiAssistantPage() {
  const { language } = usePreferences()
  return (
    <>
      <PageHeader title={t('nav.aiAssistant', language)} />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Bot size={48} className="mx-auto mb-4" style={{ color: 'var(--muted-foreground)' }} />
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            AI 助手
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
            (Phase 6 实现 AI 对话功能)
          </p>
        </div>
      </div>
    </>
  )
}
