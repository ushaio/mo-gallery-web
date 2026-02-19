'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import './vditor-editor.css'

export interface VditorViewerProps {
  content: string
  className?: string
}

export function VditorViewer({ content, className = '' }: VditorViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { resolvedTheme } = useTheme()
  const [html, setHtml] = useState('')

  useEffect(() => {
    const renderMarkdown = async () => {
      if (!content) {
        setHtml('')
        return
      }

      const Vditor = (await import('vditor')).default

      const rendered = await Vditor.md2html(content, {
        mode: 'light',
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
      })

      setHtml(rendered)
    }

    renderMarkdown()
  }, [content, resolvedTheme])

  // Apply code highlighting after HTML is rendered
  useEffect(() => {
    const highlightCode = async () => {
      if (!containerRef.current || !html) return

      const Vditor = (await import('vditor')).default
      Vditor.highlightRender(
        {
          enable: true,
          lineNumber: true,
          style: resolvedTheme === 'dark' ? 'native' : 'github',
        },
        containerRef.current
      )
    }

    highlightCode()
  }, [html, resolvedTheme])

  return (
    <>
      <link
        rel="stylesheet"
        href="https://unpkg.com/vditor/dist/index.css"
      />
      <div
        ref={containerRef}
        className={`vditor-reset ${resolvedTheme === 'dark' ? 'vditor-reset--dark' : ''} ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  )
}

export default VditorViewer
