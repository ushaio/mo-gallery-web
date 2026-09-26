import { memo, useCallback, useMemo, useState } from 'react'

import type { PhotoSiteMetadata } from '@mo-gallery/content-core'
import type { MediaUrlResolver } from '../adapters'

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

// URLs that finished loading at least once this session. Virtualized cards
// (masonic 等宿主侧虚拟滚动) unmount when scrolled away; on remount the image
// is already in the browser cache, so skip the fade-in to avoid a blink.
const loadedImageUrls = new Set<string>()

/** 照片卡片共用的缩略图解析：优先缩略图，缺失时回落展示图。 */
export function usePhotoThumbUrl(photo: PhotoSiteMetadata, resolver: MediaUrlResolver): string {
  return useMemo(() => {
    try {
      return resolver.photoThumbnail(photo)
    } catch {
      return resolver.photoDisplay(photo)
    }
  }, [photo, resolver])
}

/**
 * dominantColors → 主色渐变占位背景（图片加载前展示，避免白屏闪烁）。
 * 非法色值直接忽略；无有效色值时返回 undefined（回落 bg-muted）。
 */
function usePlaceholderStyle(photo: PhotoSiteMetadata) {
  return useMemo(() => {
    const colors = (photo.dominantColors ?? [])
      .filter((color) => HEX_COLOR_PATTERN.test(color))
      .slice(0, 4)

    if (colors.length === 0) return undefined

    const primary = colors[0]
    const secondary = colors[1] ?? primary
    const tertiary = colors[2] ?? secondary
    const accent = colors[3] ?? primary

    return {
      backgroundColor: primary,
      backgroundImage: [
        `radial-gradient(circle at 18% 20%, ${secondary} 0%, transparent 48%)`,
        `radial-gradient(circle at 82% 24%, ${tertiary} 0%, transparent 46%)`,
        `radial-gradient(circle at 70% 86%, ${accent} 0%, transparent 52%)`,
        `linear-gradient(135deg, ${primary}, ${secondary})`,
      ].join(', '),
    }
  }, [photo.dominantColors])
}

interface PhotoCardProps {
  photo: PhotoSiteMetadata
  index?: number
  grayscale?: boolean
  showMeta?: boolean
  frameNumber?: number
  /**
   * 图像区形状：'auto' 按原图比例渲染（masonry/相册等自然高度场景）；
   * 'square' 等比方格裁切（GridView/TimelineView 等方格单元场景）。
   */
  imageAspect?: 'auto' | 'square'
  /** 图片加载优先级；首屏卡片可传 'eager'，默认 lazy。 */
  loading?: 'eager' | 'lazy'
  /**
   * 入场动效延迟（秒）；提供时根节点挂 `psw-enter` 类做 CSS stagger
   * （需宿主引入 web-theme.css）。不传则无入场动效——虚拟化列表
   * （masonic 等）请保持不传，避免滚动回补时反复重放入场。
   */
  enterDelay?: number
  resolver: MediaUrlResolver
  onPhotoClick?: (photo: PhotoSiteMetadata) => void
}

/**
 * 单张照片卡片（图库网格/相册/胶卷共用的最小访客卡片）。
 * 使用原生 <img>，不绑定宿主的图片优化组件；宿主如需 next/image
 * 等可在注入的 MediaUrlResolver 层或外层容器处理。
 */
export const PhotoCard = memo(function PhotoCard({
  photo,
  index,
  grayscale = false,
  showMeta = true,
  frameNumber,
  imageAspect = 'auto',
  loading = 'lazy',
  enterDelay,
  resolver,
  onPhotoClick,
}: PhotoCardProps) {
  const thumbUrl = usePhotoThumbUrl(photo, resolver)
  const placeholderStyle = usePlaceholderStyle(photo)
  const [revealed, setRevealed] = useState(() => loadedImageUrls.has(thumbUrl))
  const title = photo.title?.trim() || ''
  const primaryTag = photo.tags[0]
  const isSquare = imageAspect === 'square'
  // 容器为固定比例（方格模式，或 auto 模式下元数据缺宽高的兜底）时，
  // 图片必须填满容器由 object-cover 裁切；否则横向图会在方形占位下露渐变底。
  const fillFrame = isSquare || !photo.width || !photo.height

  const handleImageLoad = useCallback(() => {
    loadedImageUrls.add(thumbUrl)
    setRevealed(true)
  }, [thumbUrl])

  // 缓存图可能在 React 挂载 onLoad 前就完成加载（SSR/回补渲染），
  // ref 阶段兜底检查 complete，避免卡片停留在 opacity-0。
  const imageRef = useCallback((element: HTMLImageElement | null) => {
    if (element?.complete && element.naturalWidth > 0) {
      loadedImageUrls.add(thumbUrl)
      setRevealed(true)
    }
  }, [thumbUrl])

  return (
    <div
      className={`group relative cursor-pointer overflow-hidden bg-muted ${enterDelay !== undefined ? 'psw-enter' : ''}`}
      style={enterDelay !== undefined ? { animationDelay: `${enterDelay}s` } : undefined}
      role={onPhotoClick ? 'button' : undefined}
      tabIndex={onPhotoClick ? 0 : undefined}
      onClick={() => onPhotoClick?.(photo)}
      onKeyDown={(event) => {
        if (onPhotoClick && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onPhotoClick(photo)
        }
      }}
    >
      <div
        className={`relative w-full overflow-hidden ${isSquare ? 'aspect-square' : photo.width && photo.height ? '' : 'aspect-square'}`}
        style={placeholderStyle}
      >
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={title}
            width={isSquare ? undefined : photo.width || undefined}
            height={isSquare ? undefined : photo.height || undefined}
            loading={loading}
            decoding="async"
            onLoad={handleImageLoad}
            ref={imageRef}
            className={`block object-cover transition-[filter,transform,opacity] duration-500 ease-out group-hover:scale-[1.05] ${fillFrame ? 'h-full w-full' : 'h-auto w-full'} ${grayscale ? 'grayscale' : ''} ${revealed ? 'opacity-100' : 'opacity-0'}`}
          />
        ) : (
          <div className={`flex items-center justify-center text-muted-foreground ${isSquare ? 'h-full w-full' : 'aspect-square w-full'}`} aria-label="Image unavailable">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          </div>
        )}
        {/* 方格单元（GridView/TimelineView）：web TimelinePhotoItem 同款渐变
            遮罩 + 主标签/标题 hover 上浮；masonry（showMeta）保留图下题注，
            只做轻遮罩，避免题注重复 */}
        {!showMeta ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            {primaryTag ? (
              <p className="mb-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
                {primaryTag}
              </p>
            ) : null}
            {title ? (
              <h3 className="line-clamp-1 font-serif text-lg leading-tight text-white">{title}</h3>
            ) : null}
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-0 bg-black/20 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
        )}
        {frameNumber !== undefined ? (
          <span className="absolute left-2 top-2 bg-black/50 px-1.5 py-0.5 font-mono text-[10px] text-white/80">
            {String(frameNumber).padStart(3, '0')}
          </span>
        ) : null}
      </div>

      {showMeta && (title || primaryTag) ? (
        <div className="flex items-start justify-between gap-2 px-0.5 pt-2 opacity-60 transition-opacity group-hover:opacity-100">
          <div className="min-w-0">
            {title ? (
              <h3 className="truncate font-serif text-sm leading-tight text-foreground">{title}</h3>
            ) : null}
            {primaryTag ? (
              <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {primaryTag}
              </p>
            ) : null}
          </div>
          {index !== undefined ? (
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
              {String(index + 1).padStart(2, '0')}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
})
