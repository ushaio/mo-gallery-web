'use client'

import { useEffect, useRef, useState } from 'react'
import { init, type WalineInstance, type WalineInitOptions } from '@waline/client'
import '@waline/client/waline.css'
import './waline-custom.css'

export interface WalineCommentsProps {
  serverURL?: string
  path: string
  lang?: string
  dark?: string
  locale?: Record<string, string>
}

export function WalineComments({
  serverURL,
  path,
  lang = 'zh-CN',
  dark,
  locale,
}: WalineCommentsProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const walineInstanceRef = useRef<WalineInstance | null>(null)
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains('dark'))
    }
    checkTheme()
    const observer = new MutationObserver(checkTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!containerRef.current || !serverURL) return

    const options: WalineInitOptions = {
      el: containerRef.current,
      serverURL,
      path,
      lang,
      dark: isDark ? 'html.dark' : '',
      locale,
      comment: true,
      pageview: true,
      wordLimit: 0,
      requiredMeta: [],
    }

    walineInstanceRef.current = init(options)

    return () => {
      walineInstanceRef.current?.destroy()
    }
  }, [serverURL, path, lang, isDark, locale])

  return <div ref={containerRef} className="waline-container" />
}
