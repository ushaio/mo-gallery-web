import { useEffect, useMemo, useRef, useState } from 'react'
import { Image as ImageIcon, Layers, LockKeyhole, Type, UnlockKeyhole } from 'lucide-react'

import { zineEditorCopy } from '@/lib/zine/editor-copy'
import { getSlotPageSide } from '@/lib/zine/geometry'
import { getProjectSpreadSize } from '@/lib/zine/page-sizes'
import type { Slot } from '@/lib/zine/types'
import { usePreferences } from '@/store/preferences'
import { useZineStore } from '@/store/zine'

export function SlotLayers() {
  const language = usePreferences((state) => state.language)
  const copy = zineEditorCopy(language)
  const project = useZineStore((state) => state.project)
  const activeSpreadId = useZineStore((state) => state.activeSpreadId)
  const selectedSlotId = useZineStore((state) => state.selectedSlotId)
  const editingSlotId = useZineStore((state) => state.editingSlotId)
  const aiTaskId = useZineStore((state) => state.aiTaskId)
  const selectSlot = useZineStore((state) => state.selectSlot)
  const setSlotLocked = useZineStore((state) => state.setSlotLocked)
  const setSlotStackOrder = useZineStore((state) => state.setSlotStackOrder)
  const activeRowRef = useRef<HTMLLIElement | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [previewOrder, setPreviewOrder] = useState<Slot[] | null>(null)
  const spread = project?.spreads.find((item) => item.id === activeSpreadId)
  const slots = useMemo(() => [...(spread?.slots ?? [])].sort((left, right) => left.zIndex - right.zIndex).reverse(), [spread?.slots])
  const displaySlots = previewOrder ?? slots
  const dragEnabled = Boolean(project) && !aiTaskId && slots.length > 1

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeSpreadId, selectedSlotId])

  useEffect(() => {
    setDraggingId(null)
    setPreviewOrder(null)
  }, [activeSpreadId])

  if (!project || !spread) return null
  const { pageW } = getProjectSpreadSize(project)

  const resetDrag = () => {
    setDraggingId(null)
    setPreviewOrder(null)
  }

  const commitPreviewOrder = () => {
    if (draggingId && previewOrder) {
      // 预览数组是"上层在前"，提交时反转回 zIndex 升序（最后一项在最上层）。
      setSlotStackOrder(spread.id, [...previewOrder].reverse().map((slot) => slot.id))
    }
    resetDrag()
  }

  const handleDragEnter = (targetId: string) => {
    if (!draggingId || draggingId === targetId || !previewOrder) return
    const from = previewOrder.findIndex((slot) => slot.id === draggingId)
    const to = previewOrder.findIndex((slot) => slot.id === targetId)
    if (from < 0 || to < 0) return
    const next = [...previewOrder]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setPreviewOrder(next)
  }

  return (
    <div data-zine-editor-control className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-3 pb-2 pt-3 text-[10px] text-muted-foreground">
        <span title={dragEnabled ? copy.dragLayerHint : undefined}>{copy.topLayerFirst}</span>
        <span className="tabular-nums" aria-label={`${copy.layers}: ${slots.length}`}>{slots.length}</span>
      </div>
      {slots.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-3 text-center text-xs text-muted-foreground">
          <Layers size={20} strokeWidth={1.5} aria-hidden="true" />
          <p>{copy.emptyLayers}</p>
        </div>
      ) : (
        <ul
          aria-label={copy.layers}
          className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3"
          onDragOver={(event) => {
            if (draggingId) event.preventDefault()
          }}
          onDrop={commitPreviewOrder}
        >
          {displaySlots.map((slot) => {
            const selected = slot.id === selectedSlotId
            const locked = Boolean(slot.locked)
            const label = slot.kind === 'text'
              ? slot.content.replace(/\s+/g, ' ').trim() || copy.emptyText
              : project.assets.find((asset) => asset.id === slot.assetId)?.fileName || copy.emptyImage
            const pageLabel = getSlotPageSide(slot, pageW) === 'right' ? copy.rightPage : copy.leftPage
            const lockLabel = locked ? copy.unlock : copy.lock
            const rowDraggable = dragEnabled && !locked

            return (
              <li
                key={slot.id}
                ref={selected && !previewOrder ? activeRowRef : undefined}
                draggable={rowDraggable}
                onDragStart={(event) => {
                  if (!rowDraggable) return
                  setDraggingId(slot.id)
                  setPreviewOrder(displaySlots)
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', slot.id)
                }}
                onDragEnter={() => handleDragEnter(slot.id)}
                onDragEnd={resetDrag}
                onDrop={commitPreviewOrder}
                className={`group flex min-w-0 items-center rounded-md border transition ${selected ? 'border-primary/50 bg-accent' : 'border-transparent hover:bg-accent/60'} ${draggingId === slot.id ? 'opacity-50 ring-1 ring-primary' : ''} ${rowDraggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
              >
                <button
                  type="button"
                  draggable={false}
                  title={`${label} · ${pageLabel}${locked ? ` · ${copy.locked}` : ''}`}
                  aria-label={`${label} · ${pageLabel}${locked ? ` · ${copy.locked}` : ''}`}
                  aria-pressed={selected}
                  onClick={(event) => {
                    const editor = event.currentTarget.closest('[data-zine-editor]')
                    selectSlot(slot.id)
                    editor?.querySelector<HTMLElement>(`[data-zine-slot="${CSS.escape(slot.id)}"]`)?.focus({ preventScroll: true })
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {slot.kind === 'image' ? <ImageIcon size={14} className="shrink-0 text-muted-foreground" /> : <Type size={14} className="shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[11px] ${selected ? 'font-medium text-foreground' : 'text-foreground/85'}`}>{label}</span>
                    <span className="block text-[9px] text-muted-foreground">{pageLabel}</span>
                  </span>
                </button>
                <button
                  type="button"
                  draggable={false}
                  title={lockLabel}
                  aria-label={`${lockLabel}: ${label}`}
                  aria-pressed={locked}
                  disabled={Boolean(aiTaskId) || (slot.kind === 'image' && editingSlotId === slot.id)}
                  onClick={() => setSlotLocked(spread.id, slot.id, !locked)}
                  className={`mr-1 flex h-7 w-6 shrink-0 items-center justify-center rounded transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30 ${locked ? 'text-foreground' : 'text-muted-foreground/40 group-hover:text-muted-foreground focus-visible:text-foreground'}`}
                >
                  {locked ? <LockKeyhole size={12} /> : <UnlockKeyhole size={12} />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
