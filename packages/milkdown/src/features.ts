import { offset } from '@floating-ui/dom'
import { Crepe } from '@milkdown/crepe'
import type { CrepeConfig } from '@milkdown/crepe'
import { editorViewCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import type { EditorView } from '@milkdown/kit/prose/view'
import { undo, redo } from '@milkdown/kit/prose/history'
import type { AIProvider } from '@milkdown/crepe/feature/ai'
import { mediaLabels } from './MediaDialog'
import type { MediaKind } from './media'
import type { ColorField } from './color-palette'
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE, FONT_FAMILIES, FONT_SIZES, MAX_FONT_SIZE, MIN_FONT_SIZE } from './text-style'
import { getSelectedTextStyle, setTextStyle } from './text-style-plugin'

/**
 * 选中文本悬浮工具栏上的「AI 润色」按钮。
 *
 * 只在宿主显式传入时出现：润色是要真去调模型的，不能凭空多出一个按了没反应的按钮。
 * 点了之后这里只负责把「选区 + 指令」交出去（`FeatureOptions.onAiPolish`），
 * 真正调模型、展示差异、确认后替换正文都由宿主完成 —— 润色结果绝不直接写进文档。
 */
export interface AiPolishOptions {
  /** 按钮文案，同时用作 title / aria-label；缺省按语言取「AI 润色」。 */
  label?: string
  /** 自定义图标（SVG 字符串）；缺省用内置的闪光图标。 */
  icon?: string
  /**
   * 发给模型的指令。传函数时在**每次点击时**才求值 —— 宿主可以现读系统设置里的
   * 提示词，用户改完设置不用重开编辑器。
   */
  instruction?: string | (() => string | Promise<string>)
}

/** 点「AI 润色」时交给宿主的全部信息。 */
export interface AiPolishRequest {
  /** 侧栏/顶栏需要 ctx 时用得到，这里只是转交，不读写。 */
  ctx: Ctx
  /** 选区在**点击那一瞬**的位置（指令是异步求值的，所以要先取下来）。 */
  from: number
  to: number
  /** 求值后的指令，宿主默认拿它当 system 提示词。 */
  instruction: string
  /** 按钮文案，浮窗标题用它。 */
  label: string
}

interface FeatureOptions {
  language: 'zh' | 'en'
  placeholder?: string
  upload: (file: File) => Promise<string>
  resolveUrl: (url: string) => string
  openMedia: (kind: MediaKind) => void
  openColor: (field: ColorField, view: EditorView) => void
  toolbarAction?: { label: string; onClick: () => void }
  aiProvider?: AIProvider
  aiPolish?: AiPolishOptions
  /** 点了「AI 润色」：宿主接管后续（调模型 → 浮窗对照 → 确认后替换）。 */
  onAiPolish?: (request: AiPolishRequest) => void
  onError: (error: unknown) => void
}

