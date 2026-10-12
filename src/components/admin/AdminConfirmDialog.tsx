'use client'

import { useEffect, useId, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AdminButton } from './AdminButton'

/**
 * 站点设计语言的确认弹窗（`AdminConfirmDialog`）。
 *
 * 与共享包 `@mo-gallery/admin-console` 里的 `ConsoleConfirmDialog` 是**两回事**：那一件走
 * **admin 区外观**（`.mgac-confirm`：圆角、20px 内边距、无衬线小标题、右对齐小按钮），本件走
 * **站点设计语言**——直角面板、`p-8 max-w-md`、48px 色块图标、serif 大写标题、两个等宽 `xl`
 * 按钮。它同时是 web 后台「退出登录」弹窗的本体：`src/app/admin/layout.tsx` 里原先手写的
 * 那段标记已改为复用本件。
 *
 * 孪生件：官网 `mo-gallery-offical/src/components/console/ui/ConsoleConfirmDialog.tsx`
 * （1:1 镜像，只把 `AdminButton` 换成 `ConsoleButton`、`cn` 换成 `@/lib/console-ui/cn`）。
 *
 * props 刻意与共享件的 `ConsoleConfirmDialog` 同名同义，调用点只需换 import：
 * `open / title / eyebrow / description / tone / icon / options / children / cancelLabel /
 * confirmLabel / confirmVariant / confirmIcon / busy / autoFocusCancel / confirmOnEnter /
 * closeOnBackdrop / onCancel / onConfirm`。
 *
 * 与共享件的有意差异：
 * - **不 portal**：与「退出登录」弹窗一致内联渲染（原先那一件 portal 到 `<body>` 是为了避开
 *   后台外壳的 `overflow: hidden`，而 `fixed` 本身不受 `overflow` 裁切，见文件内注释）。
 * - **`busy` 由本件承担**：宿主的 `AdminButton` 没有 `busy` prop，这里禁用两个按钮并把确认
 *   按钮的图标换成 spinner。
 * - **按钮缺省即不渲染**：只给 `cancelLabel` 时是单按钮的「仅告知」态；两个都不给（加载态）
 *   时整行动作区不渲染。
 */
export type AdminConfirmTone = 'danger' | 'info' | 'plain' | 'warn'

export interface AdminConfirmOption {
  id: string
  label: ReactNode
  hint?: ReactNode
  disabled?: boolean
}

export interface AdminConfirmOptions {
  items: AdminConfirmOption[]
  selected: string[]
  onToggle: (id: string, checked: boolean) => void
  legend?: ReactNode
  ariaLabel?: string
}

export interface AdminConfirmDialogProps {
  open: boolean
  title: ReactNode
  eyebrow?: ReactNode
  description?: ReactNode
  tone?: AdminConfirmTone
  icon?: ReactNode
  options?: AdminConfirmOptions
  children?: ReactNode
  cancelLabel?: ReactNode
  confirmLabel?: ReactNode
  confirmVariant?: 'primary' | 'danger'
  confirmIcon?: ReactNode
  busy?: boolean
  autoFocusCancel?: boolean
  confirmOnEnter?: boolean
  closeOnBackdrop?: boolean
  onCancel: () => void
  onConfirm?: () => void
}

/** 图标色块的配色（danger / info / warn / plain 四档，与共享件 tone 同名）。 */
const TONE_CHIP: Record<AdminConfirmTone, string> = {
  danger: 'bg-destructive/10 text-destructive',
  info: 'bg-primary/10 text-primary',
  warn: 'bg-amber-500/10 text-amber-500',
  plain: 'bg-muted text-muted-foreground',
}

/** Enter 确认时，焦点落在这些控件上就不抢（与共享件 `INTERACTIVE_SELECTOR` 同款）。 */
const INTERACTIVE_SELECTOR =
  'input, textarea, select, button, a[href], [contenteditable="true"]'

