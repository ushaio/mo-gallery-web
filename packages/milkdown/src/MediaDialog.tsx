'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, X } from 'lucide-react'
import { MEDIA_KINDS, normalizeMedia, safeMediaUrl } from './media'
import { mediaProviderLabel, parseMediaEmbed } from './media-embed'
import type { MediaCardData, MediaKind } from './media'

export const mediaLabels = {
  zh: { image: '图片卡片', gallery: '图片画廊', video: '视频卡片', audio: '音频卡片', link: '链接卡片', file: '文件卡片' },
  en: { image: 'Image card', gallery: 'Image gallery', video: 'Video card', audio: 'Audio card', link: 'Link card', file: 'File card' },
}

interface MediaDialogProps {
  initial: MediaCardData
  language: 'zh' | 'en'
  onSubmit: (media: MediaCardData) => void
  onClose: () => void
}

export function MediaDialog({ initial, language, onSubmit, onClose }: MediaDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const initialMedia = normalizeMedia(initial)
  const [kind, setKind] = useState<MediaKind>(initialMedia.kind === 'upload' ? 'image' : initialMedia.kind)
  const [url, setUrl] = useState(initialMedia.src ?? '')
  const [imageUrls, setImageUrls] = useState(initial.images?.map((image) => image.src).join('\n') ?? '')
  const [title, setTitle] = useState(initialMedia.title ?? '')
  const [caption, setCaption] = useState(initial.caption ?? '')
  const [error, setError] = useState('')
  const zh = language === 'zh'
  const parsed = kind === 'gallery' || kind === 'file' ? null : parseMediaEmbed(url)

  const updateUrl = (value: string) => {
    setUrl(value)
    setError('')
    const detected = kind === 'file' ? null : parseMediaEmbed(value)
    if (detected) setKind(detected.kind)
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
        const urls = imageUrls.split('\n').map((entry) => entry.trim()).filter(Boolean)
        const media = normalizeMedia({
          kind, title: title.trim(), caption, width: initialMedia.width,
          ...(kind === 'gallery' ? {
            images: urls.map((src) => ({ ...initial.images?.find((image) => image.src === src), src })),
          } : {
            src: url.trim(),
            ...(url.trim() === initialMedia.src ? { photoId: initialMedia.photoId, embed: initialMedia.embed, thumbnail: initialMedia.thumbnail } : {}),
          }),
        })
        if (kind === 'gallery' ? !urls.length || urls.some((entry) => !safeMediaUrl(entry)) : !media.src) {
          setError(zh ? '请输入有效的媒体链接、站内路径或网站提供的嵌入代码。' : 'Enter a valid media URL, site-relative path or embed code.')
          return
        }
        onSubmit(media)
      }}>
        <header><h2 id="milkdown-media-dialog-title">{zh ? '插入 / 编辑媒体' : 'Insert / edit media'}</h2><button type="button" aria-label={zh ? '关闭' : 'Close'} onClick={onClose}><X size={18} /></button></header>
        <label>{zh ? '类型' : 'Type'}<select value={kind} onChange={(event) => { setKind(event.target.value as MediaKind); setError('') }}>{MEDIA_KINDS.map((key) => <option key={key} value={key}>{mediaLabels[language][key]}</option>)}</select></label>
        {kind === 'gallery' ? <label>{zh ? '图片链接（每行一张）' : 'Image URLs (one per line)'}<textarea required rows={5} value={imageUrls} onChange={(event) => setImageUrls(event.target.value)} placeholder="https://…" /></label> : <label>{zh ? '媒体链接 / 嵌入代码' : 'Media URL / embed code'}<textarea autoFocus required rows={3} value={url} onChange={(event) => updateUrl(event.target.value)} placeholder="https://…" spellCheck={false} /></label>}
        {kind !== 'gallery' && kind !== 'file' && <p className="milkdown-dialog-hint">{zh ? '支持网易云音乐、Spotify、YouTube、Bilibili、Vimeo，以及网站提供的嵌入代码。' : 'Supports NetEase Music, Spotify, YouTube, Bilibili, Vimeo and website embed codes.'}</p>}
        {parsed && <p className="milkdown-media-detected" role="status"><CheckCircle2 size={14} />{zh ? '已识别' : 'Detected'} · {mediaProviderLabel(parsed.embed.provider, language)}</p>}
        <label>{zh ? '标题 / 替代文本' : 'Title / alternative text'}<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>{zh ? '说明' : 'Caption'}<textarea rows={2} value={caption} onChange={(event) => setCaption(event.target.value)} /></label>
        {error && <p className="milkdown-editor-error" role="alert">{error}</p>}
        <footer><button type="button" onClick={onClose}>{zh ? '取消' : 'Cancel'}</button><button type="submit" className="milkdown-dialog-submit">{zh ? '应用' : 'Apply'}</button></footer>
      </form>
    </dialog>,
    document.body,
  )
}
