'use client'

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react'
import { editorViewCtx, defaultValueCtx } from '@milkdown/core'
import { Crepe } from '@milkdown/crepe'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { getMarkdown, insert, replaceAll } from '@milkdown/utils'
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
  scaleLastImage: (mode: 'sm' | 'md' | 'lg') => boolean
}

interface CrepeEditorInnerProps {
  value: string
  placeholder?: string
  onChange: (value: string) => void
  onEditorReady?: (crepe: Crepe, root: HTMLElement) => void
}

const IMAGE_WIDTH_PRESETS: Record<'sm' | 'md' | 'lg', number> = {
  sm: 320,
  md: 480,
  lg: 720,
}

const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^\s)]+)(?:\s+=?(\d*)x)?\)/g

function buildMarkdownImage(alt: string, url: string, width?: number) {
  const escapedAlt = alt
    .replace(/\\/g, '\\\\')
    .replace(/\]/g, '\\]')

  if (width && Number.isFinite(width)) {
    return `![${escapedAlt}](${url} =${Math.max(160, Math.round(width))}x)`
  }

  return `![${escapedAlt}](${url})`
}

function replaceLastImageWidth(content: string, width: number) {
  const matches = Array.from(content.matchAll(MARKDOWN_IMAGE_PATTERN))
  const lastMatch = matches.at(-1)
  if (!lastMatch || lastMatch.index == null) return null

  const originalTag = lastMatch[0]
  const alt = lastMatch[1] ?? ''
  const url = lastMatch[2] ?? ''
  if (!url) return null

  const nextTag = buildMarkdownImage(alt, url, width)
  if (nextTag === originalTag) return null

  return `${content.slice(0, lastMatch.index)}${nextTag}${content.slice(lastMatch.index + originalTag.length)}`
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
    []
  )

  return <Milkdown />
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

    const focusEditor = useCallback(() => {
      try {
        const view = crepeInstanceRef.current?.editor.action((ctx) => ctx.get(editorViewCtx))
        view?.focus()
      } catch (error) {
        console.error('[MilkdownEditor] focus failed', error)
      }
    }, [])

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
      getValue: () => {
        const crepe = crepeInstanceRef.current
        if (crepe?.editor) {
          return crepe.editor.action(getMarkdown()) ?? currentValueRef.current
        }
        return currentValueRef.current
      },
      setValue: (markdown: string) => {
        const crepe = crepeInstanceRef.current
        if (crepe?.editor) {
          try {
            crepe.editor.action(replaceAll(markdown ?? ''))
          } catch (e) {
            console.warn('[MilkdownEditor] setValue failed:', e)
          }
        }
        syncValue(markdown ?? '')
      },
      insertValue: (markdown: string) => {
        const crepe = crepeInstanceRef.current
        const baseValue = currentValueRef.current
        const separator = baseValue && !baseValue.endsWith('\n') ? '\n\n' : ''
        const nextValue = `${baseValue}${separator}${markdown}`

        if (crepe?.editor) {
          try {
            crepe.editor.action(insert(markdown, false))
          } catch (e) {
            console.warn('[MilkdownEditor] insertValue failed:', e)
          }
        }
        
        currentValueRef.current = nextValue
        onChange(nextValue)
        focusEditor()
      },
      insertMarkdown: (markdown: string) => {
        const crepe = crepeInstanceRef.current
        const baseValue = currentValueRef.current
        const separator = baseValue && !baseValue.endsWith('\n') ? '\n\n' : ''
        const nextValue = `${baseValue}${separator}${markdown}`

        if (crepe?.editor) {
          try {
            crepe.editor.action(insert(markdown, false))
          } catch (e) {
            console.warn('[MilkdownEditor] insertMarkdown failed:', e)
          }
        }
        
        currentValueRef.current = nextValue
        onChange(nextValue)
        focusEditor()
      },
      replaceText: (searchValue: string, nextValue: string) => {
        if (!searchValue) return false
        const baseValue = currentValueRef.current
        const replacedValue = baseValue.replace(searchValue, nextValue)
        if (replacedValue === baseValue) return false

        const crepe = crepeInstanceRef.current
        if (crepe?.editor) {
          try {
            crepe.editor.action(replaceAll(replacedValue))
          } catch (e) {
            console.warn('[MilkdownEditor] replaceText failed:', e)
          }
        }
        
        currentValueRef.current = replacedValue
        onChange(replacedValue)
        focusEditor()

        return true
      },
      scaleLastImage: (mode: 'sm' | 'md' | 'lg') => {
        const width = IMAGE_WIDTH_PRESETS[mode]
        const nextValue = replaceLastImageWidth(currentValueRef.current, width)
        if (!nextValue) return false

        const crepe = crepeInstanceRef.current
        if (crepe?.editor) {
          try {
            crepe.editor.action(replaceAll(nextValue))
          } catch (e) {
            console.warn('[MilkdownEditor] scaleLastImage failed:', e)
          }
        }
        
        currentValueRef.current = nextValue
        onChange(nextValue)
        focusEditor()
        return true
      },
    }), [focusEditor, onChange, syncValue])

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

