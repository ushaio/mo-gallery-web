'use client'

import { useEffect, useRef, useState } from 'react'
import type { FocusEvent } from 'react'
import { AlignCenter, AlignLeft, AlignRight, ExternalLink, File, ImageOff, ImagePlus, Link, LoaderCircle, Music2, Pencil, Trash2, Video } from 'lucide-react'
import { mediaProviderLabel } from './media-embed'
import { MEDIA_ALIGNS, mediaAlign, normalizeMedia, normalizeMediaAlign, safeMediaUrl } from './media'
import { MediaResizeLayer } from './media-resize'
import { galleryGridStyle, galleryTileStyle } from './gallery-layout'
import type { MediaAlign, MediaCardData, MediaImage, MediaLinkPreview, MediaLinkPreviewResolver, MediaUrlResolver } from './media'

interface MediaCardProps {
  media: MediaCardData
  resolveUrl?: MediaUrlResolver
  /**
   * 按 uploadId 现取待上传项的本地预览图（blob: / 本地资源库缩略图）。
   * 与编辑器 `MediaViewOptions.resolveUploadPreview` 同一口径：会话级 URL，只现取、绝不进文档。
   * 图片卡 / 拼图里的待传格 / 占位卡三种位置都走它。
   */
  resolveUploadPreview?: (uploadId: string) => string | undefined
  /**
   * 是否显示上传状态浮层（待上传 / 上传中）——上传失败沿用待上传那一套，不再单说。
   * 预览与发布侧传 false：待上传项按正式图片渲染 —— 读者与作者在预览里
   * 只该看到「文章长什么样」，不该看到「这张还没上传」这类内部状态。
   */
  showUploadStatus?: boolean
  language?: 'zh' | 'en'
  onEdit?: () => void
  onRemove?: () => void
  onPhotoClick?: (photoId: string) => void
  /**
   * 改这张单图卡的对齐（只在编辑器里传）。传了就多出一块**悬浮在卡片之外**的工具栏
   * （见下方的 .milkdown-media-toolbar），里面那个对齐图标点一下换一种；
   * 卡片只负责说「用户想要哪一种」，落到文档上由调用方做。
   */
  onAlignChange?: (align: MediaAlign) => void
  /**
   * 改这张单图卡的显示宽度（只在编辑器里传）。传了就多出**四个拖拽角柄**
   * （见 media-resize.tsx）：拖动按内容栏宽的比例缩放，过程中只改 DOM、
   * 松手才调一次这里把钱落到文档上；双击角柄传 null 还原成原始尺寸。
   * 预览与发布侧不传 —— 读者那一侧一个手柄都不该出现。
   */
  onWidthChange?: (width: number | null) => void
  /**
   * 拼图里的每一格是否单独可拖（编辑器传 true）：拖出去即「把这一格拿出来」——
   * 拖到别的图片 / 拼图上并进去、拖到同一张拼图里调序、拖到正文里还原成独立图片卡
   * （落点语义见 media-merge.ts）。预览与发布侧不传：读者那一侧一格都不该能拖。
   */
  draggableTiles?: boolean
  /**
   * 按 URL 现取网页信息（标题 / 摘要 / 站点名 / 封面 / 图标），用于**富链接卡**。
   *
   * 与 `resolveUploadPreview` 同一类「渲染期现取」能力，但语义相反：抓回来的东西
   * **值得落进文档**（插入时由 MediaDialog 写入），这里查表只是为了补上老文档里
   * 还没存过元信息的卡片 —— 所以只在文档缺字段时才发请求，且结果只进内存、不回写。
   */
  resolveLinkPreview?: MediaLinkPreviewResolver
}

function sourceLabel(src: string): string {
  try { return new URL(src).hostname.replace(/^www\./, '') }
  catch { return src.split('/').pop()?.split('?')[0] ?? '' }
}

