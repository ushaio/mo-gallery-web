'use client'

import { useEffect, useRef, useState } from 'react'
import { init, type WalineInstance, type WalineInitOptions } from '@waline/client'
import '@waline/client/waline.css'
import './waline-custom.css'
import { useLanguage } from '@/contexts/LanguageContext'

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
  const { t } = useLanguage()
  const containerRef = useRef<HTMLDivElement>(null)
  const walineInstanceRef = useRef<WalineInstance | null>(null)
  const [isDark, setIsDark] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

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
    if (!containerRef.current || !serverURL || unavailable) return

    let cancelled = false
    const controller = new AbortController()

    // Waline 内部的请求失败会以未处理的 Promise 拒绝抛出，
    // 这里先探测服务可达性，不可达时直接降级，不再初始化。
    fetch(`${serverURL.replace(/\/+$/, '')}/api/comment?path=${encodeURIComponent(path)}&pageSize=1`, {
      signal: controller.signal,
    })
      .then(() => {
        if (cancelled || !containerRef.current) return

        const options: WalineInitOptions = {
          el: containerRef.current,
          serverURL,
          path,
          lang,
          dark: dark || (isDark ? 'html.dark' : ''),
          locale,
          comment: true,
          pageview: true,
          wordLimit: 0,
          requiredMeta: [],
        }

        walineInstanceRef.current = init(options)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.error('Waline service unreachable:', err)
        setUnavailable(true)
      })

    return () => {
      cancelled = true
      controller.abort()
      walineInstanceRef.current?.destroy()
      walineInstanceRef.current = null
    }
  }, [serverURL, path, lang, dark, isDark, locale, unavailable])

  if (unavailable) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">
        {t('gallery.comment_waline_unavailable')}
      </p>
    )
  }

  return <div ref={containerRef} className="waline-container" />
}
