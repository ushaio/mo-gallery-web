import { useEffect, useRef } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'

interface SlotTextContentProps {
  content: string
  style?: CSSProperties
  placeholder?: string
  editing: boolean
  onChange?: (content: string) => void
  onEditEnd?: () => void
}

export function SlotTextContent({ content, style, placeholder, editing, onChange, onEditEnd }: SlotTextContentProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const cancelRef = useRef(false)

  // 进入编辑态时聚焦并把光标移到末尾
  useEffect(() => {
    if (!editing) return
    cancelRef.current = false
    const element = ref.current
    if (!element) return

    element.focus()
    const selection = window.getSelection()
    if (selection) {
      const range = document.createRange()
      range.selectNodeContents(element)
      range.collapse(false)
      selection.removeAllRanges()
      selection.addRange(range)
    }
  }, [editing])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      cancelRef.current = true
      event.currentTarget.textContent = content
      event.currentTarget.blur()
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      event.currentTarget.blur()
    }
  }

  return (
    <div
      ref={ref}
      // 非编辑态关闭指针事件，让单击选中/拖动作用于整个槽位；双击进入编辑
      className={`zine-text-slot h-full w-full outline-none ${editing ? 'cursor-text' : 'pointer-events-none'}`}
      style={{ ...style, minWidth: 0, whiteSpace: 'pre-wrap' }}
      contentEditable={editing ? 'plaintext-only' : false}
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onKeyDown={handleKeyDown}
      onBlur={(event) => {
        if (!cancelRef.current) onChange?.(event.currentTarget.innerText.replace(/\r/g, ''))
        onEditEnd?.()
      }}
    >
      {content}
    </div>
  )
}
