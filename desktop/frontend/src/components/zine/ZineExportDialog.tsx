import { useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { BookOpen, Download, Loader2, Printer, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { t } from '@/lib/i18n'
import { collectLowResSlots, getSpreadPageNumbers, getTotalPageCount, hasCoverSpread, isSaddleStitchReady, MIN_PRINT_DPI } from '@/lib/zine/print'
import type { ZineProject } from '@/lib/zine/types'
import { usePreferences } from '@/store/preferences'

import { exportZinePdf, type ZinePdfVariant } from './export/ZinePdfExporter'

interface ZineExportDialogProps {
  open: boolean
  project: ZineProject
  onClose: () => void
}

const LOW_RES_LIST_LIMIT = 5

export function ZineExportDialog({ open, project, onClose }: ZineExportDialogProps) {
  const { language } = usePreferences()
  const [variant, setVariant] = useState<ZinePdfVariant>('print')
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  if (typeof document === 'undefined') return null

  const totalPages = getTotalPageCount(project)
  const saddleReady = isSaddleStitchReady(project)
  const coverExists = hasCoverSpread(project)
  const lowResSlots = collectLowResSlots(project)

  function describeSpread(spreadIndex: number) {
    const pages = getSpreadPageNumbers(project, spreadIndex)
    if (pages === 'cover') return `${t('admin.zine_back_cover', language)}/${t('admin.zine_front_cover', language)}`
    return `P${pages.left}-P${pages.right}`
  }

  async function handleExport() {
    if (exporting) return
    setExporting(true)
    setProgress(null)
    try {
      await exportZinePdf(project, {
        variant,
        onAssetProgress: (done, total) => setProgress({ done, total }),
      })
      toast.success(t('admin.zine_export_success', language))
      onClose()
    } catch (error) {
      console.error('PDF export failed', error)
      const detail = error instanceof Error && error.message ? `：${error.message}` : ''
      toast.error(`${t('admin.zine_export_failed', language)}${detail}`)
    } finally {
      setExporting(false)
      setProgress(null)
    }
  }

  const modes: Array<{ id: ZinePdfVariant; icon: typeof Printer; title: string; description: string }> = [
    { id: 'print', icon: Printer, title: t('admin.zine_export_mode_print', language), description: t('admin.zine_export_mode_print_desc', language) },
    { id: 'spread', icon: BookOpen, title: t('admin.zine_export_mode_spread', language), description: t('admin.zine_export_mode_spread_desc', language) },
  ]

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm"
            onClick={() => !exporting && onClose()}
          />
          <div className="pointer-events-none fixed inset-0 z-[121] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="pointer-events-auto w-full max-w-md rounded-xl border bg-background p-6 shadow-2xl"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Download size={18} style={{ color: 'var(--primary)' }} />
                </div>
                <div>
                  <h3 className="font-serif text-lg font-medium tracking-tight">{t('admin.zine_export_pdf', language)}</h3>
                  <p className="text-[11px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
                    {t('admin.zine_page_total', language, { count: totalPages })}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {modes.map((mode) => {
                  const active = variant === mode.id
                  const Icon = mode.icon
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setVariant(mode.id)}
                      disabled={exporting}
                      className="flex w-full items-start gap-3 rounded-lg border p-3 text-left transition hover:border-primary disabled:opacity-60"
                      style={{
                        borderColor: active ? 'var(--primary)' : 'var(--border)',
                        backgroundColor: active ? 'var(--accent)' : 'transparent',
                        boxShadow: active ? '0 0 0 1px var(--primary)' : undefined,
                      }}
                    >
                      <Icon size={16} className="mt-0.5 shrink-0" style={{ color: active ? 'var(--primary)' : 'var(--muted-foreground)' }} />
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold">{mode.title}</span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                          {mode.description}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="mt-3 space-y-2">
                {variant === 'print' && !saddleReady && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed" style={{ color: 'var(--foreground)' }}>
                    <TriangleAlert size={13} className="mt-0.5 shrink-0 text-amber-500" />
                    {t('admin.zine_export_saddle_warning', language, { count: totalPages })}
                  </div>
                )}

                {variant === 'print' && !coverExists && (
                  <div className="rounded-lg border p-2.5 text-[11px] leading-relaxed" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                    {t('admin.zine_export_no_cover_hint', language)}
                  </div>
                )}

                {lowResSlots.length > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed">
                    <TriangleAlert size={13} className="mt-0.5 shrink-0 text-amber-500" />
                    <div className="min-w-0">
                      <p className="font-medium">{t('admin.zine_export_low_res_title', language, { count: lowResSlots.length, min: MIN_PRINT_DPI })}</p>
                      <ul className="mt-1 space-y-0.5 tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
                        {lowResSlots.slice(0, LOW_RES_LIST_LIMIT).map((warning) => (
                          <li key={warning.slotId} className="truncate">
                            {describeSpread(warning.spreadIndex)} · {warning.assetFileName}（{warning.effectiveDpi} DPI）
                          </li>
                        ))}
                        {lowResSlots.length > LOW_RES_LIST_LIMIT && <li>…</li>}
                      </ul>
                    </div>
                  </div>
                )}

                {variant === 'print' && (
                  <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                    {t('admin.zine_export_rgb_note', language)}
                  </p>
                )}
              </div>

              <div className="mt-5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={exporting}
                  className="flex-1 rounded-md border px-3 py-2 text-xs font-medium transition hover:bg-accent disabled:opacity-50"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {t('common.cancel', language)}
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport()}
                  disabled={exporting}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
                  style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
                >
                  {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  {exporting
                    ? progress
                      ? t('admin.zine_export_progress', language, { done: progress.done, total: progress.total })
                      : t('admin.zine_exporting', language)
                    : t('admin.zine_export_confirm', language)}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
