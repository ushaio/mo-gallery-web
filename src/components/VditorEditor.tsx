'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import './vditor-editor.css'

export interface VditorEditorProps {
  value?: string
  onChange?: (value: string) => void
  onPasteFiles?: (files: File[]) => void | Promise<void>
  placeholder?: string
  height?: number | string
  minHeight?: number
  mode?: 'ir' | 'sv' | 'wysiwyg'
  toolbar?: string[]
  className?: string
  disabled?: boolean
}

export interface VditorEditorHandle {
  getValue: () => string
  setValue: (value: string) => void
  insertValue: (value: string) => void
  focus: () => void
  blur: () => void
  getHTML: () => string
  disabled: () => void
  enable: () => void
}

const defaultToolbar = [
  'headings',
  'bold',
  'italic',
  'strike',
  '|',
  'line',
  'quote',
  'list',
  'ordered-list',
  'check',
  '|',
  'code',
  'inline-code',
  'link',
  'table',
  '|',
  'upload',
  '|',
  'undo',
  'redo',
  '|',
  'fullscreen',
  'preview',
  'outline',
]

export const VditorEditor = forwardRef<VditorEditorHandle, VditorEditorProps>(
  (
    {
      value = '',
      onChange,
      onPasteFiles,
      placeholder = '',
      height = 400,
      minHeight = 200,
      mode = 'ir',
      toolbar = defaultToolbar,
      className = '',
      disabled = false,
    },
    ref
  ) => {
    const editorRef = useRef<HTMLDivElement>(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vditorInstance = useRef<any>(null)
    const { resolvedTheme } = useTheme()
    const [isReady, setIsReady] = useState(false)
    const initialValueRef = useRef(value)
    const onPasteFilesRef = useRef(onPasteFiles)

    useEffect(() => {
      onPasteFilesRef.current = onPasteFiles
    }, [onPasteFiles])

    useImperativeHandle(ref, () => ({
      getValue: () => vditorInstance.current?.getValue() || '',
      setValue: (val: string) => vditorInstance.current?.setValue(val),
      insertValue: (val: string) => vditorInstance.current?.insertValue(val),
      focus: () => vditorInstance.current?.focus(),
      blur: () => vditorInstance.current?.blur(),
      getHTML: () => vditorInstance.current?.getHTML() || '',
      disabled: () => vditorInstance.current?.disabled(),
      enable: () => vditorInstance.current?.enable(),
    }))

    useEffect(() => {
      const container = editorRef.current
      let isDestroyed = false

      const initVditor = async () => {
        if (!container) return

        const Vditor = (await import('vditor')).default

        if (vditorInstance.current) {
          vditorInstance.current.destroy()
          vditorInstance.current = null
        }

        if (isDestroyed || !editorRef.current?.isConnected) return

        const instance = new Vditor(container, {
          value: initialValueRef.current,
          placeholder,
          height,
          minHeight,
          mode,
          theme: resolvedTheme === 'dark' ? 'dark' : 'classic',
          icon: 'ant',
          toolbar: toolbar as never,
          toolbarConfig: {
            pin: true,
          },
          upload: {
            accept: 'image/*',
            multiple: true,
            handler: async (files: File[]) => {
              if (files.length === 0) return null
              await onPasteFilesRef.current?.(files)
              return null
            },
          },
          hint: {
            delay: 200,
          },
          cache: {
            enable: false,
          },
          preview: {
            hljs: {
              enable: true,
              lineNumber: true,
              style: resolvedTheme === 'dark' ? 'native' : 'github',
            },
            markdown: {
              autoSpace: true,
              gfmAutoLink: true,
              toc: true,
            },
          },
          counter: {
            enable: true,
            type: 'text',
          },
          after: () => {
            if (isDestroyed || !editorRef.current?.isConnected || vditorInstance.current !== instance) {
              instance.destroy()
              return
            }

            setIsReady(true)
            if (disabled) {
              instance.disabled()
            }
          },
          input: (val) => {
            onChange?.(val)
          },
          blur: (val) => {
            onChange?.(val)
          },
        })

        if (isDestroyed || !editorRef.current?.isConnected) {
          instance.destroy()
          return
        }

        vditorInstance.current = instance
      }

      void initVditor()

      return () => {
        isDestroyed = true
        setIsReady(false)
        if (vditorInstance.current) {
          vditorInstance.current.destroy()
          vditorInstance.current = null
        }
      }
    }, [])

    useEffect(() => {
      if (isReady && vditorInstance.current) {
        vditorInstance.current.setTheme(
          resolvedTheme === 'dark' ? 'dark' : 'classic',
          resolvedTheme === 'dark' ? 'dark' : 'light',
          resolvedTheme === 'dark' ? 'native' : 'github'
        )
      }
    }, [resolvedTheme, isReady])

    useEffect(() => {
      if (isReady && vditorInstance.current) {
        if (disabled) {
          vditorInstance.current.disabled()
        } else {
          vditorInstance.current.enable()
        }
      }
    }, [disabled, isReady])

    return (
      <div className={`vditor-wrapper ${className}`}>
        <link rel="stylesheet" href="https://unpkg.com/vditor/dist/index.css" />
        <div ref={editorRef} />
      </div>
    )
  }
)

VditorEditor.displayName = 'VditorEditor'

export default VditorEditor
