'use client'

import { useCallback, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

/**
 * 图片卡的拖拽缩放手柄（**只在编辑器里出现**：`onWidthChange` 不传就没有这块 DOM，
 * 预览与发布侧一点痕迹不留）。
 *
 * 三个刻意的取舍：
 *  - **四个角柄画在卡片内侧 6px 处**，不外扩。卡片本体（`.milkdown-media`）是
 *    `overflow: hidden`（图片圆角靠它裁），往外画半颗会被自己裁掉。
 *  - **拖动过程只改 DOM，松手才落到文档上**：每一次 pointermove 都 dispatch 会在撤销栈里
 *    留下几十条记录、也会让自动保存连发几十次；宽度是「一次拖完的一次决定」。
 *  - **吸附到内容栏宽的 5%**：与 tiptap 编辑器里的图片缩放（ResizableImage）同一口径，
 *    两套编辑器的手感保持一致。
 */

/** 四个角。靠左的两个（nw / sw）拖动方向与宽度变化相反 —— 往左拖是变宽。 */
export const MEDIA_RESIZE_CORNERS = ['nw', 'ne', 'sw', 'se'] as const
export type MediaResizeCorner = typeof MEDIA_RESIZE_CORNERS[number]

/** 吸附步进：宽度以「内容栏宽的百分之几」为单位，取整到 5 的倍数。 */
const SNAP_STEP = 5
/** 最小宽度（占内容栏宽的百分比）。再小就不是「一张图」了，也没法再把手柄拖回来。 */
const MIN_PERCENT = 5

/**
 * 可排版宽度。**不能拿卡片自己量**：图片卡已经收成「图片那么宽」（fit-content），
 * 量出来的永远是当前宽度，拖不动。真正的参考系是正文栏（.ProseMirror）的内容宽度，
 * 与 tiptap 侧 getContentWidth 同一算法。
 */
function contentWidth(figure: HTMLElement): number {
  const editor = figure.closest('.ProseMirror')
  if (editor instanceof HTMLElement) {
    const style = window.getComputedStyle(editor)
    const padding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0)
    return Math.max(1, editor.clientWidth - padding)
  }
  // 只读渲染侧没有编辑器：退化成父容器宽度（正常走不到，手柄只在编辑器里渲染）
  const parent = figure.parentElement
  return Math.max(1, parent?.clientWidth || figure.getBoundingClientRect().width)
}

/**
 * 这张图最多能放到多宽：正文栏宽与图片**原始像素宽**取小。
 *
 * 原始宽度是硬上限 —— 再往大拖只是在放大把像素拉糊，用户要的是「让这张图小一点」，
 * 从来不是「把小图糊成满栏」。拿不到自然宽度（还在加载 / 缺图）时退回正文栏宽。
 */
function maxWidthOf(figure: HTMLElement, available: number): number {
  const image = figure.querySelector('img')
  const natural = image instanceof HTMLImageElement ? image.naturalWidth : 0
  return natural > 0 ? Math.min(available, natural) : available
}

/** 把任意像素宽度吸附成「内容栏宽的 5% 倍数」，并夹在 5% 与上限之间。 */
function snapWidth(width: number, available: number, limit: number): number {
  if (!Number.isFinite(width) || available <= 0) return Math.max(1, Math.round(width))
  const step = available * (SNAP_STEP / 100)
  const floor = available * (MIN_PERCENT / 100)
  const ceiling = Math.max(floor, Math.min(available, limit > 0 ? limit : available))
  return Math.round(Math.max(floor, Math.min(ceiling, Math.round(width / step) * step)))
}

function percentOf(width: number, available: number): number {
  return available > 0 ? Math.round((width / available) * 100) : 100
}

export interface MediaResizeLayerProps {
  /** 松手 / 键盘调整后把新宽度落到文档（传 null 表示「还原成原始尺寸」）。 */
  onWidthChange: (width: number | null) => void
  language?: 'zh' | 'en'
}

/**
 * 手柄渲染在卡片本体（figure）**里面**：`.milkdown-media` 自建了 `position: relative`，
 * 四个角柄贴的正是卡片自己的框 —— 不需要从外面塞一个引用进来量。
 */
