'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { AdminButton as SharedAdminButton, AdminModal } from '@mo-gallery/admin-console'
import { getFilmRolls } from '@/lib/api/film-rolls'
import type { FilmRollDto } from '@/lib/api/types'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminInput, AdminSelect } from '@/components/admin/AdminFormControls'

type BatchAction = 'photoType' | 'takenAt' | 'showFlag'
type PhotoType = 'digital' | 'film'
type ShowFlagValue = '' | 'true' | 'false'

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

/**
 * 批量整理弹窗。
 *
 * 阶段 3 起，弹窗外壳（portal、遮罩、面板、头部、动作区、Esc/遮罩关闭、提交中屏蔽
 * 关闭）由共享包 `@mo-gallery/admin-console` 的 `AdminModal` 承担；本文件只保留 web
 * 后台的批量表单内容（动作选择、类型/拍摄时间/可见性表单、影片胶卷下拉）与异步
 * 提交语义（`onConfirm` 的 await、`notify` 报错、`isSubmitting` 忙碌/禁用态）。
 * 动作选择列表与表单件仍用 web 本地的 `AdminButton`/`AdminFormControls`（
 * 共享包只提供外壳与动作区按钮）。对外 props 与改造前一字不差，调用点零改动。
 */
export function BatchPhotoActionDialog(props: BatchPhotoActionDialogProps) {
  // 关闭即卸载（而不是常驻 + effect 重置）：打开时表单天然回到初始值，
  // 既不触发级联渲染，也和改造前「每次打开重置一次」的语义一致。
  if (!props.isOpen) return null
  return <BatchPhotoActionDialogContent {...props} />
}

function BatchPhotoActionDialogContent({
  isOpen,
  count,
  isSubmitting = false,
  onConfirm,
  onCancel,
  t,
  notify,
}: BatchPhotoActionDialogProps) {
  const [action, setAction] = useState<BatchAction>('photoType')
  const [photoType, setPhotoType] = useState<PhotoType | ''>('')
  const [filmRollId, setFilmRollId] = useState('')
  const [takenAt, setTakenAt] = useState('')
  const [showFlag, setShowFlag] = useState<ShowFlagValue>('')
  const [filmRolls, setFilmRolls] = useState<FilmRollDto[]>([])
  const [loadingFilmRolls, setLoadingFilmRolls] = useState(false)

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
    { value: '', label: t('admin.batch_no_change') || 'No change' },
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
        ? takenAt.length === 0 || Number.isFinite(new Date(takenAt).getTime())
        : true
  )

  const handleConfirm = async () => {
    if (!canConfirm) return
    if (action === 'takenAt') {
      await onConfirm({
        action,
        takenAt: takenAt ? new Date(takenAt).toISOString() : undefined,
      })
      return
    }
    if (action === 'showFlag') {
      await onConfirm({
        action,
        showFlag: showFlag ? showFlag === 'true' : undefined,
      })
      return
    }

    await onConfirm({
      action,
      photoType: photoType || undefined,
      filmRollId: photoType === 'film' ? filmRollId : null,
    })
  }

  // 提交中不允许关闭：共享弹窗的 ✕ 不受 `busy` 约束，故这里显式守一道
  const handleCancel = () => {
    if (isSubmitting) return
    onCancel()
  }

  return (
    <AdminModal
      open={isOpen}
      size="md"
      tone="info"
      icon={<SlidersHorizontal className="h-4 w-4" />}
      title={t('admin.batch_actions') || 'Batch Actions'}
      eyebrow={`${count} ${t('admin.selected') || 'selected'}`}
      onClose={handleCancel}
      busy={isSubmitting}
      footer={
        <>
          <SharedAdminButton variant="outline" onClick={handleCancel} disabled={isSubmitting}>
            {t('common.cancel')}
          </SharedAdminButton>
          <SharedAdminButton
            variant="primary"
            busy={isSubmitting}
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            {t('common.confirm')}
          </SharedAdminButton>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-[220px_1fr]">
        <div className="space-y-3">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {t('admin.batch_action') || 'Action'}
          </label>
          <div className="space-y-2">
            {actionOptions.map((option) => (
              <AdminButton
                key={option.value}
                onClick={() => setAction(option.value as BatchAction)}
                adminVariant="unstyled"
                className={`flex w-full items-center justify-between border border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wider transition-colors ${
                  action === option.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/20 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                aria-current={action === option.value ? 'true' : undefined}
              >
                <span>{option.label}</span>
                <ChevronDown
                  className={`h-4 w-4 -rotate-90 transition-transform ${
                    action === option.value ? 'text-primary-foreground' : ''
                  }`}
                />
              </AdminButton>
            ))}
          </div>
        </div>

        <div className="border border-border bg-muted/20 p-4 min-h-[184px]">
          {action === 'photoType' && (
            <div className="space-y-4">
              <div>
                <AdminSelect
                  value={photoType}
                  onChange={(value) => {
                    const nextPhotoType = value as PhotoType | ''
                    setPhotoType(nextPhotoType)
                    if (nextPhotoType !== 'film') setFilmRollId('')
                  }}
                  options={photoTypeOptions}
                />
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
          )}

          {action === 'showFlag' && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                {t('admin.show_in_gallery')}
              </label>
              <AdminSelect
                value={showFlag}
                onChange={(value) => setShowFlag(value as ShowFlagValue)}
                options={[
                  { value: '', label: t('admin.batch_no_change') || 'No change' },
                  { value: 'true', label: t('common.enabled') },
                  { value: 'false', label: t('common.disabled') },
                ]}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {t('admin.batch_show_flag_hint') || 'Controls whether selected photos appear in the public gallery.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </AdminModal>
  )
}