export function AdminConfirmDialog({
  open,
  title,
  eyebrow,
  description,
  tone = 'danger',
  icon,
  options,
  children,
  cancelLabel,
  confirmLabel,
  confirmVariant = 'primary',
  confirmIcon,
  busy = false,
  autoFocusCancel = false,
  confirmOnEnter = false,
  closeOnBackdrop = true,
  onCancel,
  onConfirm,
}: AdminConfirmDialogProps) {
  const titleId = useId()
  // 提交中不响应 Esc / 遮罩关闭（与共享件的 `dismissible` 口径一致）。
  const dismissible = !busy
  const showActions = Boolean(cancelLabel || confirmLabel)

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (dismissible) onCancel()
        return
      }
      if (event.key !== 'Enter' || !confirmOnEnter || !onConfirm || busy) return
      const active = document.activeElement
      if (active instanceof HTMLElement && active.closest(INTERACTIVE_SELECTOR)) return
      event.preventDefault()
      onConfirm()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, dismissible, confirmOnEnter, busy, onCancel, onConfirm])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* 遮罩：点击关闭（提交中不关） */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm"
            onClick={closeOnBackdrop && dismissible ? onCancel : undefined}
          />

          {/* 面板 */}
          <div className="fixed inset-0 z-[121] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="bg-background border border-border p-8 max-w-md w-full shadow-2xl pointer-events-auto"
            >
              <div className="flex items-center gap-4 mb-6">
                {icon ? (
                  <div className={cn('w-12 h-12 flex items-center justify-center', TONE_CHIP[tone])}>
                    {icon}
                  </div>
                ) : null}
                <div className="min-w-0">
                  <h3
                    id={titleId}
                    className="font-serif text-xl font-light uppercase tracking-tight"
                  >
                    {title}
                  </h3>
                  {eyebrow ? (
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
                      {eyebrow}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className={cn(showActions && 'mb-6')}>
                {description ? (
                  <p className="text-sm text-foreground leading-relaxed">{description}</p>
                ) : null}

                {children ? (
                  <div className={cn(description ? 'mt-4' : undefined)}>{children}</div>
                ) : null}

                {options ? (
                  <div
                    role="group"
                    aria-label={options.ariaLabel}
                    className={cn(
                      'flex max-h-[46vh] flex-col gap-3 overflow-y-auto border border-border bg-muted/30 p-4',
                      description || children ? 'mt-4' : undefined
                    )}
                  >
                    {options.legend ? (
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        {options.legend}
                      </p>
                    ) : null}
                    {options.items.map((item) => (
                      <label
                        key={item.id}
                        className={cn(
                          'flex items-start gap-3',
                          item.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                          checked={options.selected.includes(item.id)}
                          disabled={item.disabled}
                          onChange={(event) => options.onToggle(item.id, event.target.checked)}
                        />
                        <span className="min-w-0">
                          <span className="block text-xs font-bold uppercase tracking-widest">
                            {item.label}
                          </span>
                          {item.hint ? (
                            <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">
                              {item.hint}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>

              {showActions ? (
                <div className="flex gap-3">
                  {cancelLabel ? (
                    <AdminButton
                      onClick={onCancel}
                      disabled={busy}
                      autoFocus={autoFocusCancel}
                      adminVariant="outline"
                      size="xl"
                      className="flex-1 px-6 py-3 text-xs font-bold uppercase tracking-widest"
                    >
                      {cancelLabel}
                    </AdminButton>
                  ) : null}
                  {confirmLabel ? (
                    <AdminButton
                      onClick={onConfirm}
                      disabled={busy}
                      adminVariant={confirmVariant === 'danger' ? 'destructive' : 'primary'}
                      size="xl"
                      className="flex-1 px-6 py-3 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                      {busy ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        confirmIcon
                      )}
                      <span>{confirmLabel}</span>
                    </AdminButton>
                  ) : null}
                </div>
              ) : null}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
