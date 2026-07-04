import type { CSSProperties, KeyboardEvent } from 'react'

interface SlotTextContentProps {
  content: string
  style?: CSSProperties
  onChange?: (content: string) => void
}

export function SlotTextContent({ content, style, onChange }: SlotTextContentProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key.toLowerCase() !== 'b' || (!event.ctrlKey && !event.metaKey)) return

    event.preventDefault()

    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      const range = selection.getRangeAt(0)
      const selectedText = selection.toString()
      range.deleteContents()
      range.insertNode(document.createTextNode(`**${selectedText}**`))
      selection.removeAllRanges()
      return
    }

    event.currentTarget.append(document.createTextNode('**bold**'))
  }

  return (
    <div
      className="h-full w-full cursor-text outline-none"
      style={{ ...style, whiteSpace: 'pre-wrap' }}
      contentEditable
      suppressContentEditableWarning
      onBlur={(event) => onChange?.(event.currentTarget.textContent ?? '')}
      onKeyDown={handleKeyDown}
    >
      {content}
    </div>
  )
}
