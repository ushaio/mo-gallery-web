import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import type { ZineProject } from '@/lib/zine/types'
import { useZineStore } from '@/store/zine'

import { exportZinePdf } from './export/ZinePdfExporter'
import { TemplateGallery } from './TemplateGallery'

interface ZineToolbarProps {
  project: ZineProject
  saving: boolean
  dirty: boolean
  onRename: (title: string) => void
  onUndo: () => void
  onRedo: () => void
  onAddSpread: () => void
  onAddTemplate: (templateId: string) => void
  canvasZoom: number
  onCanvasZoomChange: (zoom: number) => void
}

export function ZineToolbar({ project, saving, dirty, onRename, onUndo, onRedo, onAddSpread, onAddTemplate, canvasZoom, onCanvasZoomChange }: ZineToolbarProps) {
  const [title, setTitle] = useState(project.title)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const canUndo = useZineStore((state) => state.undoStack.length > 0)
  const canRedo = useZineStore((state) => state.redoStack.length > 0)
  const saveLabel = saving ? '保存中...' : dirty ? '未保存' : '已保存'

  useEffect(() => {
    setTitle(project.title)
  }, [project.title])

  function commitTitle() {
    const nextTitle = title.trim() || project.title
    setTitle(nextTitle)
    if (nextTitle !== project.title) onRename(nextTitle)
  }

  async function handleExportPdf() {
    setExporting(true)
    try {
      await exportZinePdf(project)
      toast.success('PDF 已导出')
    } catch (error) {
      console.error('PDF export failed', error)
      toast.error('PDF 导出失败')
    } finally {
      setExporting(false)
    }
  }

  function setZoom(nextZoom: number) {
    onCanvasZoomChange(Math.min(1.6, Math.max(0.4, nextZoom)))
  }

  return (
    <div className="flex min-h-16 items-center gap-3 border-b bg-card px-4" style={{ borderColor: 'var(--border)' }}>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={commitTitle}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
        className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring"
        style={{ borderColor: 'var(--border)' }}
        aria-label="Zine project title"
      />
      <span className="text-xs" style={{ color: saving || dirty ? 'var(--primary)' : 'var(--muted-foreground)' }}>{saveLabel}</span>
      <button type="button" className="rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45" style={{ borderColor: 'var(--border)' }} onClick={onUndo} disabled={!canUndo}>Undo</button>
      <button type="button" className="rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45" style={{ borderColor: 'var(--border)' }} onClick={onRedo} disabled={!canRedo}>Redo</button>
      <div className="flex items-center gap-1 rounded-md border px-1 py-1" style={{ borderColor: 'var(--border)' }}>
        <button type="button" className="h-8 w-8 rounded text-sm hover:bg-accent" onClick={() => setZoom(canvasZoom - 0.1)} aria-label="缩小画布">−</button>
        <span className="w-12 text-center text-xs tabular-nums" style={{ color: 'var(--muted-foreground)' }}>{Math.round(canvasZoom * 100)}%</span>
        <button type="button" className="h-8 w-8 rounded text-sm hover:bg-accent" onClick={() => setZoom(canvasZoom + 0.1)} aria-label="放大画布">+</button>
        <button type="button" className="rounded px-2 py-1 text-xs hover:bg-accent" onClick={() => setZoom(0.72)}>适配</button>
      </div>
      <button type="button" className="rounded-md border px-3 py-2 text-sm hover:bg-accent" style={{ borderColor: 'var(--border)' }} onClick={onAddSpread}>Add Spread</button>
      <div className="relative">
        <button type="button" className="rounded-md border px-3 py-2 text-sm hover:bg-accent" style={{ borderColor: 'var(--border)' }} onClick={() => setTemplatesOpen((open) => !open)}>
          Templates
        </button>
        {templatesOpen && (
          <TemplateGallery
            onAddTemplate={(templateId) => {
              onAddTemplate(templateId)
              setTemplatesOpen(false)
            }}
          />
        )}
      </div>
      <button type="button" className="rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45" style={{ borderColor: 'var(--border)' }} onClick={handleExportPdf} disabled={exporting}>
        {exporting ? '导出中...' : 'Export PDF'}
      </button>
    </div>
  )
}
