'use client'

import { useEffect, useRef } from 'react'
import { WindowFullscreen, WindowUnfullscreen } from '../../../../wailsjs/runtime/runtime'

/**
 * 沉浸模式 hook（叙事/博客共用）：
 * 进入时调用原生全屏并隐藏 body 滚动，Esc 退出。
 * onExit 经 ref 引用，避免调用方传入内联箭头导致 effect 在每次渲染时重建，
 * 反复触发 WindowUnfullscreen/WindowFullscreen，造成「窗口变小但仍是沉浸样式」的竞态。
 */
export function useImmersiveMode(isImmersiveMode: boolean, onExit: () => void) {
  const onExitRef = useRef(onExit)

  useEffect(() => {
    onExitRef.current = onExit
  }, [onExit])

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
      onExitRef.current()
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.classList.remove('mo-immersive')
      document.body.style.overflow = previousBodyOverflow
      WindowUnfullscreen()
    }
  }, [isImmersiveMode])
}
