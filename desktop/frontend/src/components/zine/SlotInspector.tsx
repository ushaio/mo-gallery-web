import { useRef, useState } from 'react'
import {
  AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignHorizontalJustifyStart,
  AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart,
  ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, Copy, Image as ImageIcon,
  LockKeyhole, MousePointer2, RotateCcw, Type, UnlockKeyhole,
} from 'lucide-react'

import { zineEditorCopy } from '@/lib/zine/editor-copy'
import { geometryEqual, getSlotPageSide, toSlotGeometry } from '@/lib/zine/geometry'
import { normalizeGestureGeometry } from '@/lib/zine/gesture-session'
import { getProjectSpreadSize } from '@/lib/zine/page-sizes'
import { preserveImageTransformOnFrameResize } from '@/lib/zine/slot-render'
import { usePreferences } from '@/store/preferences'
import { useZineStore } from '@/store/zine'

import type { LucideIcon } from 'lucide-react'
import type { SlotGeometry } from '@/lib/zine/geometry'

interface GeometryFieldProps {
  label: string
  shortLabel: string
  value: number
  unit: string
  min?: number
  step?: number
  disabled: boolean
  invalidLabel: string
  onCommit: (value: number) => void
}

function formatGeometryValue(value: number) {
  return String(Number(value.toFixed(3)))
}

function GeometryField({ label, shortLabel, value, unit, min, step = 0.1, disabled, invalidLabel, onCommit }: GeometryFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  const skipBlurRef = useRef(false)

  return (
    <div className="min-w-0">
      <label
        className={`flex h-8 min-w-0 items-center gap-1.5 rounded-md border bg-background px-2 focus-within:ring-1 focus-within:ring-ring ${disabled ? 'opacity-45' : ''}`}
        style={{ borderColor: invalid ? 'var(--destructive)' : 'var(--border)' }}
        title={invalid ? invalidLabel : `${label} (${unit})`}
      >
        <span className="shrink-0 text-[10px] text-muted-foreground">{shortLabel}</span>
        <input
          type="number"
          inputMode="decimal"
          aria-label={`${label} (${unit})`}
          aria-invalid={invalid || undefined}
          value={draft ?? formatGeometryValue(value)}
          disabled={disabled}
          min={min}
          step={step}
          className="w-full min-w-0 bg-transparent text-right text-xs tabular-nums outline-none disabled:cursor-not-allowed"
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            setDraft(event.currentTarget.value)
            setInvalid(false)
          }}
          onBlur={() => {
            if (skipBlurRef.current) {
              skipBlurRef.current = false
              return
            }
            if (draft === null) return
            const nextValue = Number(draft)
            if (!draft.trim() || !Number.isFinite(nextValue * 1000) || (min !== undefined && nextValue < min)) {
              setInvalid(true)
              return
            }
            if (!disabled && nextValue !== value) onCommit(nextValue)
            setDraft(null)
            setInvalid(false)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              skipBlurRef.current = true
              setDraft(null)
              setInvalid(false)
              event.currentTarget.blur()
            }
          }}
        />
        <span className="shrink-0 text-[9px] text-muted-foreground">{unit}</span>
      </label>
      {invalid && <p role="status" className="mt-1 text-[10px] text-destructive">{invalidLabel}</p>}
    </div>
  )
}

function InspectorAction({ label, icon: Icon, disabled, onClick }: { label: string; icon: LucideIcon; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 items-center justify-center rounded-md border border-border bg-background transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-35"
    >
      <Icon size={15} aria-hidden="true" />
    </button>
  )
}

type PageAlignment = 'left' | 'horizontal-center' | 'right' | 'top' | 'vertical-center' | 'bottom'

