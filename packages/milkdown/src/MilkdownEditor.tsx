'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Crepe } from '@milkdown/crepe'
import type { AIProvider } from '@milkdown/crepe/feature/ai'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { EditorStatus, editorViewCtx, editorViewOptionsCtx, serializerCtx } from '@milkdown/kit/core'
import { diffPluginKey } from '@milkdown/kit/plugin/diff'
import { streamingPluginKey } from '@milkdown/kit/plugin/streaming'
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state'
import type { SelectionBookmark } from '@milkdown/kit/prose/state'
import { $prose, getMarkdown, insert, replaceAll } from '@milkdown/kit/utils'
import { createFeatures } from './features'
import { attachFontSizeEdit } from './font-size-edit'
import { createMediaView, mediaDirective, mediaSchema } from './media-plugin'
import { textStyleSchema } from './text-style-plugin'
import { blockStyleSchema } from './block-style-plugin'
import { MediaDialog } from './MediaDialog'
import { buildMediaMarkdown, normalizeMedia, safeMediaUrl } from './media'
import { parseMediaEmbed } from './media-embed'
import type { MediaCardData, MediaUrlResolver } from './media'
import './style.css'

export interface MilkdownEditorHandle {
  getValue: () => string
  insertMarkdown: (markdown: string) => void
  insertMedia: (media: MediaCardData) => void
  focus: () => void
  insertImageUploadPlaceholder: (image: { uploadId: string; fileName: string; imageWidth?: number; imageHeight?: number }) => void
  resolveImageUploadPlaceholder: (uploadId: string, image: { src: string; alt?: string; photoId?: string }) => boolean
  failImageUploadPlaceholder: (uploadId: string) => void
}

export interface MilkdownEditorProps {
  value: string
  onChange: (markdown: string) => void
  contentVersion?: string | number
  placeholder?: string
  className?: string
  language?: 'zh' | 'en'
  readOnly?: boolean
  onPasteFiles?: (files: File[]) => void
  onUpload?: (file: File) => Promise<string>
  resolveMediaUrl?: MediaUrlResolver
  toolbarAction?: { label: string; onClick: () => void }
  statusBar?: { materialCount?: number; trailing?: ReactNode }
  aiProvider?: AIProvider
  onBusyChange?: (busy: boolean) => void
  onError?: (error: Error) => void
}

interface MediaRequest {
  initial: MediaCardData
  bookmark: SelectionBookmark
  getPos?: () => number | undefined
}

