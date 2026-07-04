import { ZINE_TEMPLATES } from '@/lib/zine/templates'
import { t } from '@/lib/i18n'
import { usePreferences } from '@/store/preferences'

interface TemplateGalleryProps {
  onAddTemplate: (templateId: string) => void
}

export function TemplateGallery({ onAddTemplate }: TemplateGalleryProps) {
  const { language } = usePreferences()

  return (
    <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-lg border bg-popover p-2 shadow-xl" style={{ borderColor: 'var(--border)' }}>
      {ZINE_TEMPLATES.map((template) => (
        <button
          key={template.id}
          type="button"
          className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
          onClick={() => onAddTemplate(template.id)}
        >
          <span>{t(template.nameKey, language)}</span>
          <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{template.pageLayout}</span>
        </button>
      ))}
    </div>
  )
}
