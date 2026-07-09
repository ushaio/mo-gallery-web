import { useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { BookImage, Loader2 } from 'lucide-react'

import { t } from '@/lib/i18n'
import { CUSTOM_SIZE_MAX_MM, CUSTOM_SIZE_MIN_MM, clampCustomSizeMm, getPageSize, PAGE_SIZES } from '@/lib/zine/page-sizes'
import type { ZineCustomSizeMm, ZinePageOrientation, ZinePageSize } from '@/lib/zine/types'
import { usePreferences } from '@/store/preferences'

export interface ZineCreateOptions {
  pageSize: ZinePageSize
  pageOrientation: ZinePageOrientation
  customSizeMm?: ZineCustomSizeMm
}

interface ZineCreateDialogProps {
  open: boolean
  creating: boolean
  onCancel: () => void
  onCreate: (options: ZineCreateOptions) => void
}

const SIZE_ORDER: Array<Exclude<ZinePageSize, 'custom'>> = ['a5', 'b5', 'a4', 'letter', 'square']

export function ZineCreateDialog({ open, creating, onCancel, onCreate }: ZineCreateDialogProps) {
  const { language } = usePreferences()
  const [pageSize, setPageSize] = useState<ZinePageSize>('a5')
  const [orientation, setOrientation] = useState<ZinePageOrientation>('portrait')
  const [customWidth, setCustomWidth] = useState('148')
  const [customHeight, setCustomHeight] = useState('210')

  if (typeof document === 'undefined') return null

  const customSizeMm = clampCustomSizeMm({ width: Number(customWidth) || 0, height: Number(customHeight) || 0 })
  const preview = getPageSize(pageSize, orientation, customSizeMm)

  function handleCreate() {
    if (creating) return
    onCreate({ pageSize, pageOrientation: orientation, ...(pageSize === 'custom' ? { customSizeMm } : {}) })
  }

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
            onClick={() => !creating && onCancel()}
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
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <BookImage size={18} style={{ color: 'var(--primary)' }} />
                </div>
                <h3 className="font-serif text-lg font-medium tracking-tight">{t('admin.zine_new', language)}</h3>
              </div>

              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
                {t('admin.zine_page_size', language)}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {SIZE_ORDER.map((size) => {
                  const def = PAGE_SIZES[size]
                  const active = pageSize === size
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setPageSize(size)}
                      className="rounded-lg border px-2 py-2 text-left transition hover:border-primary"
                      style={{
                        borderColor: active ? 'var(--primary)' : 'var(--border)',
                        backgroundColor: active ? 'var(--accent)' : 'transparent',
                        boxShadow: active ? '0 0 0 1px var(--primary)' : undefined,
                      }}
                    >
                      <span className="block text-xs font-medium">{def.label}</span>
                      <span className="block text-[10px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
                        {def.widthMm}×{def.heightMm}mm
                      </span>
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => setPageSize('custom')}
                  className="rounded-lg border px-2 py-2 text-left transition hover:border-primary"
                  style={{
                    borderColor: pageSize === 'custom' ? 'var(--primary)' : 'var(--border)',
                    backgroundColor: pageSize === 'custom' ? 'var(--accent)' : 'transparent',
                    boxShadow: pageSize === 'custom' ? '0 0 0 1px var(--primary)' : undefined,
                  }}
                >
                  <span className="block text-xs font-medium">{t('admin.zine_size_custom', language)}</span>
                  <span className="block text-[10px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
                    {customSizeMm.width}×{customSizeMm.height}mm
                  </span>
                </button>
              </div>

              {pageSize === 'custom' && (
                <div className="mt-3 flex items-center gap-2">
                  {(
                    [
                      { label: t('admin.zine_custom_width', language), value: customWidth, set: setCustomWidth },
                      { label: t('admin.zine_custom_height', language), value: customHeight, set: setCustomHeight },
                    ] as const
                  ).map((field) => (
                    <label key={field.label} className="flex flex-1 items-center gap-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {field.label}
                      <input
                        type="number"
                        min={CUSTOM_SIZE_MIN_MM}
                        max={CUSTOM_SIZE_MAX_MM}
                        value={field.value}
                        onChange={(event) => field.set(event.target.value)}
                        className="w-full min-w-0 rounded-md border bg-transparent px-2 py-1.5 text-xs text-foreground outline-none transition focus:ring-1 focus:ring-ring"
                        style={{ borderColor: 'var(--border)' }}
                      />
                    </label>
                  ))}
                </div>
              )}

              <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
                {t('admin.zine_orientation', language)}
              </p>
              <div className="flex gap-2">
                {(['portrait', 'landscape'] as const).map((value) => {
                  const active = orientation === value
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setOrientation(value)}
                      className="flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition hover:border-primary"
                      style={{
                        borderColor: active ? 'var(--primary)' : 'var(--border)',
                        backgroundColor: active ? 'var(--accent)' : 'transparent',
                        boxShadow: active ? '0 0 0 1px var(--primary)' : undefined,
                      }}
                    >
                      {t(value === 'portrait' ? 'admin.zine_orientation_portrait' : 'admin.zine_orientation_landscape', language)}
                    </button>
                  )
                })}
              </div>

              <p className="mt-3 text-[11px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
                {t('admin.zine_create_preview', language, { width: preview.widthMm, height: preview.heightMm })}
              </p>

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={creating}
                  className="flex-1 rounded-md border px-3 py-2 text-xs font-medium transition hover:bg-accent disabled:opacity-50"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {t('common.cancel', language)}
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
                  style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
                >
                  {creating && <Loader2 size={13} className="animate-spin" />}
                  {t('admin.zine_create', language)}
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