/** 链接卡底行显示的路径：「host」显得空，带上 pathname 才看得出是哪一页。 */
function urlLabel(src: string): string {
  try {
    const url = new URL(src)
    const path = decodeURI(url.pathname).replace(/\/$/, '')
    return `${url.hostname.replace(/^www\./, '')}${path === '' || path === '/' ? '' : path}`
  } catch { return sourceLabel(src) }
}

/**
 * 网页信息查询的**模块级缓存**：同一篇文章里同一个链接出现两次、或滚出视口再滚回来，
 * 都只该发一次请求。null 也要缓存 —— 抓不到的站（需要登录、禁了爬虫）每次重试都是白等。
 * 键是**规范化后的绝对 URL**，不同 query 视为不同页面。
 */
const linkPreviewCache = new Map<string, MediaLinkPreview | null>()
const linkPreviewInflight = new Map<string, Promise<MediaLinkPreview | null>>()

function requestLinkPreview(resolver: MediaLinkPreviewResolver, url: string): Promise<MediaLinkPreview | null> {
  if (linkPreviewCache.has(url)) return Promise.resolve(linkPreviewCache.get(url) ?? null)
  const pending = linkPreviewInflight.get(url)
  if (pending) return pending
  const task = resolver(url)
    .then((result) => {
      const value = result && typeof result === 'object' ? result : null
      linkPreviewCache.set(url, value)
      return value
    })
    .catch(() => {
      linkPreviewCache.set(url, null)
      return null
    })
    .finally(() => { linkPreviewInflight.delete(url) })
  linkPreviewInflight.set(url, task)
  return task
}

/**
 * 左上角那枚状态 tag 的文字。`failed` 与 `pending` 说同一句话：
 * 失败项仍留在待传集合里、保存时照常重传（见 handleConfirmUpload），
 * 卡片另说一套「上传失败」只会让人以为这张卡废了、要拆掉重来。
 */
function uploadStatusLabel(status: MediaCardData['status'], zh: boolean): string {
  if (status === 'uploading') return zh ? '上传中' : 'Uploading'
  return zh ? '待上传' : 'Pending'
}

