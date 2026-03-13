'use client'

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'

type CornerHandle = 'nw' | 'ne' | 'sw' | 'se'

interface DragState {
  handle: CornerHandle
  startX: number
  startY: number
  startWidth: number
  aspectRatio: number
}

const MIN_WIDTH = 100

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

export function ResizableImageNodeView({ node, updateAttributes, selected }: ReactNodeViewProps) {
  const imageRef = useRef<HTMLImageElement | null>(null)
  const dragStateRef = useRef<DragState | null>(null)

  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const [isResizing, setIsResizing] = useState(false)

  const src = typeof node.attrs.src === 'string' ? node.attrs.src : ''
  const alt = typeof node.attrs.alt === 'string' ? node.attrs.alt : ''
  const title = typeof node.attrs.title === 'string' ? node.attrs.title : undefined
  const align = (node.attrs.align as string) || null

  const wrapperClassName = align === 'center'
    ? 'resizable-image-wrapper block mx-auto max-w-full'
    : align === 'right'
      ? 'resizable-image-wrapper block ml-auto max-w-full'
      : 'resizable-image-wrapper inline-block max-w-full align-middle'

  const attrWidth = toNumber(node.attrs.width)
  const resolvedWidth = Math.max(
    MIN_WIDTH,
    dragWidth ?? attrWidth ?? naturalSize?.width ?? MIN_WIDTH,
  )

  const onImageLoad = useCallback(() => {
    const imageElement = imageRef.current
    if (!imageElement) {
      return
    }

    setNaturalSize({
      width: imageElement.naturalWidth,
      height: imageElement.naturalHeight,
    })
  }, [])

  const stopResizing = useCallback(() => {
    const dragState = dragStateRef.current
    if (!dragState) {
      return
    }

    const finalWidth = Math.max(MIN_WIDTH, dragWidth ?? dragState.startWidth)
    updateAttributes({ width: Math.round(finalWidth) })

    dragStateRef.current = null
    setIsResizing(false)
    setDragWidth(null)
  }, [dragWidth, updateAttributes])

  useEffect(() => {
    if (!isResizing) {
      return
    }

    const onMouseMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current
      if (!dragState) {
        return
      }

      const deltaX = event.clientX - dragState.startX
      const deltaY = event.clientY - dragState.startY

      const horizontalDirection = dragState.handle === 'ne' || dragState.handle === 'se' ? 1 : -1
      const verticalDirection = dragState.handle === 'sw' || dragState.handle === 'se' ? 1 : -1

      const projectedDeltaFromX = deltaX * horizontalDirection
      const projectedDeltaFromY = deltaY * verticalDirection * (dragState.aspectRatio || 1)
      const dominantDelta = Math.abs(projectedDeltaFromX) >= Math.abs(projectedDeltaFromY)
        ? projectedDeltaFromX
        : projectedDeltaFromY

      const nextWidth = Math.max(MIN_WIDTH, dragState.startWidth + dominantDelta)
      setDragWidth(nextWidth)
    }

    const onMouseUp = () => {
      stopResizing()
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isResizing, stopResizing])

  const startResize = useCallback(
    (handle: CornerHandle) => (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()

      const baseWidth = Math.max(MIN_WIDTH, resolvedWidth)
      const naturalWidth = naturalSize?.width ?? imageRef.current?.naturalWidth ?? baseWidth
      const naturalHeight = naturalSize?.height ?? imageRef.current?.naturalHeight ?? baseWidth
      const aspectRatio = naturalHeight > 0 ? naturalWidth / naturalHeight : 1

      dragStateRef.current = {
        handle,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: baseWidth,
        aspectRatio,
      }

      setDragWidth(baseWidth)
      setIsResizing(true)
    },
    [naturalSize, resolvedWidth],
  )

  return (
    <NodeViewWrapper className={wrapperClassName}>
      <div
        className="relative inline-block max-w-full"
        style={{
          width: `${resolvedWidth}px`,
          boxShadow: selected ? '0 0 0 2px hsl(var(--primary))' : undefined,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          title={title}
          onLoad={onImageLoad}
          className="block h-auto max-w-full select-none"
          style={{ width: `${resolvedWidth}px`, minWidth: `${MIN_WIDTH}px` }}
          draggable={false}
        />

        {selected && (
          <>
            <button
              type="button"
              aria-label="Resize image from top left"
              className="absolute -left-1.5 -top-1.5 h-3 w-3 cursor-nwse-resize border border-white bg-primary"
              onMouseDown={startResize('nw')}
            />
            <button
              type="button"
              aria-label="Resize image from top right"
              className="absolute -right-1.5 -top-1.5 h-3 w-3 cursor-nesw-resize border border-white bg-primary"
              onMouseDown={startResize('ne')}
            />
            <button
              type="button"
              aria-label="Resize image from bottom left"
              className="absolute -bottom-1.5 -left-1.5 h-3 w-3 cursor-nesw-resize border border-white bg-primary"
              onMouseDown={startResize('sw')}
            />
            <button
              type="button"
              aria-label="Resize image from bottom right"
              className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize border border-white bg-primary"
              onMouseDown={startResize('se')}
            />
          </>
        )}
      </div>
    </NodeViewWrapper>
  )
}

export default ResizableImageNodeView
