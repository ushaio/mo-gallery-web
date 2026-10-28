/**
 * 编辑器命令层：把「格式动作」表达成一组作用在 ProseMirror 上的命令。
 *
 * 为什么单独一层而不是散在组件里：
 *  - **不经过 UI**。工具栏按钮是 Crepe 渲染出来的视图，点它要先展开菜单、要等重渲染；
 *    命令层直接拿 `EditorState` + `dispatch`，是同一份操作语义的唯一事实来源。
 *  - **可被非 UI 调用方复用**。MCP / 外部 Agent 需要「把这段设成 H2」，它不该知道
 *    Crepe 的 DOM 结构，也不该依赖工具栏此刻是否可见。
 *  - **可测**。命令是纯函数（state → transaction），不碰 React、不碰 DOM 渲染。
 *
 * 词汇表刻意与 TipTap 侧对齐（`NarrativeEditorFormatCommand`）：两个编辑器对「加粗」
 * 「设标题」「设对齐」这些动作的命名与语义必须一致，否则同一个 MCP 工具在两篇稿子上
 * 的表现会不同。
 */
import {
  lift,
  setBlockType,
  toggleMark,
  wrapIn,
} from '@milkdown/kit/prose/commands'
import { redo, undo } from '@milkdown/kit/prose/history'
import type { EditorState, Transaction } from '@milkdown/kit/prose/state'
import { liftListItem, wrapInList } from '@milkdown/kit/prose/schema-list'

import { getSelectedTextStyle, setTextStyle } from './text-style-plugin'
import type { TextStyleField } from './text-style-plugin'
import { normalizeBlockAlign } from './block-style'

/** 与 TipTap 侧 `NarrativeEditorFormatMark` 一致的 mark 名字。 */
export type MilkdownFormatMark = 'bold' | 'italic' | 'underline' | 'strike' | 'code'

/** 与 TipTap 侧 `NarrativeEditorFormatCommand` 一致的命令词汇表。 */
export type MilkdownFormatCommand =
  | { command: 'toggleMark'; mark: MilkdownFormatMark }
  | { command: 'setParagraph' }
  | { command: 'setHeading'; level: 1 | 2 | 3 | 4 | 5 | 6 }
  | { command: 'setAlign'; align: 'left' | 'center' | 'right' }
  | { command: 'toggleList'; list: 'bulletList' | 'orderedList' }
  | { command: 'toggleBlockquote' }
  | { command: 'clearFormatting' }
  | { command: 'setFontSize'; value: string | null }
  | { command: 'setFontFamily'; value: string | null }
  | { command: 'setTextColor'; value: string | null }
  | { command: 'setBackgroundColor'; value: string | null }
  | { command: 'undo' }
  | { command: 'redo' }

export interface MilkdownFormatState {
  /** 光标所在块的节点类型名（paragraph / heading / ...）。 */
  blockType: string
  headingLevel: 1 | 2 | 3 | 4 | 5 | 6 | null
  marks: MilkdownFormatMark[]
  align: 'left' | 'center' | 'right'
  fontSize: string | null
  fontFamily: string | null
  color: string | null
  backgroundColor: string | null
  inBulletList: boolean
  inOrderedList: boolean
  inBlockquote: boolean
  canUndo: boolean
  canRedo: boolean
  editable: boolean
}

export interface MilkdownFormatResult {
  ok: boolean
  reason?: string
}

/** mark 名字 → schema 里的 mark 类型名。`code` 在两边的节点里都叫 `code`。 */
const MARK_SCHEMA_NAME: Record<MilkdownFormatMark, string> = {
  bold: 'strong',
  italic: 'emphasis',
  underline: 'underline',
  strike: 'strike_through',
  code: 'inlineCode',
}

const FORMAT_MARK_ORDER: readonly MilkdownFormatMark[] = ['bold', 'italic', 'underline', 'strike', 'code']

function nonEmpty(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

/** 块级对齐读自节点属性（block-style 用 `align` 属性表达）。 */
function blockAlign(state: EditorState): 'left' | 'center' | 'right' {
  const node = state.selection.$from.parent
  const align = normalizeBlockAlign(node.attrs.align)
  return align === 'justify' ? 'left' : align
}

function inListOf(state: EditorState, listTypeName: string): boolean {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === listTypeName) return true
  }
  return false
}

