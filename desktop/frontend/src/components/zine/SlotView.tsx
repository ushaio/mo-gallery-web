import { renderSlot } from '@/lib/zine/slot-render'
import type { Slot, Spread, ZineAsset } from '@/lib/zine/types'
import { useZineStore } from '@/store/zine'

import { SlotImageContent } from './SlotImageContent'
import { SlotTextContent } from './SlotTextContent'

interface SlotViewProps {
  spread: Spread
  slot: Slot
  pageW: number
  assets: ZineAsset[]
  selected: boolean
  scale: number
  onSelect?: (slotId: string) => void
}

export function SlotView({ spread, slot, pageW, assets, selected, scale, onSelect }: SlotViewProps) {
  const updateSlot = useZineStore((state) => state.updateSlot)
  const rendered = renderSlot(slot, pageW, assets)
  const asset = slot.kind === 'image' ? assets.find((item) => item.id === slot.assetId) : undefined
  const slotStyle = {
    ...rendered.htmlStyle,
    left: `${rendered.htmlStyle.left}mm`,
    top: `${rendered.htmlStyle.top}mm`,
    width: `${rendered.htmlStyle.width}mm`,
    height: `${rendered.htmlStyle.height}mm`,
  }

  return (
    <button
      type="button"
      className="group block border border-dashed bg-white/70 text-left transition"
      style={{
        ...slotStyle,
        borderColor: selected ? 'var(--primary)' : 'rgba(113, 113, 122, 0.65)',
        boxShadow: selected ? `0 0 0 ${2 / scale}mm color-mix(in srgb, var(--primary) 30%, transparent)` : undefined,
        opacity: selected ? 0.82 : 1,
      }}
      onClick={(event) => {
        event.stopPropagation()
        onSelect?.(slot.id)
      }}
      onDragOver={
        slot.kind === 'image'
          ? (event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
            }
          : undefined
      }
      onDrop={
        slot.kind === 'image'
          ? (event) => {
              event.preventDefault()
              event.stopPropagation()
              const assetId = event.dataTransfer.getData('application/x-zine-asset-id')
              if (assetId) updateSlot(spread.id, slot.id, { assetId })
            }
          : undefined
      }
      aria-pressed={selected}
      aria-label={`Select ${slot.kind} slot`}
    >
      {slot.kind === 'image' && <SlotImageContent asset={asset} innerStyle={rendered.imageInner?.htmlStyle} />}
      {slot.kind === 'text' && rendered.text && <SlotTextContent content={rendered.text.content} style={rendered.text.htmlStyle} />}
    </button>
  )
}
