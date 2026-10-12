import { createRoot } from 'react-dom/client'
import remarkDirective from 'remark-directive'
import { $node, $remark, $view } from '@milkdown/kit/utils'
import { NodeSelection } from '@milkdown/kit/prose/state'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { MediaCard } from './MediaCard'
import { MEDIA_TILE_DRAG_TYPE, galleryEntryKey, mediaFromAttributes, mediaToAttributes, normalizeMedia } from './media'
import { forgetTileDrag, rememberTileDrag, setMediaDragMarker } from './media-merge'
import type { MediaAlign, MediaCardData, MediaUrlResolver } from './media'

export const mediaDirective = $remark('mo-media-directive', () => remarkDirective)

export const mediaSchema = $node('media_card', () => ({
  group: 'block',
  atom: true,
  draggable: true,
  isolating: true,
  attrs: { media: { default: { kind: 'image' } } },
  parseDOM: [{
    tag: 'figure[data-milkdown-media]',
    getAttrs: (dom) => {
      try { return { media: normalizeMedia(JSON.parse((dom as HTMLElement).getAttribute('data-milkdown-media') ?? '{}')) } }
      catch { return false }
    },
  }],
  toDOM: (node) => {
    const media = normalizeMedia(node.attrs.media)
    return ['figure', { 'data-milkdown-media': JSON.stringify(media) }, ['figcaption', media.caption || media.title || media.src || media.kind]]
  },
  parseMarkdown: {
    match: (node) => node.type === 'leafDirective' && node.name === 'media',
    runner: (state, node, type) => { state.addNode(type, { media: mediaFromAttributes(node.attributes) }) },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'media_card',
    runner: (state, node) => {
      state.addNode('leafDirective', [], undefined, { name: 'media', attributes: mediaToAttributes(normalizeMedia(node.attrs.media)) })
    },
  },
}))

/**
 * 指针底下那一格拼图（以及它在网格里的序号）。
 *
 * 事件目标优先（拼图格自己带 draggable，浏览器会把 dragstart 打在它身上），拿不到就按坐标再
 * 反查一次 —— 各家浏览器对「dragstart 的 target 是拖动源还是最内层元素」的说法并不一致，
 * 坐标兜底能保证「从图片上起拖」一定认成拖这一格。网格之外的区域（说明文字等）返回 null：
 * 那是整张卡的拖拽。
 */
function tileUnderPointer(dom: HTMLElement, event: DragEvent): { el: HTMLElement; index: number } | null {
  const grid = dom.querySelector<HTMLElement>('.milkdown-media-grid')
  if (!grid) return null
  const target = event.target instanceof Element ? event.target : null
  const hit = target?.closest('.milkdown-media-photo') ?? document.elementFromPoint(event.clientX, event.clientY)?.closest('.milkdown-media-photo')
  const tile = hit instanceof HTMLElement && hit.parentElement === grid ? hit : null
  const index = tile ? Array.from(grid.children).indexOf(tile) : -1
  return tile && index >= 0 ? { el: tile, index } : null
}

interface MediaViewOptions {
  resolveUrl?: MediaUrlResolver
  /**
   * 按 uploadId 现取占位卡的本地预览图（blob: / 本地资源库缩略图）。
   *
   * **刻意不落进文档**：这两类 URL 都是会话级的（blob 跨重启失效，资源库缩略图带 session 与缓存键），
   * 存进正文会在下次打开时裂图，所以只在渲染时查一次。
   */
  resolveUploadPreview?: (uploadId: string) => string | undefined
  language?: 'zh' | 'en'
  onEdit: (media: MediaCardData, getPos: () => number | undefined) => void
}

