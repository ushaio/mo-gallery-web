import type { CSSProperties } from 'react'

interface SlotTextContentProps {
  content: string
  style?: CSSProperties
}

export function SlotTextContent({ content, style }: SlotTextContentProps) {
  return (
    <div className="h-full w-full" style={{ ...style, whiteSpace: 'pre-wrap' }}>
      {content}
    </div>
  )
}