const EditorInstance = forwardRef<MilkdownEditorHandle, MilkdownEditorProps>(function EditorInstance(props, ref) {
  const options = useRef(props)
  const alive = useRef(true)
  const suppressed = useRef(false)
  const busy = useRef(false)
  const latestValue = useRef(props.value)
  const refreshers = useRef(new Set<() => void>())
  const [error, setError] = useState('')
  const [characters, setCharacters] = useState(0)
  const [mediaRequest, setMediaRequest] = useState<MediaRequest | null>(null)
  const hasAI = Boolean(props.aiProvider)

  useLayoutEffect(() => { options.current = props })
  useLayoutEffect(() => {
    alive.current = true
    return () => { alive.current = false; options.current.onBusyChange?.(false) }
  }, [])

  const reportError = useCallback((value: unknown) => {
    if (!alive.current) return
    const cause = value instanceof Error ? value : new Error(String(value))
    setError(cause.message)
    options.current.onError?.(cause)
  }, [])

  const { loading, get } = useEditor((root) => {
    const current = options.current
    const crepe = new Crepe({
      root,
      defaultValue: current.value,
      features: { [Crepe.Feature.TopBar]: true, [Crepe.Feature.AI]: Boolean(current.aiProvider), [Crepe.Feature.Placeholder]: Boolean(current.placeholder) },
      featureConfigs: createFeatures({

        language: current.language ?? 'zh',
        placeholder: current.placeholder,
        upload: async (file) => {
          try {
            if (!options.current.onUpload) throw new Error(current.language === 'en' ? 'Image upload is unavailable. Insert an image URL instead.' : '当前无法上传图片，请插入图片链接。')
            const src = safeMediaUrl(await options.current.onUpload(file))
            if (!src) throw new Error(current.language === 'en' ? 'The upload did not return a persistent image URL.' : '上传未返回可保存的图片地址。')
            return src
          } catch (cause) { reportError(cause); throw cause }
        },
        resolveUrl: (url) => safeMediaUrl(options.current.resolveMediaUrl?.(url) ?? url),
        openMedia: (kind) => {
          if (alive.current) setMediaRequest({ initial: { kind }, bookmark: crepe.editor.ctx.get(editorViewCtx).state.selection.getBookmark() })
        },
        toolbarAction: current.toolbarAction ? { label: current.toolbarAction.label, onClick: () => options.current.toolbarAction?.onClick() } : undefined,
        aiProvider: current.aiProvider ? (context, signal) => options.current.aiProvider!(context, signal) : undefined,
        onError: reportError,
      }),
    })
    attachFontSizeEdit(root, () => crepe.editor.ctx)

    // A synchronous host notification avoids losing the final keystroke when
    // saving/switching documents before the official listener's debounce fires.
    const host = $prose((ctx) => new Plugin({
      key: new PluginKey('mo-milkdown-host'),
      view: (view) => {
        setCharacters(view.state.doc.textContent.length)
        return {
          update: (nextView, previous) => {
            if (!alive.current) return
            const nextBusy = Boolean(streamingPluginKey.getState(nextView.state)?.active || diffPluginKey.getState(nextView.state)?.active)
            const wasBusy = busy.current
            if (nextBusy !== wasBusy) { busy.current = nextBusy; options.current.onBusyChange?.(nextBusy) }
            if (!nextBusy && !suppressed.current && (wasBusy || !nextView.state.doc.eq(previous.doc))) {
              const markdown = ctx.get(serializerCtx)(nextView.state.doc)
              setCharacters(nextView.state.doc.textContent.length)
              if (markdown !== latestValue.current) {
                latestValue.current = markdown
                options.current.onChange(markdown)
              }
            }
          },
        }
      },
    }))

    crepe.editor
      .use(mediaDirective)
      .use(mediaSchema)
      .use(textStyleSchema)
      .use(blockStyleSchema)
      .use(createMediaView(() => ({
        language: options.current.language,
        resolveUrl: options.current.resolveMediaUrl,
        onEdit: (media, getPos) => {
          if (alive.current) setMediaRequest({ initial: media, getPos, bookmark: crepe.editor.ctx.get(editorViewCtx).state.selection.getBookmark() })
        },
      }), refreshers.current))
      .use(host)
      .config((ctx) => {
        ctx.update(editorViewOptionsCtx, (previous) => ({
          ...previous,
          attributes: { role: 'textbox', 'aria-label': current.language === 'en' ? 'Document content' : '文档正文', 'aria-multiline': 'true' },
          handlePaste: (view, event) => {
            const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'))
            if (files.length && options.current.onPasteFiles) {
              event.preventDefault()
              options.current.onPasteFiles(files)
              return true
            }
            if (files.length || options.current.readOnly || busy.current || view.state.selection.$from.parent.type.spec.code) return false
            const clipboard = event.clipboardData
            const media = parseMediaEmbed(clipboard?.getData('text/plain') ?? '') || parseMediaEmbed(clipboard?.getData('text/html') ?? '')
            if (!media) return false
            event.preventDefault()
            view.dispatch(view.state.tr.replaceSelectionWith(mediaSchema.type(crepe.editor.ctx).create({ media: normalizeMedia(media) })).scrollIntoView())
            return true
          },
          handleDrop: (view, event) => {
            const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => file.type.startsWith('image/'))
            if (!files.length || !options.current.onPasteFiles) return false
            event.preventDefault()
            const position = view.posAtCoords({ left: event.clientX, top: event.clientY })
            if (position) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(position.pos))))
            options.current.onPasteFiles(files)
            return true
          },
        }))
      })
    crepe.setReadonly(Boolean(current.readOnly))
    return crepe
  }, [hasAI])

  useEffect(() => {
    if (loading || props.value === latestValue.current) return
    const editor = get()
    if (editor?.status !== EditorStatus.Created || busy.current) return
    suppressed.current = true
    try {
      editor.action(replaceAll(props.value))
      latestValue.current = props.value
      setCharacters(editor.ctx.get(editorViewCtx).state.doc.textContent.length)
    } catch (cause) { reportError(cause) }
    finally { suppressed.current = false }
  }, [get, loading, props.value, reportError])

  useEffect(() => {
    const editor = get()
    if (loading || editor?.status !== EditorStatus.Created) return
    editor.ctx.get(editorViewCtx).setProps({ editable: () => !options.current.readOnly })
    refreshers.current.forEach((render) => render())
  }, [get, loading, props.readOnly, props.resolveMediaUrl, props.language])

  const insertMarkdown = useCallback((markdown: string) => {
    const editor = get()
    if (editor?.status !== EditorStatus.Created || busy.current || options.current.readOnly) return
    editor.action(insert(markdown))
    editor.ctx.get(editorViewCtx).focus()
  }, [get])

  const updateUpload = useCallback((uploadId: string, replacement?: MediaCardData) => {
    const editor = get()
    if (editor?.status !== EditorStatus.Created) return false
    const view = editor.ctx.get(editorViewCtx)
    let found = false
    const transaction = view.state.tr
    view.state.doc.descendants((node, pos) => {
      const media = node.type.name === 'media_card' ? normalizeMedia(node.attrs.media) : null
      if (media?.kind === 'upload' && media.uploadId === uploadId) {
        found = true
        transaction.setNodeMarkup(pos, undefined, { media: replacement ?? { ...media, status: 'failed' } })
      }
    })
    if (found) view.dispatch(transaction)
    return found
  }, [get])

  useImperativeHandle(ref, () => ({
    getValue: () => {
      const editor = get()
      return editor?.status === EditorStatus.Created && !busy.current ? editor.action(getMarkdown()) : latestValue.current
    },
    insertMarkdown,
    insertMedia: (media) => insertMarkdown(buildMediaMarkdown(media)),
    focus: () => { const editor = get(); if (editor?.status === EditorStatus.Created) editor.ctx.get(editorViewCtx).focus() },
    insertImageUploadPlaceholder: ({ uploadId, fileName }) => insertMarkdown(buildMediaMarkdown({ kind: 'upload', uploadId, title: fileName, status: 'uploading' })),
    resolveImageUploadPlaceholder: (uploadId, image) => updateUpload(uploadId, { kind: 'image', src: image.src, title: image.alt, photoId: image.photoId }),
    failImageUploadPlaceholder: (uploadId) => { updateUpload(uploadId) },
  }), [get, insertMarkdown, updateUpload])

  const closeMedia = () => {
    setMediaRequest(null)
    const editor = get()
    if (editor?.status === EditorStatus.Created) editor.ctx.get(editorViewCtx).focus()
  }
  const zh = props.language !== 'en'

  return <div className={`milkdown-editor ${props.className ?? ''}`} data-editor="milkdown" aria-busy={loading}>
    {error && <div className="milkdown-editor-error" role="alert">{error}<button type="button" aria-label={zh ? '关闭错误提示' : 'Dismiss error'} onClick={() => setError('')}>×</button></div>}
    <div className="milkdown-editor-scroll"><Milkdown /></div>
    <div className="milkdown-editor-status"><span>{loading ? (zh ? '正在加载编辑器…' : 'Loading editor…') : `${characters} ${zh ? '字' : 'characters'}`}{props.statusBar?.materialCount !== undefined && ` · ${props.statusBar.materialCount} ${zh ? '张素材' : 'photos'}`}</span><span>{props.statusBar?.trailing}</span></div>
    {mediaRequest && <MediaDialog initial={mediaRequest.initial} language={props.language ?? 'zh'} onClose={closeMedia} onSubmit={(media) => {
      const editor = get()
      if (editor?.status !== EditorStatus.Created) return
      const view = editor.ctx.get(editorViewCtx)
      if (mediaRequest.getPos) {
        const pos = mediaRequest.getPos()
        if (pos !== undefined && view.state.doc.nodeAt(pos)?.type.name === 'media_card') view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { media }))
      } else {
        try { view.dispatch(view.state.tr.setSelection(mediaRequest.bookmark.resolve(view.state.doc))) } catch { /* Keep the current valid selection if the document changed. */ }
        insertMarkdown(buildMediaMarkdown(media))
      }
      closeMedia()
    }} />}
  </div>
})

/** The official React integration owns the Crepe instance and its lifecycle. */
export const MilkdownEditor = forwardRef<MilkdownEditorHandle, MilkdownEditorProps>(function MilkdownEditor(props, ref) {
  return <MilkdownProvider key={props.contentVersion ?? 'document'}><EditorInstance {...props} ref={ref} /></MilkdownProvider>
})

export type MilkdownAiProvider = AIProvider