export function createMediaView(getOptions: () => MediaViewOptions, refreshers: Set<() => void>) {
  return $view(mediaSchema, () => (initialNode, view, getPos) => {
    let node = initialNode
    const dom = document.createElement('div')
    dom.className = 'milkdown-media-node'
    dom.contentEditable = 'false'
    const root = createRoot(dom)

    const remove = () => {
      const pos = getPos()
      if (pos === undefined || !view.editable) return
      view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize).scrollIntoView())
      view.focus()
    }

    /**
     * 改对齐：直接落到文档上（可撤销、会触发自动保存），不走媒体设置对话框 ——
     * 对齐是「摆哪边」这类一眼能看见结果的排版操作，值得一次点击。
     * 与 remove 一样在 NodeView 里就地实现：它手上就有 view 与 getPos，不必再让编辑器组件转一手。
     */
    const setAlign = (align: MediaAlign) => {
      const pos = getPos()
      if (pos === undefined || !view.editable) return
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { media: { ...normalizeMedia(node.attrs.media), align } }))
      view.focus()
    }

    const render = () => {
      const options = getOptions()
      const media = normalizeMedia(node.attrs.media)
      root.render(<MediaCard
        media={media}
        language={options.language}
        resolveUrl={options.resolveUrl}
        // 占位卡（kind='upload'）与拼图里的待传格都没有 src，靠 uploadId 现取本地预览图。
        // 编辑器要看到上传状态，故不传 showUploadStatus（默认 true）。
        resolveUploadPreview={options.resolveUploadPreview}
        // 拼图里每一格单独可拖：编辑器里传 true，预览 / 发布侧不传（见 MediaCard）
        draggableTiles={view.editable}
        onEdit={view.editable ? () => options.onEdit(media, getPos) : undefined}
        onRemove={view.editable ? remove : undefined}
        // 对齐入口只在编辑器里出现：预览 / 发布侧 onAlignChange 不传，工具栏那一格直接不渲染
        onAlignChange={view.editable ? setAlign : undefined}
      />)
    }
    refreshers.add(render)
    render()

    dom.addEventListener('mousedown', (event) => {
      if (!(event.target instanceof HTMLElement) || event.target.closest('button, a, video, audio, iframe')) return
      const pos = getPos()
      if (pos !== undefined) view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)))
    })

    /**
     * 拼图里的一格可以再被拖出去（拖到别的卡上并进去、拖到同一张拼图里调序、拖到正文里还原成
     * 独立图片卡 —— 三个落点的语义都在 media-merge.ts）。
     *
     * 这里只做两件事：写上 payload，并且不让 ProseMirror 看见这次 dragstart —— 它的 dragstart
     * 处理器会先清掉 dataTransfer、再按「拖的是整张卡」写自己的 slice（于是拖动源变成整张拼图），
     * stopPropagation 之后它根本收不到这个事件。整张卡的拖拽因此只剩「从卡片其它区域起拖」
     * （说明文字、格子之间的空隙）这一条路，仍然可用。
     */
    let draggingTile: HTMLElement | null = null
    const endTileDrag = () => {
      draggingTile?.classList.remove('is-dragging')
      draggingTile = null
      // payload 的副本同步作废（见 media-merge.ts 的 resolveTileDrag / forgetTileDrag）。
      forgetTileDrag(view)
      // 藏掉编辑器自己的落点指示线：那条线（Crepe 的 drop-indicator）说的是「把内容插到这里」，
      // 与「拖一格」的两种语义（并进某张卡 = 虚线框预告；落进正文 = 插成独立新图）摆在一起会互相矛盾。
      // 拖格期间整段都藏，所以标记在 dragstart 挂上、这里收掉（拖整卡则是按落点切换，见 media-merge.ts）。
      setMediaDragMarker(view, false)
    }
    dom.addEventListener('dragstart', (event) => {
      if (!view.editable || !event.dataTransfer) return
      const tile = tileUnderPointer(dom, event)
      if (!tile) return
      const pos = getPos()
      const image = normalizeMedia(node.attrs.media).images?.[tile.index]
      const key = image ? galleryEntryKey(image) : ''
      if (pos === undefined || !key) return
      event.stopPropagation()
      event.dataTransfer.setData(MEDIA_TILE_DRAG_TYPE, JSON.stringify({ from: pos, index: tile.index, key }))
      event.dataTransfer.effectAllowed = 'move'
      endTileDrag()
      // payload 的另一份副本（见 media-merge.ts 的 resolveTileDrag）：个别 WebView 里松手那一刻
      // 自定义 MIME 的 getData 会返回空串，那份副本就是那时的兜底。必须写在 endTileDrag 之后，
      // 否则刚记下就被它清掉。
      rememberTileDrag(view, { from: pos, index: tile.index, key })
      draggingTile = tile.el
      tile.el.classList.add('is-dragging')
      setMediaDragMarker(view, true)
    })
    // 松手 / 拖到编辑器外 / 被 Esc 取消都要收掉源格的高亮；下一次 dragstart 也会先清一次兜底
    dom.addEventListener('dragend', endTileDrag)

    return {
      dom,
      update: (nextNode: ProseNode) => {
        if (nextNode.type !== node.type) return false
        node = nextNode
        render()
        return true
      },
      selectNode: () => dom.classList.add('ProseMirror-selectednode'),
      deselectNode: () => dom.classList.remove('ProseMirror-selectednode'),
      stopEvent: (event: Event) => event.target instanceof Element && Boolean(event.target.closest('button, a, video, audio, iframe')),
      ignoreMutation: () => true,
      destroy: () => {
        refreshers.delete(render)
        // The editor may be destroyed during React's own unmount commit.
        queueMicrotask(() => root.unmount())
      },
    }
  })
}
