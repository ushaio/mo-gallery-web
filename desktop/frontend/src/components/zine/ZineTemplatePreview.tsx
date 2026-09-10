import { useId } from 'react'
import type { Slot, TextSlot } from '@/lib/zine/types'

const POINTS_TO_MM = 25.4 / 72

interface ZineTemplatePreviewProps {
  slots: Slot[]
  pageW: number
  pageH: number
  className?: string
}

function textPosition(slot: TextSlot, contentHeight: number) {
  const x = slot.align === 'center' ? slot.x + slot.w / 2 : slot.align === 'right' ? slot.x + slot.w : slot.x
  const remainingHeight = Math.max(0, slot.h - contentHeight)
  const top = slot.y + (slot.verticalAlign === 'center' ? remainingHeight / 2 : slot.verticalAlign === 'bottom' ? remainingHeight : 0)
  return { x, top }
}

function PreviewText({ slot }: { slot: TextSlot }) {
  const fontSize = slot.fontSize * POINTS_TO_MM
  const lineHeight = fontSize * slot.lineHeight

  if (!slot.content.trim()) {
    const lineCount = Math.min(4, Math.max(1, Math.floor(slot.h / lineHeight)))
    const { top } = textPosition(slot, lineCount * lineHeight)
    return (
      <g fill={slot.color} opacity={0.25}>
        {Array.from({ length: lineCount }, (_, index) => {
          const width = slot.w * (index === lineCount - 1 ? 0.55 : 0.9)
          const x = slot.align === 'center' ? slot.x + (slot.w - width) / 2 : slot.align === 'right' ? slot.x + slot.w - width : slot.x
          return <rect key={index} x={x} y={top + index * lineHeight + fontSize * 0.45} width={width} height={fontSize * 0.22} />
        })}
      </g>
    )
  }

  // Built-in copy contains deliberate line breaks, shared with the editable slots.
  const lines = slot.content.replace(/\r\n?/g, '\n').split('\n')
  const { x, top } = textPosition(slot, lines.length * lineHeight)
  const baseline = top + (lineHeight - fontSize) / 2 + fontSize * 0.82

  return (
    <text
      fill={slot.color}
      fontFamily={slot.fontFamily || 'serif'}
      fontSize={fontSize}
      textAnchor={slot.align === 'center' ? 'middle' : slot.align === 'right' ? 'end' : 'start'}
      xmlSpace="preserve"
    >
      {lines.map((line, index) => <tspan key={index} x={x} y={baseline + index * lineHeight}>{line}</tspan>)}
    </text>
  )
}

/** Uses the same millimetre geometry and point-sized type as the editable spread. */
export function ZineTemplatePreview({ slots, pageW, pageH, className }: ZineTemplatePreviewProps) {
  const previewId = useId().replace(/:/g, '')
  const spreadW = pageW * 2

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${spreadW} ${pageH}`}
      width={spreadW}
      height={pageH}
      className={className}
      style={{ display: 'block', width: '100%', height: 'auto' }}
      aria-hidden="true"
      focusable="false"
    >
      <rect width={spreadW} height={pageH} fill="#ffffff" />
      {[...slots].sort((a, b) => a.zIndex - b.zIndex).map((slot, index) => {
        const clipId = `${previewId}-clip-${slot.id}`
        const fillId = `${previewId}-fill-${slot.id}`
        const centerX = slot.x + slot.w / 2
        const centerY = slot.y + slot.h / 2
        const iconSize = Math.min(slot.w, slot.h) * 0.15

        return (
          <g key={slot.id} transform={`rotate(${slot.rotation} ${centerX} ${centerY})`}>
            <defs>
              <clipPath id={clipId}>
                <rect x={slot.x} y={slot.y} width={slot.w} height={slot.h} />
              </clipPath>
              {slot.kind === 'image' && (
                <linearGradient id={fillId} x1="0" y1="0" x2={index % 2 === 0 ? '1' : '0.35'} y2="1">
                  <stop offset="0%" stopColor="#eeede8" />
                  <stop offset="100%" stopColor={index % 3 === 0 ? '#cbd0ca' : '#d7d5ce'} />
                </linearGradient>
              )}
            </defs>
            <g clipPath={`url(#${clipId})`}>
              {slot.kind === 'image' ? (
                <>
                  <rect x={slot.x} y={slot.y} width={slot.w} height={slot.h} fill={`url(#${fillId})`} stroke="#c7c8c1" strokeWidth={0.3} />
                  <g transform={`translate(${centerX - iconSize / 2} ${centerY - iconSize / 2})`} fill="none" stroke="#7c827a" strokeWidth={iconSize * 0.045} opacity={0.4}>
                    <rect width={iconSize} height={iconSize} rx={iconSize * 0.08} />
                    <circle cx={iconSize * 0.69} cy={iconSize * 0.3} r={iconSize * 0.09} />
                    <path d={`M 0 ${iconSize * 0.8} L ${iconSize * 0.35} ${iconSize * 0.43} L ${iconSize * 0.6} ${iconSize * 0.7} L ${iconSize * 0.78} ${iconSize * 0.54} L ${iconSize} ${iconSize * 0.76}`} />
                  </g>
                </>
              ) : <PreviewText slot={slot} />}
            </g>
          </g>
        )
      })}
      <line x1={pageW} y1={0} x2={pageW} y2={pageH} stroke="#d8d6d0" strokeWidth={0.3} opacity={0.7} />
    </svg>
  )
}
