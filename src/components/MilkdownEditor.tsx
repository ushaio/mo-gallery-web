'use client'

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Crepe } from '@milkdown/crepe'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { useTheme } from '@/contexts/ThemeContext'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import '@milkdown/crepe/theme/frame-dark.css'
import './milkdown-editor.css'

interface MilkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  onPasteFiles?: (files: File[]) => void | Promise<void>
  className?: string
}

export interface MilkdownEditorHandle {
  getValue: () => string
  setValue: (markdown: string) => void
  insertValue: (markdown: string) => void
  insertMarkdown: (markdown: string) => void
  replaceText: (searchValue: string, nextValue: string) => boolean
}

interface CrepeEditorInnerProps {
  value: string
  placeholder?: string
  onChange: (value: string) => void
  onEditorReady?: (crepe: Crepe, root: HTMLElement) => void
}

const CrepeEditorInner: React.FC<CrepeEditorInnerProps> = ({
  value,
  placeholder,
  onChange,
  onEditorReady,
}) => {
  const latestValueRef = useRef(value)
  const initializedRef = useRef(false)
  const onChangeRef = useRef(onChange)
  const onEditorReadyRef = useRef(onEditorReady)
  const placeholderRef = useRef(placeholder)
  const [editorKey, setEditorKey] = useState(0)

  useEffect(() => {
    latestValueRef.current = value
  }, [value])

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onEditorReadyRef.current = onEditorReady
  }, [onEditorReady])

  useEffect(() => {
    placeholderRef.current = placeholder
  }, [placeholder])

  useEffect(() => {
    if (!initializedRef.current) return
    setEditorKey((prev) => prev + 1)
    initializedRef.current = false
  }, [value])

  useEditor(
    (root) => {
      const crepe = new Crepe({
        root,
        defaultValue: latestValueRef.current || '',
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
        featureConfigs: {
          [Crepe.Feature.BlockEdit]: {
            blockHandle: {
              getPlacement: () => 'left',
            },
          },
        },
      })

      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          latestValueRef.current = markdown
          if (initializedRef.current) {
            onChangeRef.current(markdown)
          }
        })
      })

      crepe.create().then(() => {
        initializedRef.current = true
        onEditorReadyRef.current?.(crepe, root)

        const nextPlaceholder = placeholderRef.current
        if (nextPlaceholder) {
          const proseMirror = root.querySelector('.ProseMirror')
          if (proseMirror instanceof HTMLElement) {
            proseMirror.setAttribute('data-placeholder', nextPlaceholder)
          }
        }
      })

      return crepe
    },
    [editorKey]
  )

  return <Milkdown key={editorKey} />
}

export const MilkdownEditor = forwardRef<MilkdownEditorHandle, MilkdownEditorProps>(
  ({ value, onChange, placeholder, onPasteFiles, className }, ref) => {
    const currentValueRef = useRef(value)
    const crepeInstanceRef = useRef<Crepe | null>(null)
    const editorRootRef = useRef<HTMLElement | null>(null)
    const onPasteFilesRef = useRef(onPasteFiles)

    useEffect(() => {
      currentValueRef.current = value
    }, [value])

    useEffect(() => {
      onPasteFilesRef.current = onPasteFiles
    }, [onPasteFiles])

    const syncValue = useCallback((nextValue: string) => {
      currentValueRef.current = nextValue
      onChange(nextValue)
    }, [onChange])

    const handleEditorReady = useCallback((crepe: Crepe, root: HTMLElement) => {
      crepeInstanceRef.current = crepe
      editorRootRef.current = root

      const proseMirror = root.querySelector('.ProseMirror')
      if (!(proseMirror instanceof HTMLElement)) return

      const handlePaste = (event: ClipboardEvent) => {
        const files = Array.from(event.clipboardData?.files || []).filter((file) => file.type.startsWith('image/'))
        if (files.length === 0) return

        event.preventDefault()
        event.stopPropagation()
        void onPasteFilesRef.current?.(files)
      }

      proseMirror.addEventListener('paste', handlePaste, true)
      ;(proseMirror as HTMLElement & { __storyPasteHandler?: (event: ClipboardEvent) => void }).__storyPasteHandler = handlePaste
    }, [])

    useEffect(() => {
      return () => {
        const root = editorRootRef.current
        const proseMirror = root?.querySelector('.ProseMirror')
        const handler = (proseMirror as (HTMLElement & { __storyPasteHandler?: (event: ClipboardEvent) => void }) | null)?.__storyPasteHandler

        if (proseMirror instanceof HTMLElement && handler) {
          proseMirror.removeEventListener('paste', handler, true)
          delete (proseMirror as HTMLElement & { __storyPasteHandler?: (event: ClipboardEvent) => void }).__storyPasteHandler
        }
      }
    }, [])

    const imperativeHandle = useMemo<MilkdownEditorHandle>(() => ({
      getValue: () => currentValueRef.current,
      setValue: (markdown: string) => {
        syncValue(markdown)
      },
      insertValue: (markdown: string) => {
        const baseValue = currentValueRef.current
        const separator = baseValue && !baseValue.endsWith('\n') ? '\n\n' : ''
        syncValue(`${baseValue}${separator}${markdown}`)
      },
      insertMarkdown: (markdown: string) => {
        const baseValue = currentValueRef.current
        const separator = baseValue && !baseValue.endsWith('\n') ? '\n\n' : ''
        syncValue(`${baseValue}${separator}${markdown}`)
      },
      replaceText: (searchValue: string, nextValue: string) => {
        if (!searchValue) return false
        const baseValue = currentValueRef.current
        const replacedValue = baseValue.replace(searchValue, nextValue)
        if (replacedValue === baseValue) return false
        syncValue(replacedValue)
        return true
      },
    }), [syncValue])

    useImperativeHandle(ref, () => imperativeHandle, [imperativeHandle])

    const { resolvedTheme } = useTheme()

    return (
      <div
        className={`milkdown-crepe-editor h-full ${resolvedTheme === 'dark' ? 'milkdown-dark' : 'milkdown-light'} ${className || ''}`}
        data-theme={resolvedTheme}
      >
        <MilkdownProvider>
          <CrepeEditorInner
            value={value}
            placeholder={placeholder}
            onChange={syncValue}
            onEditorReady={handleEditorReady}
          />
        </MilkdownProvider>
      </div>
    )
  }
)

MilkdownEditor.displayName = 'MilkdownEditor'

export default MilkdownEditor
