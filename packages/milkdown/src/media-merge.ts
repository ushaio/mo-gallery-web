import { NodeSelection, Plugin, PluginKey } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { isGalleryMedia, mergeMediaCards, normalizeMedia } from './media'
import type { MediaCardData } from './media'

const mediaMergeKey = new PluginKey('mo-milkdown-media-merge')

/** 正在被拖动的那张卡：位置取自节点选区（媒体视图 mousedown 时已把卡片选成 NodeSelection）。 */
function draggedCard(view: EditorView): { media: MediaCardData; from: number } | null {
  const selection = view.state.selection
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'media_card') return null
  return { media: normalizeMedia(selection.node.attrs.media), from: selection.from }
}

interface MediaDropTarget { media: MediaCardData; pos: number; dom: HTMLElement }

/** nodeView 的根 DOM → 文档位置（拿不到就是 -1）。 */
function positionOfDom(view: EditorView, dom: HTMLElement): number {
  let pos = -1
  view.state.doc.descendants((node, offset) => {
    if (pos >= 0) return false
    if (node.type.name !== 'media_card' || view.nodeDOM(offset) !== dom) return undefined
    pos = offset
    return false
  })
  return pos >= 0 && view.state.doc.nodeAt(pos) ? pos : -1
}

function cardAt(view: EditorView, pos: number, dom: HTMLElement): MediaDropTarget | null {
  const node = view.state.doc.nodeAt(pos)
  return node ? { media: normalizeMedia(node.attrs.media), pos, dom } : null
}

/**
 * 落点所在的媒体卡：用 nodeView 的根 DOM 反查文档位置。
 *
 * 不用 `posAtCoords` 的「在线框左半边还是右半边」判定：那张卡的图片可能是 contain 留边的，
 * 视觉中线与命中区并不重合；直接问「鼠标底下是哪个 nodeView」才和用户看到的一致。
 *
 * 图片卡的 nodeView 外层已收窄到图片宽度（见 style.css），于是卡片本体之外、同一行的那片空白
 * 不再是 DOM 命中区 —— 可「把这张图拖到那张图旁边」正是并排的主路径（收窄前那整块也是外层
 * 这个 div 的范围）。所以补一条按行带的兜底：指针纵向落在某张卡的框内、横向落在正文栏内，
 * 就算落在这张卡上。拖到画布别处仍返回 null，交回 ProseMirror 默认的「移动块」行为。
 */
function dropTarget(view: EditorView, event: DragEvent): MediaDropTarget | null {
  const start = event.target
  if (start instanceof Element) {
    const dom = start.closest('.milkdown-media-node')
    if (dom instanceof HTMLElement) {
      const pos = positionOfDom(view, dom)
      if (pos >= 0) return cardAt(view, pos, dom)
    }
  }
  const band = contentBand(view)
  if (event.clientX < band.left || event.clientX > band.right) return null
  for (const dom of Array.from(view.dom.querySelectorAll<HTMLElement>('.milkdown-media-node'))) {
    const rect = dom.getBoundingClientRect()
    if (event.clientY < rect.top || event.clientY > rect.bottom) continue
    const pos = positionOfDom(view, dom)
    if (pos >= 0) return cardAt(view, pos, dom)
  }
  return null
}

/** 正文栏的横向范围：ProseMirror 自己的内容盒（左右各留一截内边距）。 */
function contentBand(view: EditorView): { left: number; right: number } {
  const rect = view.dom.getBoundingClientRect()
  const style = getComputedStyle(view.dom)
  return { left: rect.left + (parseFloat(style.paddingLeft) || 0), right: rect.right - (parseFloat(style.paddingRight) || 0) }
}

/** 拖放点落在目标里第几格之前：贴近某一格左半边就插在它前面，否则插在它后面。 */
function dropIndex(target: { dom: HTMLElement }, event: DragEvent, count: number): number {
  const tiles = Array.from(target.dom.querySelectorAll<HTMLElement>('.milkdown-media-photo'))
  if (!tiles.length) {
    const rect = target.dom.getBoundingClientRect()
    return event.clientX < rect.left + rect.width / 2 ? 0 : count
  }
  let nearest = 0
  let distance = Number.POSITIVE_INFINITY
  tiles.forEach((tile, index) => {
    const rect = tile.getBoundingClientRect()
    const dx = event.clientX - (rect.left + rect.width / 2)
    const dy = event.clientY - (rect.top + rect.height / 2)
    const next = dx * dx + dy * dy
    if (next < distance) { distance = next; nearest = index }
  })
  const rect = tiles[nearest].getBoundingClientRect()
  return event.clientX < rect.left + rect.width / 2 ? nearest : nearest + 1
}

/**
 * 把一张图片卡拖到另一张图片卡 / 拼图上：并成一张拼图（画廊卡）。
 *
 * 只有图片族能并（图片卡 / 画廊卡 / 待上传占位卡）—— 播放器、链接、文件卡有自己的结构，
 * 并进拼图会丢掉头部与说明。落点决定插入位置，拖到画布其它地方则返回 false，交回 ProseMirror
 * 默认的「移动块」行为。
 *
 * 两张卡都是 atom 叶节点 ⇒ nodeSize 恒为 1 ⇒「替换落点 + 删除源」在同一事务里不会互相错位，
 * 也因此整个拼接只有一步撤销。
 */
export function createMediaMergePlugin(): Plugin {
  return new Plugin({
    key: mediaMergeKey,
    props: {
      handleDrop: (view, event, _slice, moved) => {
        if (!view.editable || !moved) return false
        const source = draggedCard(view)
        if (!source || !isGalleryMedia(source.media.kind)) return false
        if (view.state.doc.nodeAt(source.from)?.type.name !== 'media_card') return false
        const target = dropTarget(view, event)
        if (!target || target.pos === source.from || !isGalleryMedia(target.media.kind)) return false
        const count = target.media.kind === 'gallery' ? target.media.images?.length ?? 0 : 1
        const merged = mergeMediaCards(target.media, source.media, dropIndex(target, event, count))
        if (!merged) return false
        const transaction = view.state.tr
        transaction.setNodeMarkup(target.pos, undefined, { media: merged })
        transaction.delete(source.from, source.from + 1)
        view.dispatch(transaction.scrollIntoView())
        return true
      },
    },
  })
}
