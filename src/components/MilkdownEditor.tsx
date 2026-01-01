'use client'

import React, { useRef, useLayoutEffect, forwardRef, useImperativeHandle, useEffect } from 'react'
import { Crepe } from '@milkdown/crepe'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import './milkdown-editor.css'

interface MilkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export interface MilkdownEditorHandle {
  getValue: () => string
  insertMarkdown: (markdown: string) => void
}

// Inner editor component that uses the useEditor hook
const CrepeEditorInner: React.FC<{
  defaultValue: string
  onChange: (value: string) => void
  placeholder?: string
  onEditorReady?: (crepe: Crepe) => void
}> = ({ defaultValue, onChange, placeholder, onEditorReady }) => {
  const crepeRef = useRef<Crepe | null>(null)
  const isInitializedRef = useRef(false)

  const { get } = useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: defaultValue || '',
      // Enable all features including BlockEdit for drag handle
      features: {
        [Crepe.Feature.BlockEdit]: true,
        [Crepe.Feature.Toolbar]: true,
        [Crepe.Feature.LinkTooltip]: true,
        [Crepe.Feature.ImageBlock]: true,
        [Crepe.Feature.ListItem]: true,
        [Crepe.Feature.Table]: true,
        [Crepe.Feature.CodeMirror]: true,
        [Crepe.Feature.Cursor]: true,
        [Crepe.Feature.Placeholder]: false,
      },
    })

    // Listen for content changes
    crepe.on((listener) => {
      listener.markdownUpdated((ctx, markdown) => {
        if (isInitializedRef.current) {
          onChange(markdown)
        }
      })
    })

    crepeRef.current = crepe

    // Notify parent when editor is ready
    crepe.create().then(() => {
      isInitializedRef.current = true
      if (onEditorReady) {
        onEditorReady(crepe)
      }
    })

    return crepe
  }, [])

  return <Milkdown />
}

export const MilkdownEditor = forwardRef<MilkdownEditorHandle, MilkdownEditorProps>(
  ({ value, onChange, placeholder }, ref) => {
    const currentValueRef = useRef(value)
    const crepeInstanceRef = useRef<Crepe | null>(null)

    // Update current value ref when value changes externally
    useEffect(() => {
      currentValueRef.current = value
    }, [value])

    // Handle editor ready
    const handleEditorReady = (crepe: Crepe) => {
      crepeInstanceRef.current = crepe
    }

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      getValue: () => currentValueRef.current,
      insertMarkdown: (markdown: string) => {
        const newContent = currentValueRef.current + markdown
        currentValueRef.current = newContent
        onChange(newContent)
      },
    }))

    return (
      <div className="milkdown-crepe-editor h-full">
        <MilkdownProvider>
          <CrepeEditorInner
            defaultValue={value}
            onChange={(markdown) => {
              currentValueRef.current = markdown
              onChange(markdown)
            }}
            placeholder={placeholder}
            onEditorReady={handleEditorReady}
          />
        </MilkdownProvider>
      </div>
    )
  }
)

MilkdownEditor.displayName = 'MilkdownEditor'

export default MilkdownEditor