export function SlotInspector() {
  const language = usePreferences((state) => state.language)
  const copy = zineEditorCopy(language)
  const project = useZineStore((state) => state.project)
  const activeSpreadId = useZineStore((state) => state.activeSpreadId)
  const selectedSlotId = useZineStore((state) => state.selectedSlotId)
  const editingSlotId = useZineStore((state) => state.editingSlotId)
  const aiTaskId = useZineStore((state) => state.aiTaskId)
  const duplicateSlot = useZineStore((state) => state.duplicateSlot)
  const reorderSlot = useZineStore((state) => state.reorderSlot)
  const setSlotLocked = useZineStore((state) => state.setSlotLocked)
  const spread = project?.spreads.find((item) => item.id === activeSpreadId)
  const slot = spread?.slots.find((item) => item.id === selectedSlotId)

  if (!project || !spread || !slot) {
    return (
      <div data-zine-editor-control className="flex h-full flex-col items-center justify-center gap-2 p-5 text-center text-xs text-muted-foreground">
        <MousePointer2 size={20} strokeWidth={1.5} aria-hidden="true" />
        <p>{copy.selectElement}</p>
      </div>
    )
  }

  const { pageW, pageH } = getProjectSpreadSize(project)
  const pageSide = getSlotPageSide(slot, pageW)
  const pageLabel = pageSide === 'right' ? copy.rightPage : copy.leftPage
  const pageOriginX = pageSide === 'right' ? pageW : 0
  const cropping = slot.kind === 'image' && editingSlotId === slot.id
  const locked = Boolean(slot.locked)
  const controlsDisabled = Boolean(aiTaskId) || cropping
  const geometryDisabled = controlsDisabled || locked
  const orderedSlots = [...spread.slots].sort((left, right) => left.zIndex - right.zIndex)
  const stackIndex = orderedSlots.findIndex((item) => item.id === slot.id)
  const atFront = stackIndex === orderedSlots.length - 1
  const atBack = stackIndex === 0

  function commitGeometry(patch: Partial<SlotGeometry>) {
    const state = useZineStore.getState()
    const currentProject = state.project
    const currentSlot = currentProject?.spreads.find((item) => item.id === spread?.id)?.slots.find((item) => item.id === slot?.id)
    if (!currentProject || !spread || !currentSlot || currentSlot.locked || state.aiTaskId) return
    if (currentSlot.kind === 'image' && state.editingSlotId === currentSlot.id) return

    const initial = toSlotGeometry(currentSlot)
    const geometry = normalizeGestureGeometry({ ...initial, ...patch })
    if (!Object.values(geometry).every(Number.isFinite) || geometryEqual(initial, geometry)) return
    const { pageW: currentPageW } = getProjectSpreadSize(currentProject)
    const page = getSlotPageSide({ ...currentSlot, ...geometry }, currentPageW)
    const asset = currentSlot.kind === 'image' && currentSlot.imageFrameBinding === false
      ? currentProject.assets.find((item) => item.id === currentSlot.assetId)
      : undefined
    const imageTransform = asset && currentSlot.kind === 'image' && (geometry.w !== initial.w || geometry.h !== initial.h)
      ? preserveImageTransformOnFrameResize(initial, geometry, asset.width, asset.height, currentSlot.imageTransform)
      : undefined
    state.updateSlot(spread.id, currentSlot.id, { ...geometry, page, ...(imageTransform ? { imageTransform } : {}) })
  }

  function alignToPage(alignment: PageAlignment) {
    if (!slot) return
    // CSS rotates around the frame center; align its visible bounding edges.
    const angle = slot.rotation * Math.PI / 180
    const boundsW = Math.abs(slot.w * Math.cos(angle)) + Math.abs(slot.h * Math.sin(angle))
    const boundsH = Math.abs(slot.w * Math.sin(angle)) + Math.abs(slot.h * Math.cos(angle))
    switch (alignment) {
      case 'left': commitGeometry({ x: pageOriginX + (boundsW - slot.w) / 2 }); break
      case 'horizontal-center': commitGeometry({ x: pageOriginX + (pageW - slot.w) / 2 }); break
      case 'right': commitGeometry({ x: pageOriginX + pageW - (slot.w + boundsW) / 2 }); break
      case 'top': commitGeometry({ y: (boundsH - slot.h) / 2 }); break
      case 'vertical-center': commitGeometry({ y: (pageH - slot.h) / 2 }); break
      case 'bottom': commitGeometry({ y: pageH - (slot.h + boundsH) / 2 }); break
    }
  }

  const alignmentActions: Array<{ value: PageAlignment; label: string; icon: LucideIcon }> = [
    { value: 'left', label: copy.alignLeft, icon: AlignHorizontalJustifyStart },
    { value: 'horizontal-center', label: copy.alignHorizontalCenter, icon: AlignHorizontalJustifyCenter },
    { value: 'right', label: copy.alignRight, icon: AlignHorizontalJustifyEnd },
    { value: 'top', label: copy.alignTop, icon: AlignVerticalJustifyStart },
    { value: 'vertical-center', label: copy.alignVerticalCenter, icon: AlignVerticalJustifyCenter },
    { value: 'bottom', label: copy.alignBottom, icon: AlignVerticalJustifyEnd },
  ]

  return (
    <div data-zine-editor-control className="custom-scrollbar h-full min-h-0 space-y-4 overflow-y-auto p-3 text-foreground" onClick={(event) => event.stopPropagation()}>
      <div>
        <div className="flex items-center gap-2">
          {slot.kind === 'image' ? <ImageIcon size={14} /> : <Type size={14} />}
          <span className="flex-1 text-xs font-medium">{slot.kind === 'image' ? copy.image : copy.text}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{pageLabel}</span>
          <button
            type="button"
            title={locked ? copy.unlock : copy.lock}
            aria-label={locked ? copy.unlock : copy.lock}
            aria-pressed={locked}
            disabled={controlsDisabled}
            onClick={() => setSlotLocked(spread.id, slot.id, !locked)}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35 ${locked ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
          >
            {locked ? <LockKeyhole size={14} /> : <UnlockKeyhole size={14} />}
          </button>
        </div>
        {(locked || cropping) && <p className="mt-2 text-[10px] text-muted-foreground">{locked ? copy.unlockHint : copy.finishCropFirst}</p>}
      </div>

      <section className="space-y-2" aria-label={copy.positionAndSize}>
        <h3 className="text-[11px] font-medium text-muted-foreground">{copy.positionAndSize} · {pageLabel}</h3>
        <div className="grid grid-cols-2 gap-2">
          {([
            { key: 'x', shortLabel: 'X', label: copy.x, value: slot.x - pageOriginX },
            { key: 'y', shortLabel: 'Y', label: copy.y, value: slot.y },
            { key: 'w', shortLabel: 'W', label: copy.width, value: slot.w, min: 5 },
            { key: 'h', shortLabel: 'H', label: copy.height, value: slot.h, min: 5 },
          ] as const).map((field) => (
            <GeometryField
              key={`${slot.id}:${field.key}:${field.value}:${geometryDisabled}`}
              label={field.label}
              shortLabel={field.shortLabel}
              value={field.value}
              unit="mm"
              min={'min' in field ? field.min : undefined}
              disabled={geometryDisabled}
              invalidLabel={'min' in field ? copy.minimumSize : copy.invalidNumber}
              onCommit={(value) => commitGeometry({ [field.key]: field.key === 'x' ? value + pageOriginX : value })}
            />
          ))}
          <GeometryField
            key={`${slot.id}:rotation:${slot.rotation}:${geometryDisabled}`}
            label={copy.rotation}
            shortLabel="R"
            value={slot.rotation}
            unit="°"
            step={1}
            disabled={geometryDisabled}
            invalidLabel={copy.invalidNumber}
            onCommit={(rotation) => commitGeometry({ rotation })}
          />
          <button
            type="button"
            title={copy.resetRotation}
            aria-label={copy.resetRotation}
            disabled={geometryDisabled || slot.rotation === 0}
            onClick={() => commitGeometry({ rotation: 0 })}
            className="flex h-8 items-center justify-center gap-1.5 rounded-md text-[11px] text-muted-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35"
          >
            <RotateCcw size={13} /> 0°
          </button>
        </div>
      </section>

      <section className="space-y-2" aria-label={`${copy.alignPage} · ${pageLabel}`}>
        <h3 className="text-[11px] font-medium text-muted-foreground">{copy.alignPage} · {pageLabel}</h3>
        <div className="grid grid-cols-3 gap-1.5">
          {alignmentActions.map((action) => (
            <InspectorAction key={action.value} label={action.label} icon={action.icon} disabled={geometryDisabled} onClick={() => alignToPage(action.value)} />
          ))}
        </div>
      </section>

      <section className="space-y-2" aria-label={copy.stack}>
        <h3 className="text-[11px] font-medium text-muted-foreground">{copy.stack}</h3>
        <div className="grid grid-cols-4 gap-1.5">
          <InspectorAction label={copy.bringToFront} icon={ArrowUpToLine} disabled={geometryDisabled || atFront} onClick={() => reorderSlot(spread.id, slot.id, 'front')} />
          <InspectorAction label={copy.bringForward} icon={ArrowUp} disabled={geometryDisabled || atFront} onClick={() => reorderSlot(spread.id, slot.id, 'forward')} />
          <InspectorAction label={copy.sendBackward} icon={ArrowDown} disabled={geometryDisabled || atBack} onClick={() => reorderSlot(spread.id, slot.id, 'backward')} />
          <InspectorAction label={copy.sendToBack} icon={ArrowDownToLine} disabled={geometryDisabled || atBack} onClick={() => reorderSlot(spread.id, slot.id, 'back')} />
        </div>
      </section>

      <button
        type="button"
        title={copy.duplicate}
        disabled={controlsDisabled}
        onClick={() => duplicateSlot(spread.id, slot.id)}
        className="flex h-8 w-full items-center justify-center gap-2 rounded-md border border-border text-xs transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35"
      >
        <Copy size={13} />
        {copy.duplicate}
      </button>
    </div>
  )
}
