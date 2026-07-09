import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, ChevronDown, Download, Hash, ImagePlus, LayoutTemplate, Loader2, Redo2, Type, Undo2 } from 'lucide-react'

import { t } from '@/lib/i18n'
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
  const [exportOpen, setExportOpen] = useState(false)

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

      <button
        type="button"
        onClick={() => setExportOpen(true)}
        className="ml-1 flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-opacity hover:opacity-90"
        style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
      >
        <Download size={14} />
        {t('admin.zine_export_pdf', language)}
      </button>

      <ZineExportDialog open={exportOpen} project={project} onClose={() => setExportOpen(false)} />
    </header>
  )
}
