'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, X } from 'lucide-react'
import { GALLERY_LAYOUTS, MEDIA_KINDS, mediaAlign, normalizeGalleryLayout, normalizeMedia, safeMediaUrl } from './media'
import { galleryGridShape, galleryGridStyle, galleryTileStyle } from './gallery-layout'
import { MediaCard } from './MediaCard'
import type { MediaDialogSelectProps, MediaDialogSelectRenderer } from './media-dialog-select'
import { mediaProviderLabel, parseMediaEmbed } from './media-embed'
import type { GalleryLayout, MediaCardData, MediaImage, MediaKind, MediaLinkPreviewResolver, MediaUrlResolver } from './media'

export const mediaLabels = {
  zh: { image: '图片卡片', gallery: '图片画廊', video: '视频卡片', audio: '音频卡片', link: '链接卡片', file: '文件卡片' },
  en: { image: 'Image card', gallery: 'Image gallery', video: 'Video card', audio: 'Audio card', link: 'Link card', file: 'File card' },
}

/** 「拼图样式」线框缩略图下面的小字标签。 */
const layoutLabels = {
  zh: { grid: '自动网格', stack: '上下结构', split: '左右结构', 'hero-top': '上大下小', 'hero-left': '左大右小', quad: '四宫格' },
  en: { grid: 'Auto grid', stack: 'Stacked', split: 'Side by side', 'hero-top': 'Hero on top', 'hero-left': 'Hero on left', quad: 'Four tiles' },
} as const

/**
 * 每种样式拿几张格子做缩略图——取能一眼区分六种样式的张数：自动网格与上大下小用 5 张
 * （3 列、2 列各出两行），左右结构与四宫格靠张数分开（2×3 对 2×2），上下结构用 3 张拉出
 * 竖列，左大右小用 4 张让主图占满左列。
 */
const layoutSamples: Record<GalleryLayout, number> = { grid: 5, stack: 3, split: 6, 'hero-top': 5, 'hero-left': 4, quad: 4 }

/** 线框缩略图的格子边长（px）：列 = 该值，行 = 该值的 3/4，与卡片 4:3 的格子一致。 */
const LAYOUT_FRAME_CELL = 8

interface MediaDialogProps {
  initial: MediaCardData
  language: 'zh' | 'en'
  resolveUploadPreview?: (uploadId: string) => string | undefined
  resolveMediaUrl?: MediaUrlResolver
  /**
   * 按 URL 抓取网页信息。传了之后，链接类型会在**填完地址稍等片刻**自动填充
   * 标题 / 摘要 / 站点名 / 封面 / 图标，也可以点「重新获取」手动再抓一次。
   * 抓不到不报错：保留用户已填内容，只在按钮旁留一句「未能获取网页信息」。
   */
  resolveLinkPreview?: MediaLinkPreviewResolver
  renderSelect?: MediaDialogSelectRenderer
  onSubmit: (media: MediaCardData) => void
  onClose: () => void
}

