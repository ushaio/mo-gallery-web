'use client'

import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import './vditor-editor.css'

export interface VditorEditorProps {
  value?: string
  onChange?: (value: string) => void
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
      const initVditor = async () => {
        if (!editorRef.current) return

        const Vditor = (await import('vditor')).default

        if (vditorInstance.current) {
          vditorInstance.current.destroy()
        }

        vditorInstance.current = new Vditor(editorRef.current, {
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
          // 工具栏提示显示在下方，避免被上方容器遮挡
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
            setIsReady(true)
            if (disabled) {
              vditorInstance.current?.disabled()
            }
          },
          input: (val) => {
            onChange?.(val)
          },
          blur: (val) => {
            onChange?.(val)
          },
        })
      }

      initVditor()

      return () => {
        vditorInstance.current?.destroy()
        vditorInstance.current = null
      }
    }, [])

    // Handle theme changes
    useEffect(() => {
      if (isReady && vditorInstance.current) {
        vditorInstance.current.setTheme(
          resolvedTheme === 'dark' ? 'dark' : 'classic',
          resolvedTheme === 'dark' ? 'dark' : 'light',
          resolvedTheme === 'dark' ? 'native' : 'github'
        )
      }
    }, [resolvedTheme, isReady])

    // Handle disabled state changes
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
        <link
          rel="stylesheet"
          href="https://unpkg.com/vditor/dist/index.css"
        />
        <div ref={editorRef} />
      </div>
    )
  }
)

VditorEditor.displayName = 'VditorEditor'

export default VditorEditor