export function MediaCard({ media: value, resolveUrl, resolveUploadPreview, resolveLinkPreview, showUploadStatus = true, language = 'zh', onEdit, onRemove, onPhotoClick, onAlignChange, onWidthChange, draggableTiles = false }: MediaCardProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  /** 对齐三选一是否已摊开（见 alignControl）。卡片被选中才显示，收起是常态。 */
  const [alignOpen, setAlignOpen] = useState(false)
  const media = normalizeMedia(value)
  const zh = language === 'zh'
  const resolve = (src = '', photoId?: string) => safeMediaUrl(resolveUrl?.(src, photoId) ?? src)
  const uploadPreview = (uploadId?: string) => uploadId ? resolveUploadPreview?.(uploadId) : undefined
  const src = resolve(media.src, media.photoId)
  const source = sourceLabel(src)
  /**
   * 富链接卡的元信息：**文档里存过的优先，没存过才现抓一次**（抓回来的只留在内存里）。
   *
   * 触发条件写成「缺任何一项」，于是老文档第一次打开就会补齐显示；而已经存全的卡片
   * 一个请求都不发 —— 发布出去的公开页面因此不会因为读者打开文章就去打别人的站点。
   * 宿主不注入 resolveLinkPreview（或读者侧刻意不注入）时，这里永远不联网。
   */
  const [linkPreview, setLinkPreview] = useState<MediaLinkPreview | null>(null)
  const linkUrl = media.kind === 'link' && !media.embed ? src : ''
  const needsLinkPreview = Boolean(linkUrl && resolveLinkPreview) && !(media.description && media.siteName && media.thumbnail)
  useEffect(() => {
    if (!needsLinkPreview) return
    let alive = true
    void requestLinkPreview(resolveLinkPreview!, linkUrl).then((result) => {
      if (alive && result) setLinkPreview(result)
    })
    return () => { alive = false }
  }, [needsLinkPreview, linkUrl, resolveLinkPreview])
  const linkSite = media.siteName || linkPreview?.siteName || source
  const linkDescription = media.description || linkPreview?.description || ''
  const linkTitle = media.title || linkPreview?.title || source
  const linkCover = media.thumbnail ? resolve(media.thumbnail) : safeMediaUrl(linkPreview?.image ?? '')
  const linkIcon = media.icon ? resolve(media.icon) : safeMediaUrl(linkPreview?.icon ?? '')
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

  /**
   * 对齐入口，两步（只有编辑器会拿到它：onAlignChange 不传就没有这块 DOM，预览 / 发布侧一点痕迹不留）。
   *
   * ① 主按钮：跟编辑 / 移除同一簇、同一套显隐（悬浮或选中就出现），图标就是当前对齐。
   * ② 点开主按钮：左 / 中 / 右三个选择一起摊出来，当前生效的那项用主色标出 ——
   *    对齐本是三选一，与其让人点着猜下一个是哪种，不如一次摊开看清楚。
   *    这一排**浮在卡片上方（卡片之外）**：卡片本体是 `overflow: hidden`（图片圆角靠它裁），
   *    摊开的一排放在卡片里会被自己裁掉一截，窄图上尤其明显。所以它是 <figure> 的兄弟节点，
   *    靠 NodeView 外层定位。
   *
   * 收回的时机：选中一项、再点一次主按钮、或焦点离开「主按钮 + 这排选择」。
   * 两者一个在卡片内、一个在卡片外，包不进同一个容器，所以各挂一次 onBlur，用 refs 互相认一下。
   */
  const align = normalizeMediaAlign(media.align)
  const alignIcons = { left: AlignLeft, center: AlignCenter, right: AlignRight }
  const AlignIcon = alignIcons[align]
  const alignNames = { left: zh ? '左对齐' : 'Left', center: zh ? '居中' : 'Center', right: zh ? '右对齐' : 'Right' }
  const alignToggleLabel = `${zh ? '对齐方式' : 'Alignment'}: ${alignNames[align]}`
  const alignToggleRef = useRef<HTMLButtonElement>(null)
  const alignPanelRef = useRef<HTMLDivElement>(null)
  const collapseAlign = (event: FocusEvent) => {
    // 焦点只是在这一簇内部挪（主按钮 ↔ 某个选择）不算离开
    const next = event.relatedTarget as Node | null
    if (next && (alignToggleRef.current?.contains(next) || alignPanelRef.current?.contains(next))) return
    setAlignOpen(false)
  }
  const alignControl = onAlignChange && media.kind === 'image' && <button
    ref={alignToggleRef}
    type="button"
    className="milkdown-media-align"
    aria-expanded={alignOpen}
    aria-label={alignToggleLabel}
    title={alignToggleLabel}
    onBlur={collapseAlign}
    onClick={() => setAlignOpen((open) => !open)}
  ><AlignIcon size={15} /></button>

  const alignPanel = onAlignChange && media.kind === 'image' && alignOpen && <div
    ref={alignPanelRef}
    className="milkdown-media-align-panel"
    role="group"
    aria-label={zh ? '对齐方式' : 'Alignment'}
    onBlur={collapseAlign}
  >
    {MEDIA_ALIGNS.map((value) => {
      const OptionIcon = alignIcons[value]
      return <button
        key={value}
        type="button"
        aria-pressed={align === value}
        aria-label={alignNames[value]}
        title={alignNames[value]}
        onClick={() => { onAlignChange(value); setAlignOpen(false) }}
      ><OptionIcon size={15} /></button>
    })}
  </div>

  const renderImage = (image: MediaImage, index = 0, draggable = false) => {
    // 拼图里的一格：没有 src 但有 uploadId ⇒ 这一格还没上传，按 uploadId 现取本地预览图
    const pendingId = !image.src && image.uploadId ? image.uploadId : ''
    const url = (pendingId ? uploadPreview(pendingId) : '') || resolve(image.src, image.photoId)
    const picture = url
      ? <img
        src={url}
        alt={image.alt ?? ''}
        data-photo-id={image.photoId || undefined}
        loading="lazy"
        style={image.crop ? {
          objectPosition: `${image.crop.x}% ${image.crop.y}%`,
          transform: `scale(${image.crop.scale})`,
        } : undefined}
        // The tile owns the editor drag gesture. Prevent the browser's native
        // image drag from bypassing the custom tile payload, especially for
        // local pending-upload previews.
        draggable={false}
      />
      : <span className="milkdown-media-empty"><ImageOff size={24} />{zh ? '图片暂不可用' : 'Image unavailable'}</span>
    const tagged = Boolean(pendingId) && showUploadStatus
    const tileClass = `milkdown-media-photo${tagged ? ' milkdown-media-photo-upload' : ''}`
    const tileStyle = media.kind === 'gallery' ? galleryTileStyle(index, media.images?.length ?? 0, media.layout) : undefined
    const body = <>
      {picture}
      {tagged && <span className="milkdown-media-upload-tag" role="status">{uploadStatusLabel(image.status, zh)}</span>}
    </>
    return onPhotoClick && image.photoId ? (
      <button type="button" key={`${image.photoId}-${index}`} className={tileClass} style={tileStyle} draggable={draggable || undefined} onClick={() => onPhotoClick(image.photoId!)} aria-label={image.alt || (zh ? '查看图片' : 'View image')}>{body}</button>
    ) : <div key={`${image.src || image.uploadId}-${index}`} className={tileClass} style={tileStyle} draggable={draggable || undefined}>{body}</div>
  }

  const uploadPreviewUrl = media.kind === 'upload' ? uploadPreview(media.uploadId) : undefined
  // 没有本地预览的占位卡（只有编辑器里会出现）：留虚线框表示「这里将来是一张图」
  const placeholder = media.kind === 'upload' && showUploadStatus && !uploadPreviewUrl
  /**
   * 缩放手柄的渲染条件：编辑器传了 onWidthChange、且这张卡确实渲染出一张图。
   * 占位卡（虚线框）、拿不到图的中性缺图位都不给手柄 —— 没有可缩的对象。
   */
  const resizeLayer = onWidthChange && media.kind === 'image' && src
    ? <MediaResizeLayer onWidthChange={onWidthChange} language={language} />
    : null

  return (
    /* 摊开的那排选择排在 <figure> **之前**：它浮在卡片上方，DOM 顺序跟着视觉走。
       收起时（默认）这里就是空，只读渲染下输出与从前一字不差。 */
    <>{alignPanel}<figure className={`milkdown-media milkdown-media-${media.kind}${placeholder ? ' milkdown-media-placeholder' : ''}`} data-media-kind={media.kind} data-media-align={mediaAlign(media)} data-media-width={media.width ? '' : undefined} data-provider={embed?.provider} style={media.width ? { width: media.width } : undefined}>
      {isPlayer && <div className="milkdown-media-header">
        <span className="milkdown-media-icon"><Icon size={18} /></span>
        <div className="milkdown-media-info"><strong>{title}</strong>{source && <small>{source}</small>}</div>
        <div className="milkdown-media-controls">
          {src && <a className="milkdown-media-open" href={src} target="_blank" rel="noopener noreferrer" aria-label={openLabel} title={openLabel}><ExternalLink size={15} /></a>}
          {actions}
        </div>
      </div>}
      {!isPlayer && (media.kind === 'image' || media.kind === 'gallery' || media.kind === 'upload') && (alignControl || actions) && <div className="milkdown-media-overlay">{alignControl}{actions}</div>}
      {media.kind === 'image' && renderImage({ src: media.src ?? '', alt: media.title, photoId: media.photoId })}
      {media.kind === 'gallery' && <div className="milkdown-media-grid" style={galleryGridStyle(media.images?.length ?? 0, media.layout)}>{media.images?.map((image, index) => renderImage(image, index, draggableTiles))}</div>}
      {embed ? (
        <iframe className={`milkdown-media-frame${embed.height ? ' milkdown-media-frame-fixed' : ''}`} src={embed.src} title={title} height={embed.height} style={embed.height ? { height: embed.height } : undefined} loading="lazy" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen sandbox="allow-scripts allow-same-origin allow-presentation" referrerPolicy="strict-origin-when-cross-origin" />
      ) : isPlayer && (src && failedSrc !== src ? (
        media.kind === 'audio'
          ? <div className="milkdown-media-audio-player"><audio src={src} controls preload="metadata" aria-label={title} onError={() => setFailedSrc(src)} /></div>
          : <video className="milkdown-media-video-player" src={src} controls playsInline preload="metadata" aria-label={title} onError={() => setFailedSrc(src)} />
      ) : <div className="milkdown-media-empty"><Icon size={24} /><span>{zh ? '暂时无法播放此媒体' : 'This media cannot be played here'}</span>{src && <a href={src} target="_blank" rel="noopener noreferrer">{openLabel}<ExternalLink size={13} /></a>}</div>)}
      {/* 富链接卡：左文字右封面。整块是一个 <a>，操作按钮与它同级 —— 按钮在 <a> 里面
          点击会连带跳转，放在外面就没有这个麻烦。 */}
      {!isPlayer && media.kind === 'link' && <div className="milkdown-media-link">
        <a className="milkdown-media-link-anchor" href={src || undefined} target="_blank" rel="noopener noreferrer">
          <span className="milkdown-media-link-body">
            <span className="milkdown-media-link-site">
              {linkIcon
                ? <img className="milkdown-media-link-favicon" src={linkIcon} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} />
                : <Link size={13} aria-hidden="true" />}
              <span className="milkdown-media-link-host">{linkSite}</span>
            </span>
            <strong className="milkdown-media-link-title">{linkTitle}</strong>
            {linkDescription && <span className="milkdown-media-link-desc">{linkDescription}</span>}
            <span className="milkdown-media-link-url">{src ? urlLabel(src) : (zh ? '链接不可用' : 'Link unavailable')}</span>
          </span>
          {linkCover && <span className="milkdown-media-link-cover"><img src={linkCover} alt="" loading="lazy" /></span>}
          {src && <ExternalLink className="milkdown-media-link-arrow" size={15} />}
        </a>
        {actions}
      </div>}
      {!isPlayer && media.kind === 'file' && <div className="milkdown-media-resource">
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
           状态只用图上的左上角 tag 表达（绝对定位，不占布局高度）；
           预览/发布侧（showUploadStatus=false）连浮层都不渲染，与上传完成后的效果完全一致。 */
        <div className="milkdown-media-photo milkdown-media-photo-upload">
          <img src={uploadPreviewUrl} alt={media.title} loading="lazy" draggable={false} />
          {showUploadStatus && <span className="milkdown-media-upload-tag" role="status">{uploadStatusLabel(media.status, zh)}</span>}
        </div>
      ) : showUploadStatus ? (
        /* 没有本地预览就没有可压浮层的图，只能留文字占位（此处状态用文字表达，不再叠 tag） */
        <div className="milkdown-media-upload" role="status">
          {media.status === 'uploading'
            ? <LoaderCircle size={24} className="milkdown-spin" />
            /* 待传（含上传失败待重传）：还没开始传，用静态图标而不是转圈 —— 转圈会让用户以为正在跑 */
            : <ImagePlus size={24} />}
          <strong>{media.title}</strong>
          <span>{media.status === 'uploading'
            ? (zh ? '正在上传…' : 'Uploading…')
            : (zh ? '待上传' : 'Pending')}</span>
        </div>
      ) : (
        /* 预览/发布侧：连本地预览都拿不到（会话已过期等），也不能暴露上传状态，只留中性缺图位 */
        <div className="milkdown-media-photo milkdown-media-photo-upload">
          <span className="milkdown-media-empty"><ImageOff size={24} />{zh ? '图片暂不可用' : 'Image unavailable'}</span>
        </div>
      ))}
      {media.caption && <figcaption>{media.caption}</figcaption>}
      {/* 角柄垫在图注之后：绝对定位，不参与布局；只有编辑器传了 onWidthChange 才有这四颗 */}
      {resizeLayer}
    </figure></>
  )
}
