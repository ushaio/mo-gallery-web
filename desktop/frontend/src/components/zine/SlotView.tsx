import { renderSlot } from '@/lib/zine/slot-render'
import type { Slot, Spread, ZineAsset } from '@/lib/zine/types'

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

export function SlotView({ slot, pageW, assets, selected, scale, onSelect }: SlotViewProps) {
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
      aria-pressed={selected}
      aria-label={`Select ${slot.kind} slot`}
    >
      {slot.kind === 'image' && <SlotImageContent asset={asset} innerStyle={rendered.imageInner?.htmlStyle} />}
      {slot.kind === 'text' && rendered.text && <SlotTextContent content={rendered.text.content} style={rendered.text.htmlStyle} />}
    </button>
  )
}
