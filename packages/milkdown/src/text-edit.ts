/**
 * 「按一段文字定位，再换掉它」—— AI 改写正文时唯一需要的两个原子动作。
 *
 * 为什么不按字符偏移（offset）改：正文在模型思考的这几十秒里随时可能被用户改动，
 * 偏移量当场就失效了；而「这段文字还在不在、还唯一吗」是随时可验证的。所以定位永远
 * 现算，定位不到就如实拒绝，绝不按近似位置乱改。
 *
 * 定位在**纯文本**上做（`doc.textBetween` 那一层），并忽略空白差异与常见的 Markdown
 * 记号差异：模型从 `page_read_context` 读到的是 Markdown，而这里比较的是编辑器里的
 * 文字，不抹平这一层它就永远匹配不上。
 */
import type { Ctx } from '@milkdown/kit/ctx'
import { editorViewCtx, parserCtx } from '@milkdown/kit/core'
import type { Fragment, Node as ProseNode } from '@milkdown/kit/prose/model'
import type { EditorView } from '@milkdown/kit/prose/view'

export interface TextRange {
  from: number
  to: number
}

export type LocateResult = { range: TextRange } | { error: string }

/** 正文里「有文字但不在纯文本里」的节点：媒体卡、图片块、代码块。 */
const NON_TEXT_BLOCKS = new Set(['media_card', 'image-block', 'image_block', 'code_block'])

/** 段与段之间的分隔：`textBetween` 也用同样的两字符，方便跨段匹配。 */
const BLOCK_SEPARATOR = '\n\n'

/**
 * 把一段文字压成「只留字，空白归一」的形式，并记住每个字在原文里的位置。
 *
 * 位置表是回算的关键：匹配发生在压缩后的字符串上，真正要落盘的却是原文里的区间。
 */
function collapse(text: string): { text: string; map: number[] } {
  const chars: string[] = []
  const map: number[] = []
  let pendingSpace = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (/\s/.test(char)) {
      pendingSpace = chars.length > 0
      continue
    }
    if (pendingSpace) {
      // 压成一个空格，指向这段空白里的第一个字符。
      chars.push(' ')
      map.push(index)
      pendingSpace = false
    }
    chars.push(char)
    map.push(index)
  }
  return { text: chars.join(''), map }
}

/**
 * 去掉模型从 Markdown 带回来的记号，只留下正文里真正存在的字。
 *
 * 只删「一定是记号」的东西：强调符、行内代码的反引号、行首的标题/引用/列表前缀、
 * 链接地址。宁可少删 —— 删多了会把用户真正写的符号一起吃掉，反而定位到别处。
 */
