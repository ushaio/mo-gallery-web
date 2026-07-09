/**
 * 文档线性化与原文定位。
 *
 * Agent 的修改提案以"原文片段"标识位置，本模块负责：
 * 1. 把 ProseMirror 文档线性化为纯文本（段落间单个 '\n'），供 agent 阅读；
 * 2. 把提案的原文片段映射回文档位置区间，供 diff 确认后替换。
 * 两侧必须使用同一套线性化规则，否则 agent 复制的片段将无法定位。
 */

import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

interface TextSegment {
  /** 线性文本中的起始偏移 */
  start: number
  /** 线性文本中的结束偏移（不含） */
  end: number
  /** 该文本节点在文档中的位置 */
  pos: number
}

export interface DocLinearization {
  text: string
  segments: TextSegment[]
}

/** 线性化：文本节点原样拼接，相邻块级节点之间插入单个 '\n' */
export function linearizeDoc(doc: ProseMirrorNode): DocLinearization {
  let text = ''
  const segments: TextSegment[] = []
  let lastBlockStart: number | null = null

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true

    const $pos = doc.resolve(pos)
    const blockStart = $pos.before($pos.depth)
    if (lastBlockStart !== null && blockStart !== lastBlockStart) {
      text += '\n'
    }
    lastBlockStart = blockStart

    segments.push({ start: text.length, end: text.length + node.text.length, pos })
    text += node.text
    return true
  })

  return { text, segments }
}

function offsetToDocPos(segments: TextSegment[], offset: number, kind: 'start' | 'end'): number | null {
  for (const segment of segments) {
    const inSegment = kind === 'start'
      ? offset >= segment.start && offset < segment.end
      : offset > segment.start && offset <= segment.end
    if (inSegment) {
      return segment.pos + (offset - segment.start)
    }
  }

  // 偏移落在块分隔符 '\n' 上：起点取下一段起始，终点取上一段末尾
  if (kind === 'start') {
    const next = segments.find((segment) => segment.start >= offset)
    return next ? next.pos : null
  }
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].end <= offset) {
      return segments[i].pos + (segments[i].end - segments[i].start)
    }
  }
  return null
}

/** 在文档中精确定位一段线性化文本，返回可用于 TextSelection 的区间 */
export function findDocTextRange(doc: ProseMirrorNode, searchText: string): { from: number; to: number } | null {
  if (!searchText) return null
  const { text, segments } = linearizeDoc(doc)

  const index = text.indexOf(searchText)
  if (index === -1) return null
  // 出现多处时无法唯一定位，拒绝而不是改错地方
  if (text.indexOf(searchText, index + 1) !== -1) return null

  const from = offsetToDocPos(segments, index, 'start')
  const to = offsetToDocPos(segments, index + searchText.length, 'end')
  if (from === null || to === null || to <= from) return null
  return { from, to }
}
