import { offset } from '@floating-ui/dom'
import { Crepe } from '@milkdown/crepe'
import type { CrepeConfig } from '@milkdown/crepe'
import { editorViewCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import { undo, redo } from '@milkdown/kit/prose/history'
import type { AIProvider } from '@milkdown/crepe/feature/ai'
import { mediaLabels } from './MediaDialog'
import type { MediaKind } from './media'
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE, FONT_FAMILIES, FONT_SIZES, MAX_FONT_SIZE, MIN_FONT_SIZE } from './text-style'
import { getSelectedTextStyle, setTextStyle } from './text-style-plugin'

interface FeatureOptions {
  language: 'zh' | 'en'
  placeholder?: string
  upload: (file: File) => Promise<string>
  resolveUrl: (url: string) => string
  openMedia: (kind: MediaKind) => void
  toolbarAction?: { label: string; onClick: () => void }
  aiProvider?: AIProvider
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

// Crepe renders every selector with the same class, so an invisible marker in
// the chevron HTML tags each one for CSS sizing and the double-click size edit.
const markedChevron = (mark: string) => `<span data-mo-toolbar-mark="${mark}"></span>${chevronIcon}`

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
    'font-size-dec': '减小字号', 'font-size-inc': '增大字号',
  } : {
    bold: 'Bold', italic: 'Italic', strikethrough: 'Strikethrough', code: 'Inline code', link: 'Link', image: 'Image', table: 'Table',
    'bullet-list': 'Bullet list', 'ordered-list': 'Ordered list', 'task-list': 'Task list', 'code-block': 'Code block', math: 'Math', quote: 'Quote', hr: 'Divider',
    undo: 'Undo', redo: 'Redo', media: 'Media card', library: options.toolbarAction?.label ?? 'Media library',
    'font-size-dec': 'Decrease font size', 'font-size-inc': 'Increase font size',
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
                { label: zh ? '默认字号' : 'Default size', onSelect: (ctx: Ctx) => applyStyle(ctx, 'size', null) },
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