export function MediaResizeLayer({ onWidthChange, language = 'zh' }: MediaResizeLayerProps) {
  const zh = language === 'zh'
  /** 拖动中（只有它需要 React 重渲染：手柄常驻，读数浮层随它挂载）。 */
  const [resizing, setResizing] = useState(false)
  const badgeRef = useRef<HTMLSpanElement | null>(null)

  /**
   * 读数的那一行字**不走 React 状态**：一次拖动有几十次 pointermove，每帧重渲染整张卡片
   * 是不必要的开销。文本存在 ref 里、由 paint 直接写进 DOM；浮层首次挂载时用同一个 ref 补上初值
   * （否则按下角柄的第一帧是一个空白胶囊，要等指针动了才出现数字）。
   */
  const percentRef = useRef('')
  const attachBadge = useCallback((node: HTMLSpanElement | null) => {
    badgeRef.current = node
    if (node) node.textContent = percentRef.current
  }, [])

  /** 拖动中的宽度直接写进 DOM：一道内联宽度 + 显式宽度的标记（CSS 靠它把图片切成等比缩放）。 */
  const paint = useCallback((figure: HTMLElement, width: number, available: number) => {
    figure.style.width = `${width}px`
    figure.dataset.mediaWidth = ''
    percentRef.current = `${percentOf(width, available)}%`
    if (badgeRef.current) badgeRef.current.textContent = percentRef.current
  }, [])

  const startResize = useCallback((corner: MediaResizeCorner) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    const figure = event.currentTarget.closest('figure')
    // 只认左键 / 单指主触点：右键与辅助键是菜单与多选
    if (!(figure instanceof HTMLElement) || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.preventDefault()
    event.stopPropagation()
    const handle = event.currentTarget
    const startX = event.clientX
    const startWidth = figure.getBoundingClientRect().width
    const available = contentWidth(figure)
    // 上限在按下那一刻定下来：拖动途中图片若刚好加载完，量到的自然宽度会跳，手感会突变
    const limit = maxWidthOf(figure, available)
    // 左侧的两个角：指针往左（clientX 变小）宽度变大
    const direction = corner === 'nw' || corner === 'sw' ? -1 : 1
    // 取消时用来还原：拖动前卡片可能压根没有显式宽度
    const restoreWidth = figure.style.width
    const hadAttr = figure.hasAttribute('data-media-width')
    let width = Math.round(startWidth)

    // 打上「正在缩放」的标记：卡片的 NodeView 外层是 draggable="true"，浏览器会把按下角柄后的
    // 指针移动认成「拖这张卡」，而 dragstart 打在 node 上、不是手柄上 —— 手柄自己写的
    // onDragStart 收不到。media-plugin 的 dragstart 靠这个标记把那次拖拽掐掉。
    figure.dataset.mediaResizing = ''
    paint(figure, width, available)
    setResizing(true)
    handle.setPointerCapture?.(event.pointerId)

    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return
      moveEvent.preventDefault()
      width = snapWidth(startWidth + (moveEvent.clientX - startX) * direction, available, limit)
      paint(figure, width, available)
    }

    const finish = (commit: boolean) => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', cancelOnEscape)
      try { handle.releasePointerCapture?.(event.pointerId) } catch { /* 指针已经不在这颗手柄上 */ }
      setResizing(false)
      delete figure.dataset.mediaResizing
      if (!commit) {
        figure.style.width = restoreWidth
        if (hadAttr) figure.dataset.mediaWidth = ''
        else delete figure.dataset.mediaWidth
        return
      }
      onWidthChange(width)
    }
    const up = () => finish(true)
    const cancel = () => finish(false)
    const cancelOnEscape = (keyEvent: KeyboardEvent) => { if (keyEvent.key === 'Escape') finish(false) }

    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', cancelOnEscape)
  }, [onWidthChange, paint])

  /** 键盘也能改：方向键一次 5%，Shift + 方向键一次 10%，Home 还原原始尺寸。 */
  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const figure = event.currentTarget.closest('figure')
    if (!(figure instanceof HTMLElement)) return
    const handle = event.currentTarget
    /**
     * 落值之后把焦点要回手柄。
     *
     * setWidth 落到文档上时会 `view.focus()`（那是给「鼠标拖完接着打字」准备的），
     * 键盘连续调整时焦点被抢回正文 —— 按第二下方向键就不改宽度、变成在正文里挪光标了。
     * 同一次事件里后调的 focus 生效；React 重渲染会复用这几颗按钮，焦点不会丢。
     */
    const commit = (width: number | null) => { onWidthChange(width); handle.focus() }
    if (event.key === 'Home') {
      event.preventDefault()
      event.stopPropagation()
      commit(null)
      return
    }
    const step = event.shiftKey ? SNAP_STEP * 2 : SNAP_STEP
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? step
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -step
        : 0
    if (!delta) return
    event.preventDefault()
    event.stopPropagation()
    // 与拖动同一套像素口径：一次 5%（Shift 10%）个内容栏宽，夹在最小宽度与上限之间
    const available = contentWidth(figure)
    const limit = maxWidthOf(figure, available)
    commit(snapWidth(figure.getBoundingClientRect().width + (available * delta) / 100, available, limit))
  }, [onWidthChange])

  const label = zh ? '拖动调整宽度，双击还原原始尺寸' : 'Drag to resize, double-click to reset'

  return (
    <>
      {MEDIA_RESIZE_CORNERS.map((corner) => <button
        key={corner}
        type="button"
        className={`milkdown-media-resize milkdown-media-resize-${corner}`}
        aria-label={`${label} (${corner.toUpperCase()})`}
        title={label}
        // 卡片本身可拖（整卡拖去并进别的卡）：手柄上必须掐掉原生拖拽，
        // 否则按下角柄移动指针会被浏览器认成「拖这张卡」，缩放变搬运。
        draggable={false}
        onDragStart={(dragEvent) => dragEvent.preventDefault()}
        onPointerDown={startResize(corner)}
        onKeyDown={onKeyDown}
        onDoubleClick={(doubleClick) => { doubleClick.preventDefault(); doubleClick.stopPropagation(); onWidthChange(null) }}
      />)}
      {/* 拖动中的百分比读数：文本由 paint 直接写，不依赖 React 重渲染 */}
      {resizing && <span className="milkdown-media-resize-badge" ref={attachBadge} aria-hidden="true" />}
    </>
  )
}