function inBlockquote(state: EditorState): boolean {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'blockquote') return true
  }
  return false
}

/** 读格式状态。全部来自 EditorState，不读任何 DOM。 */
export function getMilkdownFormatState(state: EditorState): MilkdownFormatState {
  const { selection, schema, storedMarks } = state
  const activeMarks = new Set((storedMarks ?? selection.$from.marks()).map((mark) => mark.type.name))
  const style = getSelectedTextStyle(state)
  const heading = selection.$from.parent
  const headingLevel = heading.type.name === 'heading'
    ? (Math.min(6, Math.max(1, Number(heading.attrs.level) || 1)) as 1 | 2 | 3 | 4 | 5 | 6)
    : null
  return {
    blockType: heading.type.name,
    headingLevel,
    marks: FORMAT_MARK_ORDER.filter((mark) => activeMarks.has(MARK_SCHEMA_NAME[mark])),
    align: blockAlign(state),
    // 行内样式里 undefined 表示「选中范围内不一致」，对外一并不做区分地报 null：
    // 调用方要的是「能不能继续设置」，而不是混合态的细节。
    fontSize: nonEmpty(typeof style.size === 'string' ? style.size : null),
    fontFamily: nonEmpty(typeof style.font === 'string' ? style.font : null),
    color: nonEmpty(style.color),
    backgroundColor: nonEmpty(style.background),
    inBulletList: inListOf(state, 'bullet_list'),
    inOrderedList: inListOf(state, 'ordered_list'),
    inBlockquote: inBlockquote(state),
    canUndo: canRun(state, undo),
    canRedo: canRun(state, redo),
    editable: schema.marks.strong !== undefined,
  }
}

