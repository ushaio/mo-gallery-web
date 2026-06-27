import { PageHeader } from '@/components/layout/PageHeader'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { HardDrive } from 'lucide-react'

export function StoragePage() {
  const { language } = usePreferences()
  return (
    <>
      <PageHeader title={t('storage.title', language)} />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <HardDrive size={48} className="mx-auto mb-4" style={{ color: 'var(--muted-foreground)' }} />
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            存储管理
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
            (Phase 5 实现存储扫描与清理)
          </p>
        </div>
      </div>
    </>
  )
}
