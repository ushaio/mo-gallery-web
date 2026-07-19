import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, ChevronDown, Download, FileImage, FileText, Hash, ImagePlus, LayoutTemplate, Loader2, Redo2, Type, Undo2 } from 'lucide-react'
import { toast } from 'sonner'

import { t } from '@/lib/i18n'
import { exportZineSpreadImage, type ZineRasterFormat } from '@/lib/zine/spread-raster'
import { usePreferences } from '@/store/preferences'
import { useZineStore } from '@/store/zine'

import { TemplateGallery } from './TemplateGallery'
import { ZineExportDialog } from './ZineExportDialog'

function ToolbarDivider() {
  return <div className="mx-1 h-5 w-px shrink-0" style={{ backgroundColor: 'var(--border)' }} />
}

interface ToolIconButtonProps {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}

function ToolIconButton({ label, onClick, disabled, children }: ToolIconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-foreground/75 transition hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  )
}

interface ToolTextButtonProps {
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}

function ToolTextButton({ onClick, disabled, children }: ToolTextButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-foreground/75 transition hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  )
}

export function ZineToolbar() {
  const navigate = useNavigate()
  const { language } = usePreferences()
  const project = useZineStore((state) => state.project)
  const activeSpreadId = useZineStore((state) => state.activeSpreadId)
  const saving = useZineStore((state) => state.saving)
  const dirty = useZineStore((state) => state.dirty)
  const canUndo = useZineStore((state) => state.undoStack.length > 0)
  const canRedo = useZineStore((state) => state.redoStack.length > 0)
  const rename = useZineStore((state) => state.rename)
  const undo = useZineStore((state) => state.undo)
  const redo = useZineStore((state) => state.redo)
  const addSpread = useZineStore((state) => state.addSpread)
  const addSlot = useZineStore((state) => state.addSlot)
  const setPageNumbers = useZineStore((state) => state.setPageNumbers)

  const [title, setTitle] = useState(project?.title ?? '')
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [pageNumbersOpen, setPageNumbersOpen] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false)
  const [exportingImage, setExportingImage] = useState<ZineRasterFormat | null>(null)

  useEffect(() => {
    setTitle(project?.title ?? '')
  }, [project?.title])

  if (!project) return null

  // CJK 字符按 2ch 估宽，让标题输入框贴合内容
  const titleDisplayLength = [...title].reduce((length, char) => {
    const code = char.codePointAt(0) ?? 0
    return length + (code > 0x2e7f ? 2 : 1)
  }, 0)

  function commitTitle() {
    if (!project) return
    const nextTitle = title.trim() || project.title
    setTitle(nextTitle)
    if (nextTitle !== project.title) rename(nextTitle)
  }

  async function exportSpreadImage(format: ZineRasterFormat) {
    if (!project || !spreadId || exportingImage) return
    setExportMenuOpen(false)
    setExportingImage(format)
    try {
      await exportZineSpreadImage(project, spreadId, format)
      toast.success(t('admin.zine_export_image_success', language, { format: format === 'jpeg' ? 'JPG' : 'PNG' }))
    } catch (error) {
      console.error(`${format.toUpperCase()} export failed`, error)
      const detail = error instanceof Error && error.message ? `: ${error.message}` : ''
      toast.error(`${t('admin.zine_export_image_failed', language, { format: format === 'jpeg' ? 'JPG' : 'PNG' })}${detail}`)
    } finally {
      setExportingImage(null)
    }
  }

  const spreadId = activeSpreadId ?? project.spreads[0]?.id ?? null
  const pageNumberSettings = project.pageNumbers ?? { enabled: false, position: 'bottom-outer' as const }
  const pageNumberOptions = [
    { key: 'off', label: t('admin.zine_page_numbers_off', language), active: !pageNumberSettings.enabled, apply: () => setPageNumbers({ ...pageNumberSettings, enabled: false }) },
    {
      key: 'center',
      label: t('admin.zine_page_numbers_center', language),
      active: pageNumberSettings.enabled && pageNumberSettings.position === 'bottom-center',
      apply: () => setPageNumbers({ enabled: true, position: 'bottom-center' }),
    },
    {
      key: 'outer',
      label: t('admin.zine_page_numbers_outer', language),
      active: pageNumberSettings.enabled && pageNumberSettings.position === 'bottom-outer',
      apply: () => setPageNumbers({ enabled: true, position: 'bottom-outer' }),
    },
  ]

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b bg-card px-2" style={{ borderColor: 'var(--border)' }}>
      <ToolIconButton label={t('admin.zine_back', language)} onClick={() => navigate('/zine')}>
        <ArrowLeft size={16} />
      </ToolIconButton>

      <ToolbarDivider />

      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={commitTitle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur()
        }}
        className="min-w-0 shrink rounded-md bg-transparent px-2 py-1 font-serif text-[15px] font-medium tracking-tight outline-none transition hover:bg-muted focus:bg-background focus:ring-1 focus:ring-ring"
        style={{ width: `${Math.min(36, Math.max(8, titleDisplayLength + 2))}ch` }}
        aria-label={t('admin.zine_untitled', language)}
        spellCheck={false}
      />

      <span className="flex shrink-0 items-center gap-1.5 px-1.5 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
        {saving ? (
          <Loader2 size={11} className="animate-spin" />
        ) : dirty ? (
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        ) : (
          <Check size={11} />
        )}
        {saving ? t('admin.zine_saving', language) : dirty ? t('admin.zine_unsaved', language) : t('admin.zine_saved', language)}
      </span>

      <div className="min-w-2 flex-1" />

      <ToolIconButton label={`${t('admin.zine_undo', language)} (Ctrl+Z)`} onClick={undo} disabled={!canUndo}>
        <Undo2 size={16} />
      </ToolIconButton>
      <ToolIconButton label={`${t('admin.zine_redo', language)} (Ctrl+Y)`} onClick={redo} disabled={!canRedo}>
        <Redo2 size={16} />
      </ToolIconButton>

      <ToolbarDivider />

      <ToolTextButton onClick={() => spreadId && addSlot(spreadId, 'image')} disabled={!spreadId}>
        <ImagePlus size={15} />
        {t('admin.zine_add_image_slot', language)}
      </ToolTextButton>
      <ToolTextButton onClick={() => spreadId && addSlot(spreadId, 'text')} disabled={!spreadId}>
        <Type size={15} />
        {t('admin.zine_add_text_slot', language)}
      </ToolTextButton>

      <ToolbarDivider />

      <div className="relative shrink-0">
        <ToolTextButton onClick={() => setTemplatesOpen((open) => !open)}>
          <LayoutTemplate size={15} />
          {t('admin.zine_templates', language)}
          <ChevronDown size={13} className={`transition-transform ${templatesOpen ? 'rotate-180' : ''}`} />
        </ToolTextButton>
        {templatesOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-20 cursor-default"
              onClick={() => setTemplatesOpen(false)}
              aria-label={t('common.collapse', language)}
              tabIndex={-1}
            />
            <TemplateGallery
              onAddTemplate={(templateId) => {
                addSpread(templateId)
                setTemplatesOpen(false)
              }}
            />
          </>
        )}
      </div>

      <div className="relative shrink-0">
        <ToolTextButton onClick={() => setPageNumbersOpen((open) => !open)}>
          <Hash size={15} />
          {t('admin.zine_page_numbers', language)}
          <ChevronDown size={13} className={`transition-transform ${pageNumbersOpen ? 'rotate-180' : ''}`} />
        </ToolTextButton>
        {pageNumbersOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-20 cursor-default"
              onClick={() => setPageNumbersOpen(false)}
              aria-label={t('common.collapse', language)}
              tabIndex={-1}
            />
            <div className="absolute right-0 top-full z-30 mt-2 w-40 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-xl" style={{ borderColor: 'var(--border)' }}>
              {pageNumberOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => {
                    option.apply()
                    setPageNumbersOpen(false)
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition hover:bg-accent"
                >
                  {option.label}
                  {option.active && <Check size={13} style={{ color: 'var(--primary)' }} />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="relative ml-1 shrink-0">
        <button
          type="button"
          onClick={() => setExportMenuOpen((open) => !open)}
          disabled={Boolean(exportingImage)}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
          aria-expanded={exportMenuOpen}
          aria-haspopup="menu"
        >
          {exportingImage ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {exportingImage ? t('admin.zine_exporting', language) : t('admin.zine_export', language)}
          <ChevronDown size={13} className={`transition-transform ${exportMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        {exportMenuOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-20 cursor-default"
              onClick={() => setExportMenuOpen(false)}
              aria-label={t('common.collapse', language)}
              tabIndex={-1}
            />
            <div
              role="menu"
              className="absolute right-0 top-full z-30 mt-2 w-56 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-xl"
              style={{ borderColor: 'var(--border)' }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setExportMenuOpen(false)
                  setPdfDialogOpen(true)
                }}
                className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-accent"
              >
                <FileText size={15} className="mt-0.5 shrink-0" />
                <span>
                  <span className="block text-xs font-semibold">{t('admin.zine_export_pdf', language)}</span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">{t('admin.zine_export_pdf_desc', language)}</span>
                </span>
              </button>
              {(['jpeg', 'png'] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  role="menuitem"
                  onClick={() => void exportSpreadImage(format)}
                  disabled={!spreadId}
                  className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-accent disabled:opacity-40"
                >
                  <FileImage size={15} className="mt-0.5 shrink-0" />
                  <span>
                    <span className="block text-xs font-semibold">
                      {t(format === 'jpeg' ? 'admin.zine_export_jpg' : 'admin.zine_export_png', language)}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">{t('admin.zine_export_image_desc', language)}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <ZineExportDialog open={pdfDialogOpen} project={project} onClose={() => setPdfDialogOpen(false)} />
    </header>
  )
}
