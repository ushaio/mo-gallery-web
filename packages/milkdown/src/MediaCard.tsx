'use client'

import { useState } from 'react'
import { ExternalLink, File, ImageOff, ImagePlus, Link, LoaderCircle, Music2, Pencil, Trash2, TriangleAlert, Video } from 'lucide-react'
import { mediaProviderLabel } from './media-embed'
import { normalizeMedia, safeMediaUrl } from './media'
import type { MediaCardData, MediaImage, MediaUrlResolver } from './media'

interface MediaCardProps {
  media: MediaCardData
  resolveUrl?: MediaUrlResolver
  /** 占位卡的本地预览图（blob: / 本地资源库缩略图），仅本次会话有效，不进文档。 */
  uploadPreviewUrl?: string
  language?: 'zh' | 'en'
  onEdit?: () => void
  onRemove?: () => void
  onPhotoClick?: (photoId: string) => void
}

function sourceLabel(src: string): string {
  try { return new URL(src).hostname.replace(/^www\./, '') }
  catch { return src.split('/').pop()?.split('?')[0] ?? '' }
}

export function MediaCard({ media: value, resolveUrl, uploadPreviewUrl, language = 'zh', onEdit, onRemove, onPhotoClick }: MediaCardProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const media = normalizeMedia(value)
  const zh = language === 'zh'
  const resolve = (src = '', photoId?: string) => safeMediaUrl(resolveUrl?.(src, photoId) ?? src)
  const src = resolve(media.src, media.photoId)
  const source = sourceLabel(src)
  const embed = media.embed
  const isPlayer = Boolean(embed) || media.kind === 'video' || media.kind === 'audio'
  const fallbackTitle = media.kind === 'audio' ? (zh ? '音频' : 'Audio') : media.kind === 'video' ? (zh ? '视频' : 'Video') : (zh ? '媒体' : 'Media')
  const title = media.title
    || (embed ? mediaProviderLabel(embed.provider, language) : '')
    || (media.kind === 'link' || media.kind === 'file' ? source : '')
    || fallbackTitle
  const Icon = media.kind === 'audio' ? Music2 : isPlayer ? Video : media.kind === 'file' ? File : Link
  const openLabel = zh ? '在网站打开' : 'Open on website'
  const actions = (onEdit || onRemove) && <div className="milkdown-media-actions">
    {onEdit && media.kind !== 'upload' && <button type="button" onClick={onEdit} aria-label={zh ? '编辑媒体' : 'Edit media'} title={zh ? '编辑媒体' : 'Edit media'}><Pencil size={15} /></button>}
    {onRemove && <button type="button" onClick={onRemove} aria-label={zh ? '移除媒体' : 'Remove media'} title={zh ? '移除媒体' : 'Remove media'}><Trash2 size={15} /></button>}
  </div>

  const renderImage = (image: MediaImage, index = 0) => {
    const url = resolve(image.src, image.photoId)
    const picture = url ? <img src={url} alt={image.alt ?? ''} data-photo-id={image.photoId || undefined} loading="lazy" /> : <span className="milkdown-media-empty"><ImageOff size={24} />{zh ? '图片暂不可用' : 'Image unavailable'}</span>
    return onPhotoClick && image.photoId ? (
      <button type="button" key={`${image.photoId}-${index}`} className="milkdown-media-photo" onClick={() => onPhotoClick(image.photoId!)} aria-label={image.alt || (zh ? '查看图片' : 'View image')}>{picture}</button>
    ) : <div key={`${image.src}-${index}`} className="milkdown-media-photo">{picture}</div>
  }

  return (
    <figure className={`milkdown-media milkdown-media-${media.kind}`} data-media-kind={media.kind} data-provider={embed?.provider} style={media.width ? { width: media.width } : undefined}>
      {isPlayer && <div className="milkdown-media-header">
        <span className="milkdown-media-icon"><Icon size={18} /></span>
        <div className="milkdown-media-info"><strong>{title}</strong>{source && <small>{source}</small>}</div>
        <div className="milkdown-media-controls">
          {src && <a className="milkdown-media-open" href={src} target="_blank" rel="noopener noreferrer" aria-label={openLabel} title={openLabel}><ExternalLink size={15} /></a>}
          {actions}
        </div>
      </div>}
      {!isPlayer && (media.kind === 'image' || media.kind === 'gallery' || media.kind === 'upload') && actions && <div className="milkdown-media-overlay">{actions}</div>}
      {media.kind === 'image' && renderImage({ src: media.src ?? '', alt: media.title, photoId: media.photoId })}
      {media.kind === 'gallery' && <div className="milkdown-media-grid">{media.images?.map(renderImage)}</div>}
      {embed ? (
        <iframe className={`milkdown-media-frame${embed.height ? ' milkdown-media-frame-fixed' : ''}`} src={embed.src} title={title} height={embed.height} style={embed.height ? { height: embed.height } : undefined} loading="lazy" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen sandbox="allow-scripts allow-same-origin allow-presentation" referrerPolicy="strict-origin-when-cross-origin" />
      ) : isPlayer && (src && failedSrc !== src ? (
        media.kind === 'audio'
          ? <div className="milkdown-media-audio-player"><audio src={src} controls preload="metadata" aria-label={title} onError={() => setFailedSrc(src)} /></div>
          : <video className="milkdown-media-video-player" src={src} controls playsInline preload="metadata" aria-label={title} onError={() => setFailedSrc(src)} />
      ) : <div className="milkdown-media-empty"><Icon size={24} /><span>{zh ? '暂时无法播放此媒体' : 'This media cannot be played here'}</span>{src && <a href={src} target="_blank" rel="noopener noreferrer">{openLabel}<ExternalLink size={13} /></a>}</div>)}
      {!isPlayer && (media.kind === 'link' || media.kind === 'file') && <div className="milkdown-media-resource">
        <a className="milkdown-media-resource-link" href={src || undefined} target="_blank" rel="noopener noreferrer">
          {media.thumbnail ? <img className="milkdown-media-thumbnail" src={resolve(media.thumbnail)} alt="" loading="lazy" /> : <span className="milkdown-media-icon"><Icon size={20} /></span>}
          <span className="milkdown-media-info"><strong>{title}</strong><small>{src || (zh ? '链接不可用' : 'Link unavailable')}</small></span>
          {src && <ExternalLink className="milkdown-media-resource-arrow" size={15} />}
        </a>
        {actions}
      </div>}
      {media.kind === 'upload' && (uploadPreviewUrl ? (
        /* 有本地预览（blob: / 资源库缩略图）就直接回显图片，让用户插入后立刻看到是什么图。
           预览 URL 只来自渲染时的查表，不落进文档 —— 它跨重启必然失效。

           **图片容器刻意复用 .milkdown-media-photo**：与正式图片卡由同一段 CSS 决定尺寸，
           卡片高度与将来上传成功后的真实排版一致 —— 两处各写一份数值必然会漂移。
           状态只用图上的悬浮元素表达（左上 tag + 居中说明），都是绝对定位，不占布局高度。 */
        <div className="milkdown-media-photo milkdown-media-photo-upload">
          <img src={uploadPreviewUrl} alt={media.title} loading="lazy" />
          <span className={`milkdown-media-upload-tag${media.status === 'failed' ? ' is-failed' : ''}`} role="status">
            {media.status === 'failed'
              ? (zh ? '上传失败' : 'Upload failed')
              : media.status === 'pending'
                ? (zh ? '待上传' : 'Pending')
                : (zh ? '上传中' : 'Uploading')}
          </span>
          {/* 正在上传不必再解释；待传/失败各给一句「下一步会怎样 / 该怎么做」 */}
          {media.status !== 'uploading' && <span className={`milkdown-media-upload-note${media.status === 'failed' ? ' is-failed' : ''}`}>
            <TriangleAlert size={13} aria-hidden />
            {media.status === 'failed'
              ? (zh ? '移除卡片后重新上传' : 'Remove this card and upload again')
              : (zh ? '保存时一并上传' : 'Sent when you save')}
          </span>}
        </div>
      ) : (
        /* 没有本地预览就没有可压浮层的图，只能留文字占位（此处状态用文字表达，不再叠 tag） */
        <div className="milkdown-media-upload" role="status">
          {media.status === 'failed'
            ? <ImageOff size={24} />
            : media.status === 'pending'
              /* 待上传：还没开始传，用静态图标而不是转圈 —— 转圈会让用户以为正在跑 */
              ? <ImagePlus size={24} />
              : <LoaderCircle size={24} className="milkdown-spin" />}
          <strong>{media.title}</strong>
          <span>{media.status === 'failed'
            ? (zh ? '上传未完成，请移除此卡片后重新上传' : 'Upload incomplete. Remove this card and upload again.')
            : media.status === 'pending'
              ? (zh ? '待上传，保存时会一并上传' : 'Pending upload, sent when you save')
              : (zh ? '正在上传…' : 'Uploading…')}</span>
        </div>
      ))}
      {media.caption && <figcaption>{media.caption}</figcaption>}
    </figure>
  )
}