export function MediaDialog({ initial, language, resolveUploadPreview, resolveMediaUrl, resolveLinkPreview, renderSelect, onSubmit, onClose }: MediaDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const initialMedia = normalizeMedia(initial)
  const [kind, setKind] = useState<MediaKind>(initialMedia.kind === 'upload' ? 'image' : initialMedia.kind)
  const [url, setUrl] = useState(initialMedia.src ?? '')
  const [galleryImages, setGalleryImages] = useState<MediaImage[]>(initialMedia.images ?? [])
  const [galleryLayout, setGalleryLayout] = useState(normalizeGalleryLayout(initialMedia.layout))
  const [galleryInput, setGalleryInput] = useState('')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [cropIndex, setCropIndex] = useState<number | null>(null)
  const [title, setTitle] = useState(initialMedia.title ?? '')
  const [caption, setCaption] = useState(initialMedia.caption ?? '')
  // 链接卡的网页元信息。与 url 一起走状态：抓取结果要能先落在这里供用户过目，
  // 而不是一抓到就直接写进文档（抓错了还能改，删掉也只需清空这一栏）。
  const [siteName, setSiteName] = useState(initialMedia.siteName ?? '')
  const [description, setDescription] = useState(initialMedia.description ?? '')
  const [thumbnail, setThumbnail] = useState(initialMedia.thumbnail ?? '')
  const [icon, setIcon] = useState(initialMedia.icon ?? '')
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')
  const zh = language === 'zh'
  const parsed = kind === 'gallery' || kind === 'file' ? null : parseMediaEmbed(url)
  const select = (props: MediaDialogSelectProps) => renderSelect ? renderSelect(props) : <select value={props.value} aria-label={props.ariaLabel} onChange={(event) => props.onChange(event.target.value)}>{props.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>

  // 抓取是异步的，回调里读 state 会读到派发那次渲染的旧值：用 ref 取「此刻」的地址与标题，
  // 才能判断结果回来时用户是不是已经换过链接、是不是还该覆盖标题。
  const urlRef = useRef(url)
  urlRef.current = url
  const titleRef = useRef(title)
  titleRef.current = title
  const autoTitleRef = useRef(initialMedia.title ?? '')
  const requestedUrlRef = useRef('')

  const fetchPreview = async (target: string) => {
    if (!resolveLinkPreview) return
    setPreviewState('loading')
    const result = await resolveLinkPreview(target)
    if (urlRef.current.trim() !== target) return
    if (!result) {
      setPreviewState('error')
      return
    }
    setPreviewState('idle')
    if (result.siteName) setSiteName(result.siteName)
    if (result.description) setDescription(result.description)
    if (result.image) setThumbnail(result.image)
    if (result.icon) setIcon(result.icon)
    // 标题只在「用户没填」或「填的还是上一次自动抓到的」时覆盖，手写过的标题一律不动。
    const next = result.title?.trim() ?? ''
    if (next && (!titleRef.current.trim() || titleRef.current === autoTitleRef.current)) {
      autoTitleRef.current = next
      setTitle(next)
    }
  }

  /**
   * 地址填完停顿一下就自动抓一次。700ms 是为了不在用户逐字敲 URL 时把每个前缀都发出去——
   * 每个前缀都是一次跨站请求，而且几乎必然 404。同一地址只抓一次（requestedUrlRef），
   * 想重抓用「重新获取」按钮。
   */
  useEffect(() => {
    if (!resolveLinkPreview || kind !== 'link') return
    const target = url.trim()
    if (!/^https?:\/\//i.test(target) || target === requestedUrlRef.current) return
    const timer = setTimeout(() => { requestedUrlRef.current = target; void fetchPreview(target) }, 700)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchPreview 只读 ref 与 setter，不需要参与依赖
  }, [url, kind, resolveLinkPreview])

  /**
   * 表单当前值 → 一张卡片数据。**预览与提交共用这一份**：右侧预览要显示的，就是
   * 「按下应用之后落进文档的那张卡」，两处各拼一遍迟早会漂移。
   */
  const buildMedia = () => normalizeMedia({
    kind, title: title.trim(), caption,
    // 宽度与对齐都是对话框里没有输入框、但要原样带过去的属性：换过链接（photoId /
    // embed / thumbnail 会跟着作废）不该顺手把排版也重置掉，所以在两种分支外统一给。
    // 对齐的入口在卡片悬浮工具栏上（见 MediaCard），这里只负责别把它弄丢。
    width: initialMedia.width,
    ...(kind === 'image' ? { align: mediaAlign(initialMedia) } : {}),
    ...(kind === 'gallery' ? {
      images: galleryImages,
      layout: galleryLayout,
    } : {
      src: url.trim(),
      // 换过链接就说明这是另一张网页，上一页的 photoId / embed 当然作废；
      // 而 siteName / description / icon / 封面是跟着新地址重新抓的，直接取表单当前值。
      ...(url.trim() === initialMedia.src ? { photoId: initialMedia.photoId, embed: initialMedia.embed } : {}),
      ...(thumbnail ? { thumbnail } : {}),
      ...(kind === 'link' ? {
        ...(siteName.trim() ? { siteName: siteName.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(icon ? { icon } : {}),
      } : {}),
    }),
  })

  /**
   * 预览专用数据，只在一处与提交不同：打开的是素材库里那张**还没上传**的占位卡
   * （uploadId 在、src 空）时，只有走 upload 分支才能让 MediaCard 现取本地预览图；
   * 用户一旦填上链接就切回常规分支。提交那条路仍按 image 处理，与从前一致。
   */
  const previewMedia = kind !== 'gallery' && initialMedia.kind === 'upload' && !url.trim()
    ? normalizeMedia({ kind: 'upload', uploadId: initialMedia.uploadId, status: initialMedia.status, title: title.trim() })
    : buildMedia()

  const updateUrl = (value: string) => {
    setUrl(value)
    setError('')
    // 地址一改，先前抓到的站点名 / 摘要 / 封面就属于另一张网页了，先清空再由自动抓取重填；
    // 不清会让「改了链接但卡片还在说旧网页的事」这条最难解释的路径留在界面上。
    if (value.trim() !== initialMedia.src) {
      setSiteName('')
      setDescription('')
      setThumbnail('')
      setIcon('')
      setPreviewState('idle')
      requestedUrlRef.current = ''
    }
    const detected = kind === 'file' ? null : parseMediaEmbed(value)
    if (detected) setKind(detected.kind)
  }

  const addGalleryImages = () => {
    const candidates = galleryInput.split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean)
    if (!candidates.length) return
    const invalid = candidates.find((entry) => !safeMediaUrl(entry))
    if (invalid) {
      setError(zh ? '请输入有效的图片链接或站内路径。' : 'Enter a valid image URL or site-relative path.')
      return
    }
    setGalleryImages((images) => [...images, ...candidates.map((src) => ({ src }))])
    setGalleryInput('')
    setError('')
  }

  const reorderGalleryImage = (from: number, to: number) => {
    if (!Number.isInteger(from) || from === to || from < 0 || to < 0 || from >= galleryImages.length || to >= galleryImages.length) return
    setGalleryImages((images) => {
      const next = images.slice()
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
    setCropIndex((selected) => selected === from ? to : selected !== null && from < selected && selected <= to ? selected - 1 : selected !== null && to <= selected && selected < from ? selected + 1 : selected)
  }

  const updateCrop = (index: number, patch: Partial<NonNullable<MediaImage['crop']>>) => {
    setGalleryImages((images) => images.map((image, imageIndex) => imageIndex !== index ? image : {
      ...image,
      crop: { x: 50, y: 50, scale: 1, ...image.crop, ...patch },
    }))
  }

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  return createPortal(
    <dialog ref={dialogRef} className="milkdown-media-dialog" aria-labelledby="milkdown-media-dialog-title" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form onSubmit={(event) => {
        event.preventDefault()
        const media = buildMedia()
        const galleryValid = galleryImages.length > 0 && galleryImages.every((image) =>
          (image.uploadId && !image.src) || safeMediaUrl(image.src),
        )
        if (kind === 'gallery' ? !galleryValid : !media.src) {
          setError(zh ? '请输入有效的媒体链接、站内路径或网站提供的嵌入代码。' : 'Enter a valid media URL, site-relative path or embed code.')
          return
        }
        onSubmit(media)
      }}>
        <header><h2 id="milkdown-media-dialog-title">{zh ? '插入 / 编辑媒体' : 'Insert / edit media'}</h2><button type="button" aria-label={zh ? '关闭' : 'Close'} onClick={onClose}><X size={18} /></button></header>
        {/* 左参数 / 右预览：参数改动立刻在右侧兑现，不必先「应用」再回文档里看效果。
            两栏各自滚动，header / footer 钉在两头。 */}
        <div className="milkdown-media-dialog-main">
        <div className="milkdown-media-dialog-controls">
        <div className="milkdown-media-dialog-field"><span>{zh ? '类型' : 'Type'}</span><div className="milkdown-media-dialog-select">{select({ value: kind, onChange: (value) => { setKind(value as MediaKind); setError('') }, ariaLabel: zh ? '类型' : 'Type', options: MEDIA_KINDS.map((key) => ({ value: key, label: mediaLabels[language][key] })) })}</div></div>
        {kind === 'gallery' ? <>
          {/* 样式选择器不做下拉框：每种样式画成一张线框缩略图，格子摆法由 galleryGridShape
              现算（与正文卡片、右侧预览同一个几何来源），下面配一行小字标签。 */}
          <div className="milkdown-media-dialog-field">
            <span>{zh ? '拼图样式' : 'Collage layout'}</span>
            <div className="milkdown-gallery-layout-picker" role="radiogroup" aria-label={zh ? '拼图样式' : 'Collage layout'}>
              {GALLERY_LAYOUTS.map((layout) => {
                const sample = layoutSamples[layout]
                const { columns, rows } = galleryGridShape(sample, layout)
                const active = galleryLayout === layout
                return (
                  <button key={layout} type="button" role="radio" aria-checked={active} title={layoutLabels[language][layout]} className={`milkdown-gallery-layout-option${active ? ' is-active' : ''}`} onClick={() => setGalleryLayout(layout)}>
                    <span className="milkdown-gallery-layout-frame" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${columns}, ${LAYOUT_FRAME_CELL}px)`, gridTemplateRows: `repeat(${rows}, ${LAYOUT_FRAME_CELL * 0.75}px)` }}>
                      {Array.from({ length: sample }, (_, index) => <i key={index} style={galleryTileStyle(index, sample, layout)} />)}
                    </span>
                    <small>{layoutLabels[language][layout]}</small>
                  </button>
                )
              })}
            </div>
          </div>
          {cropIndex !== null && galleryImages[cropIndex] && <div className="milkdown-gallery-editor-crop" aria-label={zh ? '裁切调整' : 'Crop adjustment'}>
            <strong>{zh ? `调整第 ${cropIndex + 1} 张图片的显示范围` : `Adjust image ${cropIndex + 1} crop`}</strong>
            <label>{zh ? '水平位置' : 'Horizontal position'}<input type="range" min="0" max="100" value={galleryImages[cropIndex].crop?.x ?? 50} onChange={(event) => updateCrop(cropIndex, { x: Number(event.target.value) })} /></label>
            <label>{zh ? '垂直位置' : 'Vertical position'}<input type="range" min="0" max="100" value={galleryImages[cropIndex].crop?.y ?? 50} onChange={(event) => updateCrop(cropIndex, { y: Number(event.target.value) })} /></label>
            <label>{zh ? '缩放' : 'Zoom'}<input type="range" min="1" max="3" step="0.05" value={galleryImages[cropIndex].crop?.scale ?? 1} onChange={(event) => updateCrop(cropIndex, { scale: Number(event.target.value) })} /></label>
            <button type="button" onClick={() => updateCrop(cropIndex, { x: 50, y: 50, scale: 1 })}>{zh ? '重置裁切' : 'Reset crop'}</button>
            <button type="button" onClick={() => { setGalleryImages((images) => images.filter((_, index) => index !== cropIndex)); setCropIndex(null) }}>{zh ? '移除这张照片' : 'Remove this photo'}</button>
          </div>}
          <div className="milkdown-media-dialog-field">
            <span>{zh ? '添加图片' : 'Add images'}</span>
            <div className="milkdown-gallery-editor-add">
              <input value={galleryInput} onChange={(event) => setGalleryInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addGalleryImages() } }} placeholder={zh ? '粘贴图片链接，可一次添加多张' : 'Paste image URLs, one or many'} aria-label={zh ? '图片链接' : 'Image URL'} />
              <button type="button" onClick={addGalleryImages}>{zh ? '添加图片' : 'Add images'}</button>
            </div>
          </div>
        </> : <label>{zh ? '媒体链接 / 嵌入代码' : 'Media URL / embed code'}<textarea autoFocus required rows={3} value={url} onChange={(event) => updateUrl(event.target.value)} placeholder="https://…" spellCheck={false} /></label>}
        {kind !== 'gallery' && kind !== 'file' && <p className="milkdown-dialog-hint">{zh ? '支持网易云音乐、Spotify、YouTube、Bilibili、Vimeo，以及网站提供的嵌入代码。' : 'Supports NetEase Music, Spotify, YouTube, Bilibili, Vimeo and website embed codes.'}</p>}
        {parsed && <p className="milkdown-media-detected" role="status"><CheckCircle2 size={14} />{zh ? '已识别' : 'Detected'} · {mediaProviderLabel(parsed.embed.provider, language)}</p>}
        {kind === 'link' && resolveLinkPreview && <div className="milkdown-media-link-meta">
          <div className="milkdown-media-link-meta-head">
            <span>{zh ? '网页信息' : 'Page details'}</span>
            <button
              type="button"
              onClick={() => { const target = url.trim(); requestedUrlRef.current = target; void fetchPreview(target) }}
              disabled={!/^https?:\/\//i.test(url.trim()) || previewState === 'loading'}
            >
              {previewState === 'loading' ? (zh ? '获取中…' : 'Fetching…') : (zh ? '重新获取' : 'Refetch')}
            </button>
          </div>
          {previewState === 'error' && <p className="milkdown-dialog-hint">{zh ? '未能获取网页信息，卡片将只显示链接地址。' : 'Could not fetch page details — the card will show the bare link.'}</p>}
          {(thumbnail || icon || siteName) && <div className="milkdown-media-link-meta-preview">
            {thumbnail ? <img className="milkdown-media-link-meta-cover" src={thumbnail} alt="" /> : null}
            {icon ? <img className="milkdown-media-link-favicon" src={icon} alt="" /> : null}
            {siteName ? <span className="milkdown-media-link-meta-site">{siteName}</span> : null}
          </div>}
          {description && <p className="milkdown-dialog-hint">{description}</p>}
        </div>}
        <label>{zh ? '标题 / 替代文本' : 'Title / alternative text'}<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>{zh ? '说明' : 'Caption'}<textarea rows={2} value={caption} onChange={(event) => setCaption(event.target.value)} /></label>
        {error && <p className="milkdown-editor-error" role="alert">{error}</p>}
        </div>
        {/* 预览用的就是正文那套 MediaCard 与 content.css：四周只留 .milkdown-editor 内的
            编辑态外壳不参与（弹窗挂在 body 上），所以看到的就是读者看到的样子。 */}
        <section className="milkdown-media-dialog-preview" aria-label={zh ? '预览' : 'Preview'}>
          <div className="milkdown-media-dialog-preview-heading">
            <div>
              <strong>{zh ? '预览' : 'Preview'}</strong>
              <small>{kind === 'gallery'
                ? (zh ? '拖动排序，点击照片在左侧调整显示范围' : 'Drag to reorder; click a photo to adjust it on the left')
                : (zh ? '读者看到的样子' : 'How readers will see it')}</small>
            </div>
            {kind === 'gallery' && <span>{galleryImages.length} {zh ? '张' : 'photos'}</span>}
          </div>
          <div className="milkdown-media-dialog-preview-stage">
            {kind === 'gallery'
              ? (galleryImages.length
                /* 拼图预览仍是那块可拖可点的网格（拖动排序、点选调裁切），只是外面套上
                   卡片本体那一层，圆角与正文里的拼图卡完全一致。 */
                ? <div className="milkdown-media milkdown-media-gallery">
                  <div className="milkdown-gallery-editor-grid" style={galleryGridStyle(galleryImages.length, galleryLayout)}>
                    {galleryImages.map((image, index) => {
                      const src = !image.src && image.uploadId ? resolveUploadPreview?.(image.uploadId) ?? '' : safeMediaUrl(resolveMediaUrl?.(image.src, image.photoId) ?? image.src)
                      return <div
                        key={`${image.photoId ?? image.uploadId ?? image.src}-${index}`}
                        className={`milkdown-gallery-editor-tile${dragIndex === index ? ' is-dragging' : ''}${cropIndex === index ? ' is-selected' : ''}`}
                        style={galleryTileStyle(index, galleryImages.length, galleryLayout)}
                        tabIndex={0}
                        aria-label={zh ? `调整第 ${index + 1} 张图片` : `Adjust image ${index + 1}`}
                        onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setCropIndex(index) } }}
                        draggable
                        onClick={() => setCropIndex(index)}
                        onDragStart={(event) => { setDragIndex(index); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)) }}
                        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }}
                        onDrop={(event) => { event.preventDefault(); if (dragIndex !== null) reorderGalleryImage(dragIndex, index); setDragIndex(null) }}
                        onDragEnd={() => setDragIndex(null)}
                      >
                        {src ? <img src={src} alt={image.alt ?? ''} draggable={false} style={image.crop ? { objectPosition: `${image.crop.x}% ${image.crop.y}%`, transform: `scale(${image.crop.scale})` } : undefined} /> : <span className="milkdown-gallery-editor-placeholder">{zh ? '待上传图片' : 'Pending image'}</span>}
                      </div>
                    })}
                  </div>
                </div>
                : <div className="milkdown-gallery-editor-empty">{zh ? '还没有图片，用左侧「添加图片」放几张进来。' : 'No images yet — add some from the left.'}</div>)
              : (previewMedia.src || previewMedia.embed
                ? <MediaCard media={previewMedia} resolveUrl={resolveMediaUrl} resolveUploadPreview={resolveUploadPreview} showUploadStatus={false} language={language} />
                : <div className="milkdown-media-dialog-preview-empty">{zh ? '填上媒体链接后，这里会显示卡片预览。' : 'The card preview appears here once you add a media URL.'}</div>)}
          </div>
        </section>
        </div>
        <footer><button type="button" onClick={onClose}>{zh ? '取消' : 'Cancel'}</button><button type="submit" className="milkdown-dialog-submit">{zh ? '应用' : 'Apply'}</button></footer>
      </form>
    </dialog>,
    document.body,
  )
}
