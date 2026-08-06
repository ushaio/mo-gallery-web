'use client'

import { useEffect } from 'react'
import { WindowFullscreen, WindowUnfullscreen } from '../../../../wailsjs/runtime/runtime'

/**
 * 沉浸模式 hook（叙事/博客共用）：
 * 进入时调用原生全屏并隐藏 body 滚动，Esc 退出。
 */
export function useImmersiveMode(isImmersiveMode: boolean, onExit: () => void) {
  useEffect(() => {
    if (!isImmersiveMode) return

    const previousBodyOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'
    // 沉浸全屏时隐藏一体化窗口标题栏（DesktopWindowFrame 渲染，
    // 见 index.css 中 body.mo-immersive .desktop-title-bar 规则）
    document.body.classList.add('mo-immersive')
    WindowFullscreen()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      event.preventDefault()
      onExit()
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.classList.remove('mo-immersive')
      document.body.style.overflow = previousBodyOverflow
      WindowUnfullscreen()
    }
  }, [isImmersiveMode, onExit])
}