function stripMarkdownMarkers(text: string): string {
  return text
    .replace(/^[ \t]*(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+|\d+[.)][ \t]+)/gm, '')
    .replace(/\*\*|__|~~|`/g, '')
    .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')
}

/** 把文档展平成「纯文本 + 每段文字在文档里的起点」。 */
function flatten(doc: ProseNode): { text: string; segments: Array<{ start: number; end: number; from: number }> } {
  const parts: string[] = []
  const segments: Array<{ start: number; end: number; from: number }> = []
  let length = 0
  let lastBlock: ProseNode | null = null
  doc.descendants((node, pos, parent) => {
    if (!node.isText) return true
    // 换了一个文本块就补一个分隔符：这样跨段的 find 也能匹配上。
    if (parent !== lastBlock) {
      if (length > 0) {
        parts.push(BLOCK_SEPARATOR)
        length += BLOCK_SEPARATOR.length
      }
      lastBlock = parent
    }
    const value = node.text ?? ''
    segments.push({ start: length, end: length + value.length, from: pos })
    parts.push(value)
    length += value.length
    return false
  })
  return { text: parts.join(''), segments }
}

/**
 * 在文档里找 `needle` 出现的唯一位置。
 *
 * 找不到或出现多次都返回原因 —— 这两件事模型都能自己修正（补上下文 / 缩小范围），
 * 而按「最像的那一处」猜着改是绝不能做的。
 */
export function locateText(doc: ProseNode, needle: string): LocateResult {
  const trimmed = needle.trim()
  if (!trimmed) return { error: 'find 是空的：要给出正文里原本存在的那段文字。' }
  const flat = flatten(doc)
  if (!flat.text.trim()) return { error: '正文还是空的，没有可以替换的文字。' }

  const hay = collapse(flat.text)
  const nee = collapse(stripMarkdownMarkers(trimmed))
  if (!nee.text) return { error: 'find 里只有 Markdown 记号，去掉之后没有剩下任何文字。' }

  let first = -1
  let count = 0
  for (let at = hay.text.indexOf(nee.text); at >= 0; at = hay.text.indexOf(nee.text, at + 1)) {
    if (first < 0) first = at
    count += 1
    if (count > 1) break
  }
  if (count === 0) {
    return {
      error: '正文里找不到这段文字。find 必须是正文里原样存在的一段（纯文本即可，'
        + '不要带 ** # - 之类的 Markdown 记号，块与块之间用空行连接），'
        + '先调 page_read_context 重新核对再试。',
    }
  }
  if (count > 1) {
    return {
      error: '这段文字在正文里出现了不止一次，定位不唯一。'
        + '把 find 加长到能唯一定位的一段（带上前后句或所在段落），或者分几次、每次带上更具体的原文。',
    }
  }

  const hayStart = hay.map[first]
  const hayEnd = hay.map[first + nee.text.length - 1] + 1
  const head = flat.segments.find((segment) => hayStart >= segment.start && hayStart < segment.end)
  const tail = flat.segments.find((segment) => hayEnd > segment.start && hayEnd <= segment.end)
  if (!head || !tail) {
    return { error: '这段文字的起止点落在了段落分隔或媒体卡上，无法当作纯文字替换；请缩小 find 的范围。' }
  }
  return {
    range: {
      from: head.from + (hayStart - head.start),
      to: tail.from + (hayEnd - tail.start),
    },
  }
}

/**
 * 区间里是否夹着媒体卡/代码块/图片这类「文字之外的节点」。
 *
 * 跨段的 find 会匹配到「两段正文」，但这两段之间可能就夹着一张媒体卡 —— 替换掉整个区间
 * 等于把卡片静默删掉，而用户看到的是「改文字」。这种必须拒绝。
 */
export function hasNonTextNodeInside(doc: ProseNode, from: number, to: number): string | null {
  let found: string | null = null
  doc.nodesBetween(from, to, (node) => {
    if (found) return false
    if (NON_TEXT_BLOCKS.has(node.type.name) || (node.isAtom && !node.isText)) {
      found = node.type.name
      return false
    }
    return true
  })
  return found
}

/** 一段 Markdown 写回区间时要插入的内容：行内选区只取内联部分，块级选区取整个片段。 */
function toInsertable(ctx: Ctx, doc: ProseNode, from: number, to: number, markdown: string): Fragment | ProseNode {
  const parsed = ctx.get(parserCtx)(markdown)
  const $from = doc.resolve(from)
  const $to = doc.resolve(to)
  const inline = $from.parent === $to.parent && $from.parent.isTextblock
  if (!inline) return parsed.content
  const only = parsed.childCount === 1 ? parsed.firstChild : null
  return only?.isTextblock
    ? only.content
    // 选区只是段落里的一截时，块节点插不进段落中间，退回成单行文字。
    : doc.type.schema.text(parsed.textContent.replace(/\s*\n+\s*/g, ' '))
}

/**
 * 整篇替换前的核对：媒体卡在 Markdown 里是一条 `::media{...}` 指令。
 *
 * 整篇改写是「把全文抄一遍再润色文字」，指令抄漏一个、属性改错一个，那张卡就没了，
 * 而用户看到的是「润色了一下」。所以先数一遍这类节点的个数：改写结果里变少了就整单拒绝，
 * 让模型回去把这些位置标记原样保留。多了不算错（不拦「顺手补一张图」）。
 */
function missingNonTextNodes(original: ProseNode, next: ProseNode): string | null {
  const count = (root: ProseNode) => {
    const counts = new Map<string, number>()
    root.descendants((node) => {
      if (NON_TEXT_BLOCKS.has(node.type.name) || (node.isAtom && !node.isText)) {
        counts.set(node.type.name, (counts.get(node.type.name) ?? 0) + 1)
      }
      return true
    })
    return counts
  }
  const before = count(original)
  const after = count(next)
  for (const [name, expected] of before) {
    const actual = after.get(name) ?? 0
    if (actual < expected) {
      return `改写结果里 ${name} 从 ${expected} 个变成了 ${actual} 个，整篇替换会把它们删掉。`
        + '正文里的 ::media{...} 之类的位置标记要原样保留（一个字都别改），只润色文字部分。'
    }
  }
  return null
}

/**
 * 用一段 Markdown 替换**整篇**正文（整篇润色走这条路）。
 *
 * 与 `replaceRangeWithMarkdown` 的分工：那个改一段、能在段落中间退化成纯文字；
 * 这个换全文，必须走 Markdown 完整解析，媒体卡靠指令往返，故先核对数量。
 */
export function replaceDocumentWithMarkdown(ctx: Ctx, markdown: string): void {
  const view: EditorView = ctx.get(editorViewCtx)
  const parsed = ctx.get(parserCtx)(markdown)
  const lost = missingNonTextNodes(view.state.doc, parsed)
  if (lost) throw new Error(lost)
  view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, parsed.content).scrollIntoView())
}

/**
 * 用一段 Markdown 替换文档里的一个区间，整套动作是**一次事务**（一步撤销）。
 *
 * 由「AI 润色确认」和「AI 工具改稿确认」共用：两条链路对「怎么把文字写回去」的要求
 * 完全一致，分开写迟早会出现一条能保住加粗、另一条把加粗吃掉。
 */
export function replaceRangeWithMarkdown(ctx: Ctx, from: number, to: number, markdown: string): void {
  const view: EditorView = ctx.get(editorViewCtx)
  const content = toInsertable(ctx, view.state.doc, from, to, markdown)
  view.dispatch(view.state.tr.replaceWith(from, to, content).scrollIntoView())
}