const svg = (path: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`
const mediaIcon = svg('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/>')
const undoIcon = svg('<path d="M3 10h11a6 6 0 0 1 0 12M3 10l5-5M3 10l5 5" transform="translate(0 -3)"/>')
const redoIcon = svg('<path d="M21 10H10a6 6 0 0 0 0 12m11-12-5-5m5 5-5 5" transform="translate(0 -3)"/>')
const panelIcon = svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18m-5-9 2 2-2 2"/>')
const chevronIcon = svg('<path d="m6 9 6 6 6-6"/>')
const minusIcon = svg('<path d="M5 12h14"/>')
const plusIcon = svg('<path d="M12 5v14M5 12h14"/>')
const polishIcon = svg('<path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3Z"/><path d="M19 3v4M17 5h4"/>')

// Crepe renders every selector with the same class, so an invisible marker in
// the chevron HTML tags each one for CSS sizing and the double-click size edit.
const markedChevron = (mark: string) => `<span data-mo-toolbar-mark="${mark}"></span>${chevronIcon}`
const textColorIcon = svg('<path d="M7 17 12 4l5 13M9 12h6"/><path d="M4 21h16" stroke-width="3"/>')
const textBackgroundIcon = svg('<rect x="2" y="2" width="20" height="20" rx="2" fill="currentColor" stroke="none"/><path d="m7 18 5-12 5 12m-8-5h6" class="mo-color-inverse"/>')
const colorTrigger = (field: ColorField, icon: string) => `<span data-mo-color-trigger="${field}">${icon}</span>`
function namedIcon(icon: string, label: string) {
  const safeLabel = label.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  return `<span role="img" aria-label="${safeLabel}" title="${safeLabel}">${icon}</span>`
}

export function createFeatures(options: FeatureOptions): NonNullable<CrepeConfig['featureConfigs']> {
  const zh = options.language === 'zh'
  const labels: Record<string, string> = zh ? {
    bold: '加粗', italic: '斜体', strikethrough: '删除线', code: '行内代码', link: '链接', image: '图片', table: '表格',
    'bullet-list': '无序列表', 'ordered-list': '有序列表', 'task-list': '任务列表', 'code-block': '代码块', math: '公式', quote: '引用', hr: '分隔线',
    undo: '撤销', redo: '重做', media: '媒体卡片', library: options.toolbarAction?.label ?? '素材库',
    'font-color': '字体颜色', 'font-background': '字体背景',
    'font-size-dec': '减小字号', 'font-size-inc': '增大字号',
    'ai-polish': 'AI 润色',
  } : {
    bold: 'Bold', italic: 'Italic', strikethrough: 'Strikethrough', code: 'Inline code', link: 'Link', image: 'Image', table: 'Table',
    'bullet-list': 'Bullet list', 'ordered-list': 'Ordered list', 'task-list': 'Task list', 'code-block': 'Code block', math: 'Math', quote: 'Quote', hr: 'Divider',
    undo: 'Undo', redo: 'Redo', media: 'Media card', library: options.toolbarAction?.label ?? 'Media library',
    'font-color': 'Text color', 'font-background': 'Text background',
    'font-size-dec': 'Decrease font size', 'font-size-inc': 'Increase font size',
    'ai-polish': 'AI polish',
  }
  /**
   * 一键润色：把宿主维护的指令交给 `onAiPolish`，由宿主去调模型并在浮窗里对照。
   *
   * 这里**不碰文档**。早先这条路径调用的是 Crepe 自己的 `runAICmd`，它会把模型的
   * 输出直接流式写进正文再用行内装饰圈出差异；润色是整段改写，那套看起来就像
   * 「正文已经被改了」。现在只把选区与指令传递出去，改不改、怎么改由宿主决定。
   *
   * 选区在 await 之前取：指令可能是现读设置的回调（返回 Promise），等它兑现时
   * 悬浮工具栏已经收起、焦点也换过一轮，那时再读 selection 未必还是用户选的那段。
   */
  const polishSelection = async (ctx: Ctx) => {
    const polish = options.aiPolish
    if (!polish || !options.onAiPolish) return
    const { from, to } = ctx.get(editorViewCtx).state.selection
    try {
      const raw = typeof polish.instruction === 'function' ? await polish.instruction() : polish.instruction
      const instruction = (raw ?? (zh ? '润色选中的文字' : 'Polish the selected text')).trim()
      if (!instruction) throw new Error(zh ? '润色提示词是空的，请先到系统设置的提示词里填写。' : 'The polish prompt is empty. Fill it in under Settings → Prompts.')
      if (from >= to) throw new Error(zh ? '请先选中要润色的文字。' : 'Select the text you want to polish first.')
      options.onAiPolish({ ctx, from, to, instruction, label: polish.label ?? labels['ai-polish'] })
    } catch (error) {
      options.onError(error)
    }
  }
  return {
    [Crepe.Feature.TopBar]: {
      chevronDownIcon: markedChevron('heading'),
      headingOptions: [
        { label: zh ? '正文' : 'Paragraph', level: null },
        ...[1, 2, 3, 4, 5, 6].map((level) => ({ label: `${zh ? '标题' : 'Heading'} ${level}`, level })),
      ],
      buildTopBar: (builder) => {
        const applyStyle = (ctx: Ctx, field: 'font' | 'size', value: string | null) => {
          const view = ctx.get(editorViewCtx)
          setTextStyle(field, value)(view.state, view.dispatch, view)
          view.focus()
        }
        const stepSize = (ctx: Ctx, delta: number) => {
          const { size } = getSelectedTextStyle(ctx.get(editorViewCtx).state)
          const next = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, (size ? Number(size) : DEFAULT_FONT_SIZE) + delta))
          applyStyle(ctx, 'size', String(next))
        }
        builder.getGroup('heading')
          .addItem('font-family', {
            icon: '', active: () => false,
            selector: {
              chevronIcon: markedChevron('font'),
              activeLabel: (ctx: Ctx) => {
                const { font } = getSelectedTextStyle(ctx.get(editorViewCtx).state)
                if (font === undefined) return zh ? '混合字体' : 'Mixed fonts'
                return FONT_FAMILIES.find((entry) => entry.value === font)?.[options.language]
                  ?? FONT_FAMILIES.find((entry) => entry.value === DEFAULT_FONT_FAMILY)![options.language]
              },
              options: [
                ...FONT_FAMILIES.map((entry) => ({ label: entry[options.language], onSelect: (ctx: Ctx) => applyStyle(ctx, 'font', entry.value) })),
              ],
            },
          })
          .addItem('font-color', {
            icon: colorTrigger('color', textColorIcon), active: () => false,
            onRun: (ctx: Ctx) => options.openColor('color', ctx.get(editorViewCtx)),
          })
          .addItem('font-background', {
            icon: colorTrigger('background', textBackgroundIcon), active: () => false,
            onRun: (ctx: Ctx) => options.openColor('background', ctx.get(editorViewCtx)),
          })
          .addItem('font-size-dec', {
            icon: minusIcon, active: () => false,
            onRun: (ctx: Ctx) => stepSize(ctx, -1),
          })
          .addItem('font-size', {
            icon: '', active: () => false,
            selector: {
              chevronIcon: markedChevron('size'),
              activeLabel: (ctx: Ctx) => {
                const { size } = getSelectedTextStyle(ctx.get(editorViewCtx).state)
                if (size === undefined) return zh ? '混合字号' : 'Mixed sizes'
                return `${size ?? DEFAULT_FONT_SIZE}px`
              },
              options: [
                ...FONT_SIZES.map((size) => ({ label: `${size}px`, onSelect: (ctx: Ctx) => applyStyle(ctx, 'size', String(size)) })),
              ],
            },
          })
          .addItem('font-size-inc', {
            icon: plusIcon, active: () => false,
            onRun: (ctx: Ctx) => stepSize(ctx, 1),
          })
        builder.addGroup('media', zh ? '媒体' : 'Media').addItem('media', {
          icon: mediaIcon, active: () => false, onRun: () => options.openMedia('image'),
        })
        if (options.toolbarAction) builder.getGroup('media').addItem('library', {
          icon: `<span data-mo-toolbar-mark="library"></span>${panelIcon}`,
          active: () => false, onRun: () => options.toolbarAction?.onClick(),
        })
        builder.addGroup('history', zh ? '历史' : 'History')
          .addItem('undo', { icon: undoIcon, active: () => false, onRun: (ctx) => { const view = ctx.get(editorViewCtx); undo(view.state, view.dispatch); view.focus() } })
          .addItem('redo', { icon: redoIcon, active: () => false, onRun: (ctx: Ctx) => { const view = ctx.get(editorViewCtx); redo(view.state, view.dispatch); view.focus() } })
        const groups = builder.build()
        const history = groups.pop()
        if (history) groups.unshift(history)
        for (const group of groups) for (const item of group.items) {
          if (labels[item.key]) item.icon = namedIcon(item.icon, labels[item.key])
        }
      },
    },
    [Crepe.Feature.Toolbar]: {
      buildToolbar: (builder) => {
        const polish = options.aiPolish
        if (!polish) return
        // 内置的「Ask AI」按钮弹出的是指令面板；润色用设置里固定下来的提示词一键直跑，
        // 面板纯属多余，先把它摘掉，免得悬浮工具栏上并排两个 AI 入口。
        // GroupBuilder.build() 交回的是内部数组引用，这里删掉的项 Crepe 随后 build() 也看不到。
        for (const group of builder.build()) {
          const index = group.items.findIndex((item) => item.key === 'ai')
          if (index >= 0) group.items.splice(index, 1)
        }
        builder.addGroup('ai', 'AI').addItem('ai-polish', {
          icon: polish.icon ?? polishIcon,
          label: polish.label ?? labels['ai-polish'],
          active: () => false,
          onRun: (ctx: Ctx) => { void polishSelection(ctx) },
        })
      },
    },
    [Crepe.Feature.Placeholder]: { text: options.placeholder ?? '', mode: 'block' },
    [Crepe.Feature.ImageBlock]: {
      onUpload: options.upload,
      proxyDomURL: options.resolveUrl,
      blockUploadButton: zh ? '上传图片' : 'Upload image',
      inlineUploadButton: zh ? '上传' : 'Upload',
      blockConfirmButton: zh ? '插入' : 'Insert',
      blockUploadPlaceholderText: zh ? '或粘贴图片链接' : 'or paste an image URL',
      inlineUploadPlaceholderText: zh ? '图片链接' : 'Image URL',
      blockCaptionPlaceholderText: zh ? '添加图片说明' : 'Add a caption',
    },
    [Crepe.Feature.BlockEdit]: {
      blockHandle: {
        // Keep the official left/left-start placement; the editor reserves a
        // gutter so the controls never need to flip to the right of a block.
        floatingUIOptions: { middleware: [offset(8)] },
      },
      textGroup: { label: zh ? '文本' : 'Text', text: { label: zh ? '正文' : 'Paragraph' }, h1: { label: zh ? '标题 1' : 'Heading 1' }, h2: { label: zh ? '标题 2' : 'Heading 2' }, h3: { label: zh ? '标题 3' : 'Heading 3' }, quote: { label: zh ? '引用' : 'Quote' }, divider: { label: zh ? '分隔线' : 'Divider' } },
      listGroup: { label: zh ? '列表' : 'Lists', bulletList: { label: zh ? '无序列表' : 'Bullet list' }, orderedList: { label: zh ? '有序列表' : 'Ordered list' }, taskList: { label: zh ? '任务列表' : 'Task list' } },
      advancedGroup: { label: zh ? '更多' : 'More', image: { label: zh ? '图片' : 'Image' }, table: { label: zh ? '表格' : 'Table' }, codeBlock: { label: zh ? '代码块' : 'Code block' } },
      buildMenu: (builder) => {
        const group = builder.addGroup('media-cards', zh ? '媒体卡片' : 'Media cards')
        for (const kind of ['image', 'gallery', 'video', 'audio', 'link', 'file'] as const) {
          group.addItem(`media-${kind}`, { label: mediaLabels[options.language][kind], icon: mediaIcon, onRun: () => options.openMedia(kind) })
        }
      },
    },
    [Crepe.Feature.AI]: {
      provider: options.aiProvider,
      onError: options.onError,
      diffReviewOnEnd: true,
      instructionPlaceholder: zh ? '告诉 AI 如何修改选中的内容…' : 'Tell AI how to edit the selection…',
      diff: { acceptLabel: zh ? '接受' : 'Accept', rejectLabel: zh ? '拒绝' : 'Reject', customBlockTypes: ['table', 'image-block', 'code_block', 'media_card'] },
      diffActions: { acceptAllLabel: zh ? '接受全部' : 'Accept all', rejectAllLabel: zh ? '拒绝全部' : 'Reject all', retryLabel: zh ? '重试' : 'Retry' },
      streamingIndicator: { fallbackLabel: zh ? '正在生成' : 'Generating', cancelHint: zh ? 'Esc 取消' : 'Esc to cancel' },
    },
  }
}
