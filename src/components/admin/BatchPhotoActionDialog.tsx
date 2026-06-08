'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, SlidersHorizontal, X } from 'lucide-react'
import { getFilmRolls } from '@/lib/api/film-rolls'
import type { FilmRollDto } from '@/lib/api/types'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminInput, AdminSelect } from '@/components/admin/AdminFormControls'

type BatchAction = 'photoType' | 'takenAt' | 'showFlag'
type PhotoType = 'digital' | 'film'

export interface BatchPhotoActionInput {
  action: BatchAction
  photoType?: PhotoType
  filmRollId?: string | null
  takenAt?: string
  showFlag?: boolean
}

interface BatchPhotoActionDialogProps {
  isOpen: boolean
  count: number
  isSubmitting?: boolean
  onConfirm: (input: BatchPhotoActionInput) => Promise<void> | void
  onCancel: () => void
  t: (key: string) => string
  notify?: (message: string, type?: 'success' | 'error' | 'info') => void
}

export function BatchPhotoActionDialog({
  isOpen,
  count,
  isSubmitting = false,
  onConfirm,
  onCancel,
  t,
  notify,
}: BatchPhotoActionDialogProps) {
  const [action, setAction] = useState<BatchAction>('photoType')
  const [photoType, setPhotoType] = useState<PhotoType>('digital')
  const [filmRollId, setFilmRollId] = useState('')
  const [takenAt, setTakenAt] = useState('')
  const [showFlag, setShowFlag] = useState(true)
  const [filmRolls, setFilmRolls] = useState<FilmRollDto[]>([])
  const [loadingFilmRolls, setLoadingFilmRolls] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setAction('photoType')
    setPhotoType('digital')
    setFilmRollId('')
    setTakenAt('')
    setShowFlag(true)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || photoType !== 'film') return
    let cancelled = false

    async function loadFilmRolls() {
      setLoadingFilmRolls(true)
      try {
        const data = await getFilmRolls()
        if (!cancelled) setFilmRolls(data)
      } catch (error) {
        if (!cancelled) notify?.(error instanceof Error ? error.message : t('common.error'), 'error')
      } finally {
        if (!cancelled) setLoadingFilmRolls(false)
      }
    }

    loadFilmRolls()
    return () => {
      cancelled = true
    }
  }, [isOpen, photoType, notify, t])

  const actionOptions = useMemo(() => [
    { value: 'photoType', label: t('admin.batch_action_photo_type') || 'Modify photo type' },
    { value: 'takenAt', label: t('admin.batch_action_taken_at') || 'Modify date taken' },
    { value: 'showFlag', label: t('admin.batch_action_show_flag') || 'Modify gallery visibility' },
  ], [t])

  const photoTypeOptions = useMemo(() => [
    { value: 'digital', label: t('admin.upload_type_digital') },
    { value: 'film', label: t('admin.upload_type_film') },
  ], [t])

  const filmRollOptions = useMemo(() => filmRolls.map((roll) => ({
    value: roll.id,
    label: `${roll.name} · ${roll.brand} ${roll.iso}`,
  })), [filmRolls])

  const canConfirm = !isSubmitting && (
    action === 'photoType'
      ? photoType !== 'film' || filmRollId.length > 0
      : action === 'takenAt'
        ? takenAt.length > 0 && Number.isFinite(new Date(takenAt).getTime())
        : true
  )

  const handleConfirm = async () => {
    if (!canConfirm) return
    if (action === 'takenAt') {
      await onConfirm({
        action,
        takenAt: new Date(takenAt).toISOString(),
      })
      return
    }
    if (action === 'showFlag') {
      await onConfirm({
        action,
        showFlag,
      })
      return
    }

    await onConfirm({
      action,
      photoType,
      filmRollId: photoType === 'film' ? filmRollId : null,
    })
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm"
            onClick={() => !isSubmitting && onCancel()}
          />
          <div className="fixed inset-0 z-[121] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="bg-background border border-border p-8 max-w-2xl w-full shadow-2xl pointer-events-auto"
            >
              <div className="flex items-start justify-between gap-4 mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 flex items-center justify-center">
                    <SlidersHorizontal className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-serif text-xl font-light uppercase tracking-tight">
                      {t('admin.batch_actions') || 'Batch Actions'}
                    </h3>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
                      {count} {t('admin.selected') || 'selected'}
                    </p>
                  </div>
                </div>
                <AdminButton
                  onClick={onCancel}
                  disabled={isSubmitting}
                  adminVariant="icon"
                  size="xs"
                  className="-mt-2 -mr-2"
                  aria-label={t('common.cancel')}
                >
                  <X className="w-4 h-4" />
                </AdminButton>
              </div>

              <div className="grid gap-5 md:grid-cols-[220px_1fr]">
                <div className="space-y-3">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {t('admin.batch_action') || 'Action'}
                  </label>
                  <div className="border border-border bg-muted/20 p-2">
                    {actionOptions.map((option) => (
                      <AdminButton
                        key={option.value}
                        onClick={() => setAction(option.value as BatchAction)}
                        adminVariant="unstyled"
                        className={`w-full justify-start px-3 py-2 text-left text-xs font-bold uppercase tracking-wider transition-colors ${
                          action === option.value
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        {option.label}
                      </AdminButton>
                    ))}
                  </div>
                </div>

                <div>
                  {action === 'photoType' && (
                    <div className="space-y-4 border border-border bg-muted/20 p-4 min-h-[144px]">
                      <div>
                        <AdminSelect value={photoType} onChange={(value) => setPhotoType(value as PhotoType)} options={photoTypeOptions} />
                      </div>

                      {photoType === 'film' && (
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                            {t('admin.film_roll_select')}
                          </label>
                          <AdminSelect
                            value={filmRollId}
                            onChange={setFilmRollId}
                            options={filmRollOptions}
                            placeholder={loadingFilmRolls ? t('common.loading') : t('admin.film_roll_select')}
                            disabled={loadingFilmRolls || filmRollOptions.length === 0}
                          />
                          {filmRollOptions.length === 0 && !loadingFilmRolls && (
                            <p className="mt-2 text-xs text-muted-foreground">{t('admin.no_film_roll')}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {action === 'takenAt' && (
                    <div className="space-y-4 border border-border bg-muted/20 p-4 min-h-[144px]">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                          {t('admin.batch_taken_at') || 'Date taken'}
                        </label>
                        <AdminInput
                          type="datetime-local"
                          value={takenAt}
                          onChange={(event) => setTakenAt(event.target.value)}
                        />
                        <p className="mt-2 text-xs text-muted-foreground">
                          {t('admin.batch_taken_at_hint') || 'Applies the same date and time to all selected photos.'}
                        </p>
                      </div>
                    </div>
                  )}
                  {action === 'showFlag' && (
                    <div className="space-y-4 border border-border bg-muted/20 p-4 min-h-[144px]">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                          {t('admin.show_in_gallery')}
                        </label>
                        <AdminSelect
                          value={showFlag ? 'true' : 'false'}
                          onChange={(value) => setShowFlag(value === 'true')}
                          options={[
                            { value: 'true', label: t('common.enabled') },
                            { value: 'false', label: t('common.disabled') },
                          ]}
                        />
                        <p className="mt-2 text-xs text-muted-foreground">
                          {t('admin.batch_show_flag_hint') || 'Controls whether selected photos appear in the public gallery.'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <AdminButton
                  onClick={onCancel}
                  disabled={isSubmitting}
                  adminVariant="outline"
                  size="md"
                >
                  {t('common.cancel')}
                </AdminButton>
                <AdminButton
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                  adminVariant="primary"
                  size="md"
                  className="gap-2"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {t('common.confirm')}
                </AdminButton>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
