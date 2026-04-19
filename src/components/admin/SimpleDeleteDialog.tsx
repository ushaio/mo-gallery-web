'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react'
import { AdminButton } from '@/components/admin/AdminButton'

interface SimpleDeleteDialogProps {
  isOpen: boolean
  title?: string
  message?: string
  onConfirm: () => void | Promise<void>
  onCancel: () => void
  t: (key: string) => string
}

export function SimpleDeleteDialog({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  t,
}: SimpleDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleConfirm = async () => {
    setIsDeleting(true)
    try {
      await onConfirm()
    } finally {
      setIsDeleting(false)
    }
  }

  const handleCancel = () => {
    if (isDeleting) return
    onCancel()
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm"
            onClick={handleCancel}
          />
          <div className="fixed inset-0 z-[121] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="bg-background border border-border p-8 max-w-md w-full shadow-2xl pointer-events-auto rounded-lg"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-destructive/10 flex items-center justify-center rounded-lg">
                  <AlertTriangle className="w-6 h-6 text-destructive" />
                </div>
                <div>
                  <h3 className="font-serif text-xl font-light uppercase tracking-tight">
                    {title || t('common.confirm')}
                  </h3>
                </div>
              </div>

              <div className="mb-6">
                <p className="text-sm text-foreground leading-relaxed">
                  {message || t('admin.confirm_delete_single') + '?'}
                </p>
              </div>

              <div className="flex gap-3">
                <AdminButton
                  onClick={handleCancel}
                  disabled={isDeleting}
                  adminVariant="outline"
                  size="xl"
                  className="flex-1 rounded-md"
                >
                  {t('common.cancel')}
                </AdminButton>
                <AdminButton
                  onClick={handleConfirm}
                  disabled={isDeleting}
                  adminVariant="destructive"
                  size="xl"
                  className="flex-1 rounded-md flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{t('common.delete')}...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>{t('common.delete')}</span>
                    </>
                  )}
                </AdminButton>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}