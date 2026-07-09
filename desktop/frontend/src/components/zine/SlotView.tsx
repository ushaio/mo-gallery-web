import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import Moveable from 'react-moveable'
import { TriangleAlert } from 'lucide-react'

import { t } from '@/lib/i18n'
import { calculateEffectiveDpi, MIN_PRINT_DPI } from '@/lib/zine/print'
import { renderSlot } from '@/lib/zine/slot-render'
import type { Slot, Spread, ZineAsset } from '@/lib/zine/types'
import { usePreferences } from '@/store/preferences'
import { useZineStore } from '@/store/zine'

import { SlotImageContent } from './SlotImageContent'
import { SlotTextContent } from './SlotTextContent'

const PT_TO_MM = 25.4 / 72
const ASSET_DRAG_TYPE = 'application/x-zine-asset-id'

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

interface SlotViewProps {
  spread: Spread
  slot: Slot
  pageW: number
  assets: ZineAsset[]
  selected: boolean
  scale: number
  onSelect?: (slotId: string) => void
}

function toScreenPx(valueMm: number, scale: number) {
  return valueMm * scale
}

export function SlotView({ spread, slot, pageW, assets, selected, scale, onSelect }: SlotViewProps) {
  const { language } = usePreferences()
  const slotRef = useRef<HTMLDivElement | null>(null)
  const moveableRef = useRef<Moveable | null>(null)
  const transformRef = useRef({ x: 0, y: 0, w: slot.w, h: slot.h, rotation: slot.rotation, pxPerMm: scale })
  const dragDepthRef = useRef(0)
  const [dragOver, setDragOver] = useState(false)
  const [editingText, setEditingText] = useState(false)
  const updateSlot = useZineStore((state) => state.updateSlot)
  const rendered = renderSlot(slot, pageW, assets)
  const asset = slot.kind === 'image' ? assets.find((item) => item.id === slot.assetId) : undefined
  const isEmptyImage = slot.kind === 'image' && !asset
  const isEmptyText = slot.kind === 'text' && !slot.content
  // 有效打印分辨率过低时提示：铺满槽位 + 用户放大都会稀释源像素
  const effectiveDpi =
    slot.kind === 'image' && asset && asset.width > 0 && asset.height > 0
      ? calculateEffectiveDpi(asset.width, asset.height, slot.w, slot.h, slot.imageTransform.scale)
      : 0
  const lowRes = effectiveDpi > 0 && effectiveDpi < MIN_PRINT_DPI
  const slotHeightPx = toScreenPx(slot.h, scale)
  const slotStyle = {
    ...rendered.htmlStyle,
    left: `${toScreenPx(Number(rendered.htmlStyle.left), scale)}px`,
    top: `${toScreenPx(Number(rendered.htmlStyle.top), scale)}px`,
    width: `${toScreenPx(Number(rendered.htmlStyle.width), scale)}px`,
    height: `${toScreenPx(Number(rendered.htmlStyle.height), scale)}px`,
  }
  // 画布按屏幕像素渲染，字号（pt）需换算为 mm 再乘缩放，保证所见即所得
  const textStyle = rendered.text
    ? { ...rendered.text.htmlStyle, fontSize: `${Number(rendered.text.htmlStyle.fontSize) * PT_TO_MM * scale}px` }
    : undefined

  // 几何提交（拖拽/缩放/旋转/撤销/画布缩放）后：把拖拽期间手写的内联样式恢复为
  // React 计算值，并让 Moveable 重新测量。否则控制框会停在旧矩形上（残影/错位）
  useEffect(() => {
    const element = slotRef.current
    if (element) {
      element.style.left = String(slotStyle.left)
      element.style.top = String(slotStyle.top)
      element.style.width = String(slotStyle.width)
      element.style.height = String(slotStyle.height)
      element.style.transform = `rotate(${slot.rotation}deg)`
    }
    moveableRef.current?.updateRect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slotStyle 由以下几何输入推导
  }, [slot.x, slot.y, slot.w, slot.h, slot.rotation, slot.page, scale, selected])

  // 取消选中时退出文字编辑态
  useEffect(() => {
    if (!selected) setEditingText(false)
  }, [selected])

  function resetLiveStyle() {
    const element = slotRef.current
    if (!element) return

    element.style.transform = `rotate(${slot.rotation}deg)`
    element.style.width = `${toScreenPx(slot.w, scale)}px`
    element.style.height = `${toScreenPx(slot.h, scale)}px`
  }

  // 手势结束时先把最终几何直接写进 DOM 再提交 store：若 React 渲染被推迟，
  // 元素不会闪回旧位置（提交后 React 重渲染写入的是完全相同的值）
  function commitLiveGeometry(next: { x: number; y: number; w: number; h: number; rotation: number }) {
    const element = slotRef.current
    if (!element) return

    const pageOffset = slot.page === 'right' ? pageW : 0
    element.style.left = `${toScreenPx(pageOffset + next.x, scale)}px`
    element.style.top = `${toScreenPx(next.y, scale)}px`
    element.style.width = `${toScreenPx(next.w, scale)}px`
    element.style.height = `${toScreenPx(next.h, scale)}px`
    element.style.transform = `rotate(${next.rotation}deg)`
  }

  function isAssetDrag(event: React.DragEvent) {
    return event.dataTransfer.types.includes(ASSET_DRAG_TYPE)
  }

  return (
    <>
      <div
        ref={slotRef}
        role="button"
        tabIndex={0}
        className="group text-left outline-none"
        style={{
          ...slotStyle,
          cursor: selected ? 'move' : 'pointer',
          willChange: selected ? 'transform' : undefined,
        }}
        onClick={(event) => {
          event.stopPropagation()
          onSelect?.(slot.id)
        }}
        onDoubleClick={
          slot.kind === 'text'
            ? (event) => {
                event.stopPropagation()
                onSelect?.(slot.id)
                setEditingText(true)
              }
            : undefined
        }
        onKeyDown={(event) => {
          if (isEditableTarget(event.target)) return
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          if (event.key === 'Enter' && slot.kind === 'text' && selected) {
            setEditingText(true)
            return
          }
          onSelect?.(slot.id)
        }}
        onDragEnter={
          slot.kind === 'image'
            ? (event) => {
                if (!isAssetDrag(event)) return
                event.preventDefault()
                dragDepthRef.current += 1
                setDragOver(true)
              }
            : undefined
        }
        onDragOver={
          slot.kind === 'image'
            ? (event) => {
                if (!isAssetDrag(event)) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'copy'
              }
            : undefined
        }
        onDragLeave={
          slot.kind === 'image'
            ? () => {
                dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
                if (dragDepthRef.current === 0) setDragOver(false)
              }
            : undefined
        }
        onDrop={
          slot.kind === 'image'
            ? (event) => {
                event.preventDefault()
                event.stopPropagation()
                dragDepthRef.current = 0
                setDragOver(false)
                const assetId = event.dataTransfer.getData(ASSET_DRAG_TYPE)
                if (assetId) {
                  updateSlot(spread.id, slot.id, { assetId })
                  onSelect?.(slot.id)
                }
              }
            : undefined
        }
        aria-pressed={selected}
        aria-label={t(slot.kind === 'image' ? 'admin.zine_slot_image' : 'admin.zine_slot_text', language)}
      >
        {slot.kind === 'image' && (
          <SlotImageContent
            asset={asset}
            innerStyle={rendered.imageInner?.htmlStyle}
            compact={slotHeightPx < 56}
            hintText={t('admin.zine_empty_slot_hint', language)}
          />
        )}
        {slot.kind === 'text' && rendered.text && (
          <SlotTextContent
            content={rendered.text.content}
            style={textStyle}
            placeholder={t('admin.zine_text_edit_hint', language)}
            editing={editingText}
            onEditEnd={() => setEditingText(false)}
            onChange={(content) => {
              if (content !== slot.content) updateSlot(spread.id, slot.id, { content })
            }}
          />
        )}

        {/* 低分辨率警示角标 */}
        {lowRes && !dragOver && (
          <span
            className="pointer-events-none absolute right-1 top-1 z-10 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm"
            style={{ backgroundColor: 'rgba(217, 119, 6, 0.92)' }}
            title={t('admin.zine_low_res_hint', language, { dpi: Math.round(effectiveDpi) })}
          >
            <TriangleAlert size={10} />
            {slotHeightPx > 44 && `${Math.round(effectiveDpi)} DPI`}
          </span>
        )}

        {/* 空槽位的取景框式虚线轮廓 */}
        {(isEmptyImage || isEmptyText) && !dragOver && (
          <div className="pointer-events-none absolute inset-0 border border-dashed" style={{ borderColor: 'rgba(113, 113, 122, 0.5)' }} />
        )}

        {/* 悬停轮廓（未选中时） */}
        {!selected && !dragOver && (
          <div
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
            style={{ boxShadow: 'inset 0 0 0 1.5px color-mix(in srgb, var(--primary) 60%, transparent)' }}
          />
        )}

        {/* 拖放高亮 */}
        {dragOver && (
          <div
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--primary) 12%, transparent)',
              boxShadow: 'inset 0 0 0 2px var(--primary)',
            }}
          >
            {slotHeightPx > 44 && (
              <span className="rounded-full px-2.5 py-1 text-[11px] font-medium shadow-sm" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                {t('admin.zine_drop_here', language)}
              </span>
            )}
          </div>
        )}
      </div>
      {selected && (
        <Moveable
          ref={moveableRef}
          target={slotRef}
          // React 18 自动批处理会让控制框状态延后一拍提交，表现为拖拽不跟手/抖动；
          // 传入 flushSync 让 moveable 同步刷新（官方推荐做法）
          flushSync={flushSync}
          draggable
          resizable
          rotatable
          snappable
          checkInput
          onDragStart={({ set }) => {
            transformRef.current = { x: 0, y: 0, w: slot.w, h: slot.h, rotation: slot.rotation, pxPerMm: scale }
            set([0, 0])
          }}
          onDrag={({ target, beforeTranslate }) => {
            transformRef.current.x = beforeTranslate[0]
            transformRef.current.y = beforeTranslate[1]
            target.style.transform = `translate(${beforeTranslate[0]}px, ${beforeTranslate[1]}px) rotate(${slot.rotation}deg)`
          }}
          onDragEnd={() => {
            const { x, y, pxPerMm } = transformRef.current
            if (x === 0 && y === 0) {
              resetLiveStyle()
              return
            }
            const next = { x: slot.x + x / pxPerMm, y: slot.y + y / pxPerMm, w: slot.w, h: slot.h, rotation: slot.rotation }
            commitLiveGeometry(next)
            updateSlot(spread.id, slot.id, { x: next.x, y: next.y })
          }}
          onResizeStart={({ dragStart }) => {
            transformRef.current = { x: 0, y: 0, w: slot.w, h: slot.h, rotation: slot.rotation, pxPerMm: scale }
            if (dragStart) dragStart.set([0, 0])
          }}
          onResize={({ target, width, height, drag }) => {
            // 与提交时的 5mm 下限保持一致，避免松手后尺寸回弹
            const minPx = 5 * transformRef.current.pxPerMm
            const nextW = Math.max(minPx, width)
            const nextH = Math.max(minPx, height)
            transformRef.current = { ...transformRef.current, x: drag.beforeTranslate[0], y: drag.beforeTranslate[1], w: nextW, h: nextH }
            target.style.width = `${nextW}px`
            target.style.height = `${nextH}px`
            target.style.transform = `translate(${drag.beforeTranslate[0]}px, ${drag.beforeTranslate[1]}px) rotate(${slot.rotation}deg)`
          }}
          onResizeEnd={() => {
            const { x, y, w, h, pxPerMm } = transformRef.current
            const next = {
              x: slot.x + x / pxPerMm,
              y: slot.y + y / pxPerMm,
              w: Math.max(5, w / pxPerMm),
              h: Math.max(5, h / pxPerMm),
              rotation: slot.rotation,
            }
            commitLiveGeometry(next)
            updateSlot(spread.id, slot.id, { x: next.x, y: next.y, w: next.w, h: next.h })
          }}
          onRotateStart={({ set }) => {
            transformRef.current = { x: 0, y: 0, w: slot.w, h: slot.h, rotation: slot.rotation, pxPerMm: scale }
            set(slot.rotation)
          }}
          onRotate={({ target, beforeRotate }) => {
            transformRef.current.rotation = beforeRotate
            target.style.transform = `rotate(${beforeRotate}deg)`
          }}
          onRotateEnd={() => {
            if (transformRef.current.rotation === slot.rotation) {
              resetLiveStyle()
              return
            }
            commitLiveGeometry({ x: slot.x, y: slot.y, w: slot.w, h: slot.h, rotation: transformRef.current.rotation })
            updateSlot(spread.id, slot.id, { rotation: transformRef.current.rotation })
          }}
        />
      )}
    </>
  )
}
