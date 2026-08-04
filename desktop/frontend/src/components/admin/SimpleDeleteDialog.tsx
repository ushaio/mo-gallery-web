'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { AdminButton } from '@/components/admin/AdminButton'

interface SimpleDeleteDialogProps {
  isOpen: boolean
  title?: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  pendingLabel?: string
  confirmIcon?: 'trash' | 'refresh'
  confirmVariant?: 'destructive' | 'primary'
  onConfirm: () => void | Promise<void>
  onCancel: () => void
  t: (key: string) => string
}

export function SimpleDeleteDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  pendingLabel,
  confirmIcon = 'trash',
  confirmVariant = 'destructive',
  onConfirm,
  onCancel,
  t,
}: SimpleDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const isDeletingRef = useRef(isDeleting)
  const onConfirmRef = useRef(onConfirm)
  const onCancelRef = useRef(onCancel)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(false)

  // Keep refs in sync every render so the keyboard handler never reads stale closures
  onConfirmRef.current = onConfirm
  onCancelRef.current = onCancel
  isDeletingRef.current = isDeleting
  if (isOpen && !wasOpenRef.current && typeof document !== 'undefined') {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }
  wasOpenRef.current = isOpen

  const handleConfirm = async () => {
    if (isDeletingRef.current) return
    isDeletingRef.current = true
    setIsDeleting(true)
    try {
      await onConfirmRef.current()
    } finally {
      isDeletingRef.current = false
      setIsDeleting(false)
    }
  }

  const handleCancel = () => {
    if (isDeletingRef.current) return
    onCancelRef.current()
  }

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (isDeletingRef.current) return
        onCancelRef.current()
        return
      }

      if (event.key !== 'Tab') return
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? [])
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus()
      previousFocusRef.current = null
    }
  }, [isOpen])

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
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="simple-delete-dialog-title"
              aria-describedby="simple-delete-dialog-message"
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="bg-background border border-border p-8 max-w-md w-full shadow-2xl pointer-events-auto rounded-lg"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className={`w-12 h-12 flex items-center justify-center rounded-lg ${confirmVariant === 'primary' ? 'bg-primary/10' : 'bg-destructive/10'}`}>
                  {confirmVariant === 'primary'
                    ? <RefreshCw className="w-6 h-6 text-primary" />
                    : <AlertTriangle className="w-6 h-6 text-destructive" />}
                </div>
                <div>
                  <h3 id="simple-delete-dialog-title" className="font-serif text-xl font-light uppercase tracking-tight">
                    {title || t('common.confirm')}
                  </h3>
                </div>
              </div>

              <div className="mb-6">
                <p id="simple-delete-dialog-message" className="text-sm text-foreground leading-relaxed">
                  {message || t('admin.confirm_delete_single') + '?'}
                </p>
              </div>

              <div className="flex gap-3">
                <AdminButton
                  autoFocus
                  onClick={handleCancel}
                  disabled={isDeleting}
                  adminVariant="outline"
                  size="xl"
                  className="flex-1 rounded-md"
                >
                  {cancelLabel || t('common.cancel')}
                </AdminButton>
                <AdminButton
                  onClick={handleConfirm}
                  disabled={isDeleting}
                  adminVariant={confirmVariant}
                  size="xl"
                  className="flex-1 rounded-md flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{pendingLabel || `${confirmLabel || t('common.delete')}...`}</span>
                    </>
                  ) : (
                    <>
                      {confirmIcon === 'refresh' ? <RefreshCw className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                      <span>{confirmLabel || t('common.delete')}</span>
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