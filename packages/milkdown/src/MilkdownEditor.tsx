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
import type { AiPolishOptions, AiPolishRequest } from './features'
import { PolishDialog } from './PolishDialog'
import { hasNonTextNodeInside, locateText, replaceDocumentWithMarkdown, replaceRangeWithMarkdown } from './text-edit'
import { attachFontSizeEdit } from './font-size-edit'
import { createMediaView, mediaDirective, mediaSchema } from './media-plugin'
import { createMediaMergePlugin, handleMediaCardDrop, handleMediaTileDrop } from './media-merge'
import { createTextStyleInheritancePlugin, textStyleSchema } from './text-style-plugin'
import { ColorPalette } from './color-palette'
import { blockStyleSchema } from './block-style-plugin'
import { MediaDialog } from './MediaDialog'
import { buildMediaMarkdown, normalizeMedia, safeMediaUrl } from './media'
import { parseMediaEmbed } from './media-embed'
import type { MediaCardData, MediaLinkPreviewResolver, MediaUrlResolver } from './media'
import type { MediaDialogSelectRenderer } from './media-dialog-select'
import './style.css'

export interface MilkdownEditorHandle {
  getValue: () => string
  insertMarkdown: (markdown: string) => void
  insertMedia: (media: MediaCardData) => void
  focus: () => void
  /**
   * 用一段文字定位、再把它换掉 —— 供外部 AI 工具（对话框里的 Agent）改稿用。
   *
   * 定位在点击那一刻的正文上现算，且要求**唯一命中**：找不到或有歧义都如实返回原因，
   * 不按近似位置硬改。命中后先弹浮窗对照差异，用户点「替换原文」才写进文档，
   * 整套是一次事务（Ctrl+Z 一步退回）。因此调用方拿到 `ok: true` 才算真的改过。
   */
  applyTextEdit: (edit: MilkdownTextEdit) => Promise<MilkdownTextEditResult>
  /**
   * 插入一张图片上传占位卡。
   * `status` 缺省为 uploading（粘贴/拖入时上传已经开始）；
   * 编辑器素材库把「还没开始上传」的待传项插进来时传 'pending'。
   */
  insertImageUploadPlaceholder: (image: { uploadId: string; fileName: string; imageWidth?: number; imageHeight?: number; status?: 'pending' | 'uploading' }) => void
  resolveImageUploadPlaceholder: (uploadId: string, image: { src: string; alt?: string; photoId?: string }) => boolean
  failImageUploadPlaceholder: (uploadId: string) => void
  /**
   * 重新渲染所有媒体卡（不修改文档）。
   * 宿主在待传项预览图变化时调用，让占位卡按 uploadId 重新取一次预览。
   */
  refreshUploadPreviews: () => void
}

/** 一次「按文字定位再替换」（或整篇替换）的请求；由外部 AI 工具发起。 */
export interface MilkdownTextEdit {
  /** 要被替换掉的原文：必须在正文里唯一命中（比较时忽略空白与常见 Markdown 记号）。`scope` 为 'document' 时忽略。 */
  find?: string
  /** 替换后的文字（Markdown）。 */
  replace: string
  /** 浮窗标题上的动作名，缺省「AI 修改」。 */
  label?: string
  /**
   * 替换范围。
   *
   * 缺省按 `find` 定位一段；`'document'` 是整篇替换 —— 「润色」这种不指定范围的请求
   * 本来就是全局语义，前后对照也该是整篇的（模型只能改它看得见的东西，一段一段猜反而更容易漏）。
   */
  scope?: 'document'
}

export type MilkdownTextEditResult = {
  /** 真的写进文档了才算 true；用户放弃、定位失败都是 false。 */
  ok: boolean
  /** 失败原因：直接交给模型，它据此修正下一次调用。 */
  reason?: string
  /** 是用户主动放弃，而不是出错。 */
  cancelled?: boolean
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
  renderMediaDialogSelect?: MediaDialogSelectRenderer
  /**
   * 按 uploadId 取占位卡的本地预览图（blob: / 本地资源库缩略图）。
   *
   * 只在渲染时调用，**结果不进文档**：这类 URL 都是会话级的，落盘后跨重启必然裂图。
   * 宿主应在待传项集合变化时通过 `refreshUploadPreviews()` 主动通知重渲染。
   */
  resolveUploadPreview?: (uploadId: string) => string | undefined
  /**
   * 按 URL 现取网页信息（标题 / 摘要 / 站点名 / 封面 / 图标）。
   *
   * 宿主注入后：插入链接时对话框会自动抓取并**写进文档**；已存过元信息的卡片不再请求，
   * 老卡片（只有一条 URL）则在渲染时补抓一次、只补显示不回写。不注入就完全保持
   * 从前的纯文本链接卡 —— 公开阅读页正是这样用的，读者打开文章不会替我们访问别人的站。
   */
  resolveLinkPreview?: MediaLinkPreviewResolver
  toolbarAction?: { label: string; onClick: () => void }
  statusBar?: { materialCount?: number; trailing?: ReactNode }
  aiProvider?: AIProvider
  /**
   * 选中文本悬浮工具栏上的「AI 润色」按钮。
   *
   * 只在宿主传了它时才出现（并且必须同时给 `aiProvider`，模型就是从那里要的）。
   * 指令可以在点击时才求值，宿主可据此现读系统设置里的提示词。
   */
  aiPolish?: AiPolishOptions
  onBusyChange?: (busy: boolean) => void
  onError?: (error: Error) => void
  /**
   * 是否在正文上方再画一条内联的报错横条，默认 `true`。
   *
   * 宿主已经用 `onError` 把报错弹成浮窗（桌面端即 toast）时传 `false`：同一条错误
   * 不必既浮在角落又压在正文上方，而且那条横条会把正在读的段落整个往下挤。
   */
  showInlineError?: boolean
}

interface MediaRequest {
  initial: MediaCardData
  bookmark: SelectionBookmark
  getPos?: () => number | undefined
}

/**
 * 一次「AI 润色」的现场：从点下按钮到用户在浮窗里下结论，这段时间的所有状态都在这里。
 *
 * 正文在确认前一个字都不动 —— 模型的输出只活在这个对象里，`acceptPolish` 才把它
 * 作为一次普通事务写进文档（因此可以整步撤销）。
 */
interface PolishSession {
  /** 点击瞬间的选区，确认后就在这个范围上替换。 */
  from: number
  to: number
  /** 发起时的文档尺寸：确认前若变了，这两个位置就不再可信。 */
  docSize: number
  /** 求值后的指令，重新生成时原样再用一次（外部 AI 工具改稿没有指令，空串）。 */
  instruction: string
  /** 浮窗标题用的按钮文案。 */
  label: string
  /**
   * 结果是不是模型流式生成的：只有它才谈得上「重新生成」。
   * 外部 AI 工具改稿的内容已经定稿，重试就是把同一段再算一遍，没有意义。
   */
  generated: boolean
  before: string
  after: string
  streaming: boolean
  controller: AbortController
  /** 整篇替换（「润色」这类全局请求）：确认时换掉整个正文，并且要核对媒体卡没被抄丢。 */
  scope?: 'document'
  /** 等待这个结论的人（外部 AI 工具）；工具栏润色没有。 */
  settle?: (result: MilkdownTextEditResult) => void
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
  const [colorRequest, setColorRequest] = useState<{ field: 'color' | 'background'; view: import('@milkdown/kit/prose/view').EditorView; anchor: { top: number; left: number; bottom: number; right: number } } | null>(null)
  const [mediaRequest, setMediaRequest] = useState<MediaRequest | null>(null)
  const [, refreshMediaDialog] = useState(0)
  const [polishSession, setPolishSession] = useState<PolishSession | null>(null)
  const polishAbort = useRef<AbortController | null>(null)
  /**
   * 工具栏上的按钮在 `useEditor` 的回调里创建，而润色流程要用到 `get()` 拿到的编辑器
   * 实例 —— 两者互相依赖，所以中间垫一层 ref：按钮只负责把请求丢进来，实现体在
   * useEditor 之后再挂上（见下面的 useLayoutEffect）。
   */
  const polishRunner = useRef<(request: AiPolishRequest) => void>(() => {})
  const hasAI = Boolean(props.aiProvider)
  const hasPolish = Boolean(props.aiPolish)
  /**
   * 润色指令每次点击才读一遍 `options.current`：宿主要么直接给字符串，要么给一个
   * 现读设置的回调，两种都在这里统一成「调用即取最新值」。
   */
  const readPolishInstruction = useCallback(() => {
    const instruction = options.current.aiPolish?.instruction
    return typeof instruction === 'function' ? instruction() : instruction ?? ''
  }, [])

