'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, AlertCircle } from 'lucide-react'

interface UrlUpdateConfirmDialogProps {
  isOpen: boolean
  oldUrl: string
  newUrl: string
  onConfirm: (updateUrls: boolean) => void
  onCancel: () => void
  t: (key: string) => string
}

export function UrlUpdateConfirmDialog({
  isOpen,
  oldUrl,
  newUrl,
  onConfirm,
  onCancel,
  t,
}: UrlUpdateConfirmDialogProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm"
            onClick={onCancel}
          />

          {/* Dialog */}
          <div className="fixed inset-0 z-[121] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="bg-background border border-border p-8 max-w-lg w-full shadow-2xl pointer-events-auto"
            >
              {/* Header with Icon */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-primary/10 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-serif text-xl font-light uppercase tracking-tight">
                    {t('admin.url_change_detected')}
                  </h3>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
                    {t('admin.storage_configuration')}
                  </p>
                </div>
              </div>

              <div className="mb-6 space-y-4">
                <p className="text-sm text-foreground leading-relaxed">
                  {t('admin.url_change_message')}
                </p>

                <div className="p-4 bg-muted/30 border border-border space-y-3">
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                      {t('admin.old_url')}
                    </p>
                    <p className="text-xs font-mono text-foreground break-all">
                      {oldUrl || t('admin.not_set')}
                    </p>
                  </div>
                  <div className="h-px bg-border" />
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                      {t('admin.new_url')}
                    </p>
                    <p className="text-xs font-mono text-primary break-all">
                      {newUrl || t('admin.not_set')}
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-amber-500/10 border border-amber-500/30">
                  <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
                    <span className="font-bold">{t('admin.note')}:</span> {t('admin.url_update_note')}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => onConfirm(true)}
                  className="w-full px-6 py-3 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>{t('admin.update_photo_urls')}</span>
                </button>
                <button
                  onClick={() => onConfirm(false)}
                  className="w-full px-6 py-3 border border-border text-foreground text-xs font-bold uppercase tracking-widest hover:bg-muted transition-all"
                >
                  {t('admin.save_without_updating')}
                </button>
                <button
                  onClick={onCancel}
                  className="w-full px-6 py-3 text-muted-foreground text-xs font-bold uppercase tracking-widest hover:text-foreground transition-all"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