/** 只试跑命令（dispatch 为空）判断它是否会生效——与 ProseMirror 的 `can` 同义。 */
function canRun(state: EditorState, command: (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean): boolean {
  return command(state)
}

/** 应用一个行内样式字段。`null` 表示清除该字段。 */
function applyTextStyle(field: TextStyleField, value: string | null) {
  return setTextStyle(field, value)
}

/**
 * 执行一条格式命令。
 *
 * 返回 `{ ok: false, reason }` 而不是抛异常：调用方（MCP 工具）要把原因原样转述给用户
 * / 模型，异常会变成一条没有上下文的失败。
 */
export function applyMilkdownFormatCommand(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  input: MilkdownFormatCommand,
): MilkdownFormatResult {
  const schema = state.schema
  /* eslint-disable @typescript-eslint/no-explicit-any -- commands are声明在 @milkdown/kit，类型签名按 prosemirror-commands 原样透传。 */
  const run = (command: any): boolean => command(state, dispatch)

  switch (input.command) {
    case 'toggleMark': {
      const markType = schema.marks[MARK_SCHEMA_NAME[input.mark]]
      if (!markType) return { ok: false, reason: `当前编辑器不支持 ${input.mark} 格式` }
      if (!run(toggleMark(markType))) return { ok: false, reason: `${input.mark} 不适用于当前选区` }
      return { ok: true }
    }
    case 'setParagraph': {
      const paragraph = schema.nodes.paragraph
      if (!paragraph) return { ok: false, reason: '当前文档没有段落节点' }
      if (!run(setBlockType(paragraph))) return { ok: false, reason: '当前选区不能改成正文' }
      return { ok: true }
    }
    case 'setHeading': {
      const heading = schema.nodes.heading
      if (!heading) return { ok: false, reason: '当前文档没有标题节点' }
      if (!run(setBlockType(heading, { level: input.level }))) {
        return { ok: false, reason: '当前选区不能改成标题' }
      }
      return { ok: true }
    }
    case 'setAlign': {
      // 对齐是块属性：直接改当前块的 attrs，与工具栏用的同一条属性。
      const { $from } = state.selection
      const node = $from.parent
      if (!('align' in node.attrs)) return { ok: false, reason: '当前块不支持对齐设置' }
      const tr = state.tr.setNodeMarkup($from.before($from.depth), undefined, {
        ...node.attrs,
        align: input.align,
      })
      dispatch(tr.scrollIntoView())
      return { ok: true }
    }
    case 'toggleList': {
      const listType = schema.nodes[input.list === 'bulletList' ? 'bullet_list' : 'ordered_list']
      const itemType = schema.nodes.list_item
      if (!listType || !itemType) return { ok: false, reason: '当前文档不支持列表' }
      // 已在列表里就抬升一层（与工具栏的 toggle 语义一致），否则包成列表。
      if (inListOf(state, listType.name)) {
        if (!run(liftListItem(itemType))) return { ok: false, reason: '无法退出当前列表层级' }
        return { ok: true }
      }
      if (!run(wrapInList(listType))) return { ok: false, reason: '当前选区不能转成该列表' }
      return { ok: true }
    }
    case 'toggleBlockquote': {
      const blockquote = schema.nodes.blockquote
      if (!blockquote) return { ok: false, reason: '当前文档不支持引用' }
      if (inBlockquote(state)) {
        if (!run(lift)) return { ok: false, reason: '当前块无法退出引用' }
        return { ok: true }
      }
      if (!run(wrapIn(blockquote))) return { ok: false, reason: '当前块不能转成引用' }
      return { ok: true }
    }
    case 'clearFormatting': {
      // 行内样式（字号/字体/颜色）都挂在 text_style 上，逐字段清空；
      // 同时把块转回正文，得到与工具栏「清除格式」一致的结果。
      let changed = false
      for (const field of ['font', 'size', 'color', 'background'] as const) {
        if (run(applyTextStyle(field, null))) changed = true
      }
      for (const mark of ['strong', 'emphasis', 'underline', 'strike_through', 'inlineCode'] as const) {
        const markType = schema.marks[mark]
        if (markType && state.selection.$from.marks().some((active) => active.type === markType)) {
          const tr = state.tr.removeMark(state.selection.from, state.selection.to, markType)
          dispatch(tr)
          changed = true
        }
      }
      const paragraph = schema.nodes.paragraph
      if (paragraph && run(setBlockType(paragraph))) changed = true
      return changed ? { ok: true } : { ok: false, reason: '当前选区没有可清除的格式' }
    }
    case 'setFontSize':
      return run(applyTextStyle('size', input.value))
        ? { ok: true }
        : { ok: false, reason: '字号设置未生效' }
    case 'setFontFamily':
      return run(applyTextStyle('font', input.value))
        ? { ok: true }
        : { ok: false, reason: '字体设置未生效' }
    case 'setTextColor':
      return run(applyTextStyle('color', input.value))
        ? { ok: true }
        : { ok: false, reason: '文字颜色设置未生效' }
    case 'setBackgroundColor':
      return run(applyTextStyle('background', input.value))
        ? { ok: true }
        : { ok: false, reason: '底色设置未生效' }
    case 'undo':
      if (!run(undo)) return { ok: false, reason: '没有可撤销的操作' }
      return { ok: true }
    case 'redo':
      if (!run(redo)) return { ok: false, reason: '没有可重做的操作' }
      return { ok: true }
    default: {
      const unreachable: never = input
      return { ok: false, reason: `未知的编辑器命令: ${JSON.stringify(unreachable)}` }
    }
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/**
 * 读列表项的**渲染度量**（字号、::marker 字号与字体、内联 style）。
 *
 * 这是唯一必须读 DOM 的读取方法：回答的是「这段列表在屏幕上长什么样」，文档模型里
 * 没有这个信息（列表符号的字号由 CSS 与继承决定）。判据只有一处，所以把它放在命令层
 * 旁边，而不是让调用方各自去查 selector。
 */
export function readListMetrics(root: HTMLElement): Array<{
  index: number
  text: string
  listType: string | null
  depth: number
  liFontSize: string
  markerFontSize: string
  liFontFamily: string
  markerFontFamily: string
  inlineStyle: string
}> {
  return Array.from(root.querySelectorAll<HTMLElement>('li')).map((item, index) => {
    const list = item.parentElement
    const marker = getComputedStyle(item, '::marker')
    const liStyle = getComputedStyle(item)
    let depth = 0
    let current: Element | null = list
    while (current && !current.matches('.ProseMirror')) {
      if (current.matches('ul, ol')) depth += 1
      current = current.parentElement
    }
    return {
      index,
      text: item.innerText.trim(),
      listType: list?.tagName.toLowerCase() ?? null,
      depth,
      liFontSize: liStyle.fontSize,
      markerFontSize: marker.fontSize,
      liFontFamily: liStyle.fontFamily,
      markerFontFamily: marker.fontFamily,
      inlineStyle: item.getAttribute('style') ?? '',
    }
  })
}