  useLayoutEffect(() => { options.current = props })
  useLayoutEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      // 编辑器没了，还在路上的润色请求也要断掉，别让回调继续往已卸载的组件里写 state。
      polishAbort.current?.abort()
      polishAbort.current = null
      // 等结论的外部 AI 工具不能就这么一直挂着：编辑器卸载等于这次改动做不了。
      setPolishSession((current) => {
        current?.settle?.({ ok: false, cancelled: true })
        return null
      })
      options.current.onBusyChange?.(false)
    }
  }, [])

  const reportError = useCallback((value: unknown) => {
    if (!alive.current) return
    const cause = value instanceof Error ? value : new Error(String(value))
    // 宿主关了内联横条时只走 onError（浮窗/toast），不留一份没人渲染的旧错误在 state 里。
    if (options.current.showInlineError !== false) setError(cause.message)
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
        openColor: (field, view) => {
          const trigger = root.querySelector<HTMLElement>(`[data-mo-color-trigger="${field}"]`)?.closest('.top-bar-item')
          const rect = trigger?.getBoundingClientRect()
          if (alive.current) setColorRequest({ field, view, anchor: rect ? { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right } : { top: 0, left: 16, bottom: 40, right: 48 } })
        },
        toolbarAction: current.toolbarAction ? { label: current.toolbarAction.label, onClick: () => options.current.toolbarAction?.onClick() } : undefined,
        aiProvider: current.aiProvider ? (context, signal) => options.current.aiProvider!(context, signal) : undefined,
        aiPolish: current.aiPolish
          ? {
              label: current.aiPolish.label,
              icon: current.aiPolish.icon,
              // 没给指令就不传，交给 @mo-gallery/milkdown 的内置默认（「润色选中的文字」）。
              ...(current.aiPolish.instruction ? { instruction: () => readPolishInstruction() } : {}),
            }
          : undefined,
        onAiPolish: (request) => polishRunner.current(request),
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
      .use($prose(() => createTextStyleInheritancePlugin()))
      .use(blockStyleSchema)
      .use(createMediaView(() => ({
        language: options.current.language,
        resolveUrl: options.current.resolveMediaUrl,
        resolveUploadPreview: options.current.resolveUploadPreview,
        resolveLinkPreview: options.current.resolveLinkPreview,
        onEdit: (media, getPos) => {
          if (alive.current) setMediaRequest({ initial: media, getPos, bookmark: crepe.editor.ctx.get(editorViewCtx).state.selection.getBookmark() })
        },
      }), refreshers.current))
      .use($prose(() => createMediaMergePlugin()))
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
          handleDrop: (view, event, _slice, moved) => {
            // 两种媒体拖拽都必须在**视图自身的 props** 里接管：`EditorView.someProp` 先问这里的
            // handleDrop，再问插件 —— Crepe 内核的 `prosemirror-drop-indicator` 排在本插件之前，
            // 它的 handleDrop 只要指针附近找得到块边界就返回 true，把这次拖拽的切片插到那条边界上。
            // 拖格时那会插一份副本、原来的格子还在（看起来像复制而不是移动）；拖整张卡时则变成
            // 「把卡挪到那个边界」，永远并不成拼图。见 media-merge.ts 的两条注释。
            if (handleMediaTileDrop(view, event)) return true
            if (handleMediaCardDrop(view, event, moved)) return true
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
  }, [hasAI, hasPolish, readPolishInstruction])

  const say = useCallback((zhText: string, enText: string) => (options.current.language === 'en' ? enText : zhText), [])

  /**
   * 跑一次润色。两条铁律：
   * 1. 模型输出只进浮窗，**绝不**在确认前写进文档（这正是之前 `runAICmd` 的问题）。
   * 2. 位置在点击那一刻就固定下来，并记下当时的文档尺寸；确认时尺寸对不上就说明
   *    期间正文被改过，那两个位置已经不可信，宁可让用户重来也不要错位替换。
   */
  const runPolish = useCallback(async (request: AiPolishRequest) => {
    const provider = options.current.aiProvider
    if (!provider) {
      reportError(new Error(say('还没有配置可用的 AI 模型，先去设置里选一个模型。', 'No AI model is configured yet — pick one in settings.')))
      return
    }
    const view = request.ctx.get(editorViewCtx)
    const state = view.state
    // 媒体卡片 / 代码块在纯文本里没有对应物：跟着一起送进去，回来时它们就没了，
    // 而用户看到的是「润色」不是「删除」。这种情况直接拒绝，让人只选文字。
    const blocked = new Set(['media_card', 'image-block', 'image_block', 'code_block'])
    let blocker = ''
    state.doc.nodesBetween(request.from, request.to, (node) => {
      if (!blocker && blocked.has(node.type.name)) blocker = node.type.name
      return undefined
    })
    if (blocker) {
      reportError(new Error(say('选区里有媒体卡片或代码块，请只选择文字再润色。', 'The selection contains a media card or code block — select plain text only.')))
      return
    }
    const before = state.doc.textBetween(request.from, request.to, '\n\n')
    if (!before.trim()) {
      reportError(new Error(say('选中的是空白，没有可润色的文字。', 'The selection has no text to polish.')))
      return
    }
    const documentMarkdown = request.ctx.get(serializerCtx)(state.doc)
    polishAbort.current?.abort()
    const controller = new AbortController()
    polishAbort.current = controller
    const next: PolishSession = {
      from: request.from,
      to: request.to,
      docSize: state.doc.content.size,
      instruction: request.instruction,
      label: request.label,
      generated: true,
      before,
      after: '',
      streaming: true,
      controller,
    }
    // 上一个浮窗如果还在等结论（外部 AI 工具发起的），这里要让它知道「被新的挤掉了」，
    // 否则那个 Promise 永远悬着，调用它的模型会一直等到超时。
    setPolishSession((current) => {
      if (current && current.controller !== controller) current.settle?.({ ok: false, cancelled: true })
      return next
    })
    try {
      let after = ''
      for await (const chunk of provider({ document: documentMarkdown, selection: before, instruction: request.instruction }, controller.signal)) {
        if (controller.signal.aborted) return
        after += chunk
        setPolishSession((current) => current && current.controller === controller ? { ...current, after } : current)
      }
      if (controller.signal.aborted) return
      const final = after.trim()
      if (!final) throw new Error(say('模型没有返回内容，换个模型或者稍后再试。', 'The model returned nothing. Try another model or retry later.'))
      setPolishSession((current) => current && current.controller === controller ? { ...current, after: final, streaming: false } : current)
    } catch (error) {
      // 用户点了「停止」或关掉了浮窗：这不是故障，别弹 toast。
      if (controller.signal.aborted) return
      setPolishSession((current) => current && current.controller === controller ? null : current)
      reportError(error)
    } finally {
      if (polishAbort.current === controller) polishAbort.current = null
    }
  }, [reportError, say])

  /** 确认替换：把润色结果当成一次普通编辑提交，历史栈里是一整步，Ctrl+Z 能退回去。 */
  const acceptPolish = useCallback(() => {
    const session = polishSession
    const editor = get()
    if (!session || editor?.status !== EditorStatus.Created) return
    const ctx = editor.ctx
    const view = ctx.get(editorViewCtx)
    if (view.state.doc.content.size !== session.docSize) {
      setPolishSession(null)
      const reason = say('正文在润色期间有改动，请重新选择后再试。', 'The document changed while polishing — select the text again.')
      session.settle?.({ ok: false, reason })
      reportError(new Error(reason))
      return
    }
    try {
      // 结果按 Markdown 解析，保留模型可能带回来的加粗、序号、分段等结构；
      // 写入逻辑与「外部 AI 工具改稿」共用，两条链路必须对「怎么把文字写回去」保持一致。
      // 整篇替换另走一条：它要在落盘前核对媒体卡没被模型抄丢（见 replaceDocumentWithMarkdown）。
      if (session.scope === 'document') replaceDocumentWithMarkdown(ctx, session.after)
      else replaceRangeWithMarkdown(ctx, session.from, session.to, session.after)
      setPolishSession(null)
      session.settle?.({ ok: true })
      view.focus()
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      session.settle?.({ ok: false, reason })
      reportError(error)
    }
  }, [get, polishSession, reportError, say])

  /** 放弃：断掉请求、关掉浮窗，正文一个字都不动。 */
  const rejectPolish = useCallback(() => {
    const session = polishSession
    polishAbort.current?.abort()
    polishAbort.current = null
    setPolishSession(null)
    // 用户主动放弃不是故障：告诉等待方「是取消」，让它回一句「已放弃」而不是报错。
    session?.settle?.({ ok: false, cancelled: true })
    const editor = get()
    if (editor?.status === EditorStatus.Created) editor.ctx.get(editorViewCtx).focus()
  }, [get, polishSession])

  const retryPolish = useCallback(() => {
    const session = polishSession
    // 外部 AI 工具给的是定稿内容，没有「再算一遍」这回事：同一个输入只会得到同一段文字。
    if (!session?.generated) return
    const editor = get()
    if (!session || editor?.status !== EditorStatus.Created) return
    void runPolish({ ctx: editor.ctx, from: session.from, to: session.to, instruction: session.instruction, label: session.label })
  }, [get, polishSession, runPolish])

  /**
   * 外部 AI 工具（悬浮球对话框里的 Agent）改正文的唯一入口。
   *
   * 分三步：定位 → 摆出对照 → 用户点了才写。
   * 定位必须唯一命中（`locateText` 会如实说「找不到」或「出现多次」），浮窗确认前正文
   * 一个字都不动，确认后的写入是一次事务，所以 Ctrl+Z 能整步退回。返回的 Promise 就是
   * 这个结论 —— 调用它的模型只能通过它知道我到底改没改。
   */
  const applyTextEdit = useCallback((edit: MilkdownTextEdit): Promise<MilkdownTextEditResult> => {
    const editor = get()
    if (editor?.status !== EditorStatus.Created) {
      return Promise.resolve({ ok: false, reason: say('编辑器还在加载，稍后再试。', 'The editor is still loading — try again in a moment.') })
    }
    if (options.current.readOnly || busy.current) {
      return Promise.resolve({ ok: false, reason: say('正文当前不可编辑（只读或正在忙）。', 'The document is not editable right now.') })
    }
    const state = editor.ctx.get(editorViewCtx).state
    const replace = (edit.replace ?? '').trim()
    if (!replace) return Promise.resolve({ ok: false, reason: say('replace 是空的：要给出替换后的文字。', '`replace` is empty — provide the replacement text.') })

    const whole = edit.scope === 'document'
    let from = 0
    let to = state.doc.content.size
    if (!whole) {
      const located = locateText(state.doc, edit.find ?? '')
      if ('error' in located) return Promise.resolve({ ok: false, reason: located.error })
      from = located.range.from
      to = located.range.to
      // 整篇替换当然「包含」媒体卡（它就是在全文上改字），所以这一关只对片段替换生效，
      // 整篇那条改由 text-edit 的节点计数兜底（见 replaceDocumentWithMarkdown）。
      const blocker = hasNonTextNodeInside(state.doc, from, to)
      if (blocker) {
        return Promise.resolve({
          ok: false,
          reason: say(
            `这段范围里夹着 ${blocker}（媒体卡片/图片/代码块），替换会把它们删掉。请把 find 缩小到纯文字的一段。`,
            `That range contains a ${blocker} (media card / image / code block) which this edit would delete — narrow \`find\` to plain text.`,
          ),
        })
      }
    }
    // 整篇对照用序列化后的 Markdown，而不是 textBetween 的纯文本：右侧（润色结果）本来就是
    // Markdown，左侧若是纯文本，媒体卡会只剩一行 `::media{...}` 之差、格式也全被抹平，
    // 渲染式对照就会把「一张没动过的图」显示成「删掉一张、又加了一张」。
    const before = whole ? editor.ctx.get(serializerCtx)(state.doc) : state.doc.textBetween(from, to, '\n\n')
    if (!before.trim()) return Promise.resolve({ ok: false, reason: say('这段范围里没有文字。', 'That range has no text.') })

    const controller = new AbortController()
    polishAbort.current?.abort()
    polishAbort.current = controller
    const label = edit.label?.trim() || say('AI 修改', 'AI edit')

    return new Promise<MilkdownTextEditResult>((resolve) => {
      let settled = false
      const settle = (result: MilkdownTextEditResult) => {
        if (settled) return
        settled = true
        resolve(result)
      }
      const next: PolishSession = {
        from,
        to,
        docSize: state.doc.content.size,
        instruction: '',
        label,
        generated: false,
        before,
        after: replace,
        streaming: false,
        controller,
        scope: whole ? 'document' : undefined,
        settle,
      }
      setPolishSession((current) => {
        if (current && current.controller !== controller) current.settle?.({ ok: false, cancelled: true })
        return next
      })
    })
  }, [get, say])

  useLayoutEffect(() => { polishRunner.current = (request) => { void runPolish(request) } }, [runPolish])

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
  }, [get, loading, props.readOnly, props.resolveUploadPreview, props.resolveMediaUrl, props.language])

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
      if (node.type.name !== 'media_card') return
      const media = normalizeMedia(node.attrs.media)
      if (media.kind === 'upload' && media.uploadId === uploadId) {
        found = true
        transaction.setNodeMarkup(pos, undefined, { media: replacement ?? { ...media, status: 'failed' } })
        return
      }
      // 并进拼图的待传格：上传完成后同样原地换成正式图片（否则拼图里会永远留一格占位）
      if (media.kind === 'gallery' && media.images?.some((image) => image.uploadId === uploadId)) {
        found = true
        const images = media.images.map((image) => image.uploadId !== uploadId ? image : replacement
          ? { src: replacement.src ?? '', alt: replacement.title ?? image.alt, photoId: replacement.photoId }
          : { ...image, status: 'failed' as const })
        transaction.setNodeMarkup(pos, undefined, { media: { ...media, images } })
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
    insertImageUploadPlaceholder: ({ uploadId, fileName, status }) => insertMarkdown(buildMediaMarkdown({ kind: 'upload', uploadId, title: fileName, status: status ?? 'uploading' })),
    resolveImageUploadPlaceholder: (uploadId, image) => updateUpload(uploadId, { kind: 'image', src: image.src, title: image.alt, photoId: image.photoId }),
    failImageUploadPlaceholder: (uploadId) => { updateUpload(uploadId) },
    refreshUploadPreviews: () => {
      refreshers.current.forEach((render) => render())
      if (alive.current) refreshMediaDialog((version) => version + 1)
    },
    applyTextEdit,
  }), [applyTextEdit, get, insertMarkdown, updateUpload])

  const closeMedia = () => {
    setMediaRequest(null)
    const editor = get()
    if (editor?.status === EditorStatus.Created) editor.ctx.get(editorViewCtx).focus()
  }
  const zh = props.language !== 'en'

  return <div className={`milkdown-editor ${props.className ?? ''}`} data-editor="milkdown" aria-busy={loading}>
    {error && props.showInlineError !== false && <div className="milkdown-editor-error" role="alert">{error}<button type="button" aria-label={zh ? '关闭错误提示' : 'Dismiss error'} onClick={() => setError('')}>×</button></div>}
    <div className="milkdown-editor-scroll"><Milkdown /></div>
    {colorRequest && <ColorPalette field={colorRequest.field} view={colorRequest.view} language={props.language ?? 'zh'} anchor={colorRequest.anchor} onClose={() => { setColorRequest(null); colorRequest.view.focus() }} />}
    <div className="milkdown-editor-status"><span>{loading ? (zh ? '正在加载编辑器…' : 'Loading editor…') : `${characters} ${zh ? '字' : 'characters'}`}{props.statusBar?.materialCount !== undefined && ` · ${props.statusBar.materialCount} ${zh ? '张素材' : 'photos'}`}</span><span>{props.statusBar?.trailing}</span></div>
    {mediaRequest && <MediaDialog initial={mediaRequest.initial} language={props.language ?? 'zh'} resolveUploadPreview={props.resolveUploadPreview} resolveLinkPreview={props.resolveLinkPreview} resolveMediaUrl={props.resolveMediaUrl} renderSelect={props.renderMediaDialogSelect} onClose={closeMedia} onSubmit={(media) => {
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
    {polishSession && <PolishDialog
      language={props.language ?? 'zh'}
      label={polishSession.label}
      variant={polishSession.generated ? 'polish' : 'edit'}
      before={polishSession.before}
      after={polishSession.after}
      streaming={polishSession.streaming}
      resolveMediaUrl={props.resolveMediaUrl}
      onAccept={acceptPolish}
      onReject={rejectPolish}
      onRetry={polishSession.generated ? retryPolish : undefined}
      onStop={rejectPolish}
    />}
  </div>
})

/** The official React integration owns the Crepe instance and its lifecycle. */
export const MilkdownEditor = forwardRef<MilkdownEditorHandle, MilkdownEditorProps>(function MilkdownEditor(props, ref) {
  return <MilkdownProvider key={props.contentVersion ?? 'document'}><EditorInstance {...props} ref={ref} /></MilkdownProvider>
})

export type MilkdownAiProvider = AIProvider
export type MilkdownAiPolish = AiPolishOptions
