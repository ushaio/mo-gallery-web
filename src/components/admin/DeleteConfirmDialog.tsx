'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, AlertTriangle, Loader2, BookOpen, X, ImageIcon, Image, ExternalLink } from 'lucide-react'
import type { PhotoWithStories } from '@/lib/api/types'
import { AdminButton } from '@/components/admin/AdminButton'

interface DeleteConfirmDialogProps {
  isOpen: boolean
  isBulk: boolean
  count: number
  deleteOriginal: boolean
  setDeleteOriginal: (val: boolean) => void
  deleteThumbnail: boolean
  setDeleteThumbnail: (val: boolean) => void
  onConfirm: () => void
  onCancel: () => void
  t: (key: string) => string
  // New props for story check
  isLoading?: boolean
  photosWithStories?: PhotoWithStories[]
}

export function DeleteConfirmDialog({
  isOpen,
  isBulk,
  count,
  deleteOriginal,
  setDeleteOriginal,
  deleteThumbnail,
  setDeleteThumbnail,
  onConfirm,
  onCancel,
  t,
  isLoading = false,
  photosWithStories = [],
}: DeleteConfirmDialogProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false)

  const hasBlockingStories = photosWithStories.length > 0

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

  // Get unique stories from all photos
  const uniqueStories = photosWithStories.reduce((acc, photo) => {
    photo.stories.forEach(story => {
      if (!acc.find(s => s.id === story.id)) {
        acc.push(story)
      }
    })
    return acc
  }, [] as { id: string; title: string }[])

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
            onClick={handleCancel}
          />

          {/* Dialog */}
          <div className="fixed inset-0 z-[121] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="bg-background border border-border p-8 max-w-md w-full shadow-2xl pointer-events-auto"
            >
              {isLoading ? (
                // Loading state
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
                </div>
              ) : hasBlockingStories ? (
                // Blocking state - photos have associated stories
                <>
                  {/* Header with Icon */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 bg-amber-500/10 flex items-center justify-center">
                      <BookOpen className="w-6 h-6 text-amber-500" />
                    </div>
                    <div>
                      <h3 className="font-serif text-xl font-light uppercase tracking-tight">
                        {t('admin.photo_has_stories')}
                      </h3>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
                        {t('admin.cannot_delete')}
                      </p>
                    </div>
                  </div>

                  <div className="mb-6 space-y-4">
                    <p className="text-sm text-foreground leading-relaxed">
                      {isBulk
                        ? t('admin.photos_have_stories_desc')
                        : t('admin.photo_has_stories_desc')}
                    </p>

                    {/* List of associated stories */}
                    <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                      <p className="text-xs font-bold uppercase tracking-wider text-amber-600 mb-3">
                        {t('admin.associated_stories')} ({uniqueStories.length})
                      </p>
                      <ul className="space-y-2 max-h-32 overflow-y-auto">
                          {uniqueStories.map(story => (
                            <li key={story.id}>
                              <AdminButton
                                onClick={() => {
                                  router.push(`/admin/logs?editStory=${story.id}`)
                                }}
                                adminVariant="link"
                                size="sm"
                                className="w-full justify-start gap-2 text-sm text-left hover:text-primary transition-colors group"
                              >
                                <BookOpen className="w-3.5 h-3.5 text-amber-500 shrink-0 group-hover:text-primary transition-colors" />
                                <span className="truncate flex-1">{story.title || t('story.untitled')}</span>
                                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
                              </AdminButton>
                            </li>
                          ))}
                        </ul>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {t('admin.remove_from_stories_first')}
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <AdminButton
                      onClick={handleCancel}
                      adminVariant="outlineMuted"
                      size="lg"
                      className="flex-1 px-6 py-3 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                      <X className="w-4 h-4" />
                      <span>{t('common.cancel')}</span>
                    </AdminButton>
                  </div>
                </>
              ) : (
                // Normal delete confirmation
                <>
                  {/* Header with Icon */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 bg-destructive/10 flex items-center justify-center">
                      <AlertTriangle className="w-6 h-6 text-destructive" />
                    </div>
                    <div>
                      <h3 className="font-serif text-xl font-light uppercase tracking-tight">
                        {t('common.confirm')}
                      </h3>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
                        {isBulk ? `${count} ${t('admin.photos')}` : '1 ' + t('admin.photos').replace(/s$/, '')}
                      </p>
                    </div>
                  </div>

                  <div className="mb-6 space-y-4">
                    <p className="text-sm text-foreground leading-relaxed">
                      {isBulk
                        ? `${t('admin.confirm_delete_multiple')} ${count} ${t('admin.photos')}?`
                        : `${t('admin.confirm_delete_single')}?`}
                    </p>

                    <div className="p-4 bg-muted/30 border border-border space-y-3">
                      {/* Delete Original Option */}
                      <label className="flex items-start gap-3 cursor-pointer group">
                        <div className="relative mt-0.5">
                          <input
                            type="checkbox"
                            checked={deleteOriginal}
                            onChange={(e) => setDeleteOriginal(e.target.checked)}
                            className="sr-only peer"
                            disabled={isDeleting}
                          />
                          <div className="w-5 h-5 border-2 border-border peer-checked:border-destructive peer-checked:bg-destructive transition-all flex items-center justify-center">
                            {deleteOriginal && (
                              <svg className="w-3 h-3 text-destructive-foreground" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                        </div>
                        <div className="flex-1">
                          <span className="text-sm font-bold uppercase tracking-wider text-foreground group-hover:text-destructive transition-colors flex items-center gap-2">
                            <ImageIcon className="w-4 h-4" />
                            {t('admin.delete_original')}
                          </span>
                          <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                            {t('admin.delete_original_hint')}
                          </p>
                        </div>
                      </label>

                      {/* Delete Thumbnail Option */}
                      <label className="flex items-start gap-3 cursor-pointer group">
                        <div className="relative mt-0.5">
                          <input
                            type="checkbox"
                            checked={deleteThumbnail}
                            onChange={(e) => setDeleteThumbnail(e.target.checked)}
                            className="sr-only peer"
                            disabled={isDeleting}
                          />
                          <div className="w-5 h-5 border-2 border-border peer-checked:border-destructive peer-checked:bg-destructive transition-all flex items-center justify-center">
                            {deleteThumbnail && (
                              <svg className="w-3 h-3 text-destructive-foreground" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                        </div>
                        <div className="flex-1">
                          <span className="text-sm font-bold uppercase tracking-wider text-foreground group-hover:text-destructive transition-colors flex items-center gap-2">
                            <Image className="w-4 h-4" />
                            {t('admin.delete_thumbnail')}
                          </span>
                          <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                            {t('admin.delete_thumbnail_hint')}
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <AdminButton
                      onClick={handleCancel}
                      disabled={isDeleting}
                      adminVariant="outline"
                      size="lg"
                      className="flex-1 px-6 py-3 text-xs font-bold uppercase tracking-widest"
                    >
                      {t('common.cancel')}
                    </AdminButton>
                    <AdminButton
                      onClick={handleConfirm}
                      disabled={isDeleting}
                      adminVariant="destructive"
                      size="lg"
                      className="flex-1 px-6 py-3 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2"
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
                </>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

