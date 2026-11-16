import { createRoot } from 'react-dom/client'
import remarkDirective from 'remark-directive'
import { $node, $remark, $view } from '@milkdown/kit/utils'
import { NodeSelection } from '@milkdown/kit/prose/state'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { MediaCard } from './MediaCard'
import { MEDIA_TILE_DRAG_TYPE, galleryEntryKey, isGalleryMedia, mediaFromAttributes, mediaToAttributes, normalizeMedia } from './media'
import { applyCardDrop, forgetTileDrag, rememberTileDrag, setMediaDragMarker } from './media-merge'
import type { MediaAlign, MediaCardData, MediaLinkPreviewResolver, MediaUrlResolver } from './media'

export const mediaDirective = $remark('mo-media-directive', () => remarkDirective)

export const mediaSchema = $node('media_card', () => ({
  group: 'block',
  atom: true,
  /**
   * 整卡**不开** HTML5 原生拖拽。
   *
   * WebView2 的合成宿主（`CoreWebView2CompositionController`）把页面里的原生拖拽实现成宿主
   * 进程里的 OLE `DoDragDrop` 会话：起拖那一刻鼠标捕获归 OLE，之后「松手」不再作为
   * `WM_LBUTTONUP` 回到应用窗口。只要这次会话收不了尾，整窗就再也收不到鼠标消息——点不动、
   * 但渲染进程照旧活着（不烧 CPU、CDP 能求值）。
   *
   * 这正是「点图片卡 / 点对齐方式后卡死」的表现：卡住时页面里那串元素（`IMG` 及其祖先）一直
   * 带着 `:active`，说明浏览器认为左键还按着，于是之后所有 click 都发不出来。媒体卡的浮层按钮
   * 和四角缩放手柄全在 NodeView 的 dom 内部，按下去稍微一动就会起一次整卡拖拽，所以「在文本和
   * 图片之间来回切换」迟早会踩中。
   *
   * 注意：**光靠这个 `draggable: false` 拦不住**。节点被 NodeSelection 选中时 ProseMirror 会
   * 自己发 `dragstart` 并写 `text/html`，与这个属性无关；真正的闸门是下面 `dragstart` 监听里
   * 的 `preventDefault()`。
   *
   * 搬运整张卡改走 **pointer 手势**（见本文件下方「整卡 pointer 拖拽」一段），全程不发起原生
   * HTML5 拖拽；也可以继续用块手柄（`⠿`，Crepe BlockEdit 自带）。拼图格的拖拽不受影响
   * （`MediaCard` 里每格自己带 `draggable`，见 `media-merge.ts`）。
   */
  draggable: false,
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
  /** 按 URL 现取网页信息，供尚未存过元信息的老链接卡补齐显示（见 MediaCard 的同名 prop）。 */
  resolveLinkPreview?: MediaLinkPreviewResolver
  language?: 'zh' | 'en'
  onEdit: (media: MediaCardData, getPos: () => number | undefined) => void
  /**
   * AI 改这张图。宿主没开通改图能力时**不传** —— 那样 MediaCard 连按钮都不渲染，
   * 预览 / 发布侧更是天然没有（那边根本不走 NodeView）。
   */
  onAiEdit?: (media: MediaCardData, getPos: () => number | undefined) => void
}

export function createMediaView(getOptions: () => MediaViewOptions, refreshers: Set<() => void>) {
  return $view(mediaSchema, () => (initialNode, view, getPos) => {
    let node = initialNode
    const dom = document.createElement('div')
    dom.className = 'milkdown-media-node'
    dom.contentEditable = 'false'
    const root = createRoot(dom)

    /**
     * 整卡 pointer 拖拽的状态。见文件下方 `pointerdown/move/up` 那一段。
     * 之所以不用原生 HTML5 拖拽：WebView2 的合成宿主会把页面原生拖拽做成宿主进程里的
     * OLE `DoDragDrop` 会话，会话收不了尾时整窗收不到鼠标消息（mediaSchema.draggable 的注释）。
     */
    let pointerDrag: {
      startX: number
      startY: number
      pointerId: number
      from: number
      width: number
      height: number
      active: boolean
      ghost: HTMLElement | null
    } | null = null

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

    /**
     * 改宽度（拖动角柄松手 / 键盘调整时调一次，null 表示还原原始尺寸）。
     *
     * 与 setAlign 同一条路：**直接落到文档上**，于是可撤销、也会触发自动保存。
     * 拖动过程中的连续变化由 MediaCard 就地改 DOM，这里只收「一次拖完的那个值」——
     * 每个 pointermove 都 dispatch 会在撤销栈里留下几十条记录、也会让自动保存连发。
     */
    const setWidth = (width: number | null) => {
      const pos = getPos()
      if (pos === undefined || !view.editable) return
      const media: MediaCardData = { ...normalizeMedia(node.attrs.media) }
      if (width && Number.isFinite(width) && width > 0) media.width = Math.round(width)
      else delete media.width
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { media }))
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
        resolveLinkPreview={options.resolveLinkPreview}
        // 拼图里每一格单独可拖：编辑器里传 true，预览 / 发布侧不传（见 MediaCard）
        draggableTiles={view.editable}
        onEdit={view.editable ? () => options.onEdit(media, getPos) : undefined}
        onAiEdit={view.editable && options.onAiEdit ? () => options.onAiEdit?.(media, getPos) : undefined}
        onRemove={view.editable ? remove : undefined}
        // 对齐入口只在编辑器里出现：预览 / 发布侧 onAlignChange 不传，工具栏那一格直接不渲染
        onAlignChange={view.editable ? setAlign : undefined}
        // 缩放手柄同理：预览 / 发布侧不传 onWidthChange，四个角柄一点痕迹都不留
        onWidthChange={view.editable ? setWidth : undefined}
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
      // 正在用 pointer 手势拖整卡：原生 dragstart 一律掐掉并且不让它冒到 ProseMirror，
      // 否则 WebView2 会起 OLE 拖拽会话（正是整窗卡死的根因）。整卡搬运由 pointer 逻辑自己完成。
      if (pointerDrag?.active) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      /**
       * 正在拖角柄缩放：把这次拖拽整个掐掉。
       *
       * dragstart 打在 NodeView 外层（它带 draggable="true"），**不是**手柄按钮上 ——
       * 手柄自己写的 onDragStart / draggable={false} 都收不到也拦不住，只有这里能拦。
       * 不拦的话，按住角柄一移动就会被浏览器认成「拖走这张卡」，缩放变成搬运。
       * 标记由 media-resize.tsx 在 pointerdown 时写上、松手时清掉。
       */
      if (dom.querySelector('[data-media-resizing]')) {
        event.preventDefault()
        return
      }
      /**
       * 整卡拖拽一律掐掉。
       *
       * 只把 schema 的 `draggable` 关掉是不够的：节点一旦被 NodeSelection 选中（点一下卡片就是
       * 这个状态），ProseMirror 会自己发一次 `dragstart` 并往 dataTransfer 里写 `text/html`，
       * 完全绕开 `draggable` 属性。而在 WebView2 的合成宿主下，任何原生拖拽都会变成宿主进程里的
       * OLE `DoDragDrop` 会话；会话收不了尾时整窗就再也收不到鼠标消息——页面里那串元素会一直带着
       * `:active`，之后所有 click 都发不出来，而渲染进程照旧活着（不烧 CPU、CDP 能求值）。
       *
       * 所以这里必须无条件拦：除了拼图格（下面那条分支，自己的 payload 与落点语义）之外，
       * 任何从媒体卡起的拖拽都不放行。搬运整张卡改走块手柄（`⠿`，Crepe BlockEdit 自带）。
       */
      const tile = tileUnderPointer(dom, event)
      if (!tile) {
        event.preventDefault()
        return
      }
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

    /* ───────────── 整卡 pointer 拖拽（WebView2 安全，不走原生 HTML5 拖拽） ─────────────
     *
     * 原生 HTML5 整卡拖拽在 Desktop 的 WebView2 合成宿主里会被做成宿主进程的 OLE `DoDragDrop`
     * 会话，收不了尾时整窗再也收不到鼠标消息（见 mediaSchema.draggable 的说明）。所以整卡的
     * 「拖动改位置 / 拖到另一张图上并成拼图」改成 pointer 手势自己实现：
     *   - 按在卡上（浮层按钮 / 缩放手柄 / 链接等交互元素除外）后移动超过阈值 ⇒ 起拖；
     *   - 松手时按落点结算：落到另一张图片族卡上 = 并成拼图；落到正文 / 空白 = 移动该块。
     * 拼图里按到某一格仍交给格子自己的原生拖拽（拖出 / 同图调序），这里不接管。
     */
    const DRAG_THRESHOLD = 4
    let suppressClickUntil = 0
    const isInteractiveTarget = (target: EventTarget | null) =>
      target instanceof Element && Boolean(target.closest('.milkdown-media-overlay, .milkdown-media-actions, .milkdown-media-align-panel, .milkdown-media-resize, a, video, audio, iframe'))

    const cardElementAt = (x: number, y: number): HTMLElement | null => {
      const hit = document.elementFromPoint(x, y)
      const card = hit instanceof Element ? hit.closest('.milkdown-media-node') : null
      return card instanceof HTMLElement && card !== dom ? card : null
    }
    const clearDropTargets = () => {
      document.querySelectorAll('.milkdown-media-node.is-drop-target').forEach((el) => el.classList.remove('is-drop-target'))
    }

    const cleanupPointerDrag = (state: NonNullable<typeof pointerDrag>) => {
      dom.classList.remove('is-dragging')
      document.body.classList.remove('is-media-card-dragging')
      clearDropTargets()
      setMediaDragMarker(view, false)
      state.ghost?.remove()
      // 兜底：视图在拖动途中被重渲染 / 卸载时，state 里那个虚影节点可能已经不在 DOM 里，
      // 而 body 上还留着另一份；按类名扫一遍，保证任何残留的拖拽虚影都被清掉。
      document.querySelectorAll('.milkdown-media-drag-ghost').forEach((el) => el.remove())
    }

    const detachPointerListeners = () => {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('pointercancel', onPointerCancel)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return
      if (!pointerDrag.active) {
        const dx = event.clientX - pointerDrag.startX
        const dy = event.clientY - pointerDrag.startY
        if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return
        pointerDrag.active = true
        dom.classList.add('is-dragging')
        document.body.classList.add('is-media-card-dragging')
        setMediaDragMarker(view, true)
        const ghost = document.createElement('div')
        ghost.className = 'milkdown-media-drag-ghost'
        ghost.style.width = pointerDrag.width + 'px'
        ghost.style.height = pointerDrag.height + 'px'
        document.body.appendChild(ghost)
        pointerDrag.ghost = ghost
      }
      if (pointerDrag.ghost) {
        pointerDrag.ghost.style.transform = `translate(${event.clientX - pointerDrag.width / 2}px, ${event.clientY - pointerDrag.height / 2}px)`
      }
      clearDropTargets()
      const card = cardElementAt(event.clientX, event.clientY)
      const kind = card?.querySelector('figure')?.getAttribute('data-media-kind')
      if (card && kind && isGalleryMedia(kind as MediaCardData['kind'])) card.classList.add('is-drop-target')
      event.preventDefault()
    }

    const onPointerUp = (event: PointerEvent) => {
      if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return
      const state = pointerDrag
      pointerDrag = null
      detachPointerListeners()
      if (!state.active) return
      suppressClickUntil = performance.now() + 350
      cleanupPointerDrag(state)
      const dropped = applyCardDrop(view, state.from, {
        clientX: event.clientX,
        clientY: event.clientY,
        target: document.elementFromPoint(event.clientX, event.clientY),
      })
      if (dropped) view.focus()
    }

    const onPointerCancel = (event: PointerEvent) => {
      if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return
      const state = pointerDrag
      pointerDrag = null
      detachPointerListeners()
      if (state.active) cleanupPointerDrag(state)
    }

    // 拖完立刻跟上來的 click 不该再被当成「点开这张图」
    dom.addEventListener('click', (event) => {
      if (performance.now() < suppressClickUntil) {
        event.preventDefault()
        event.stopPropagation()
      }
    }, true)

    dom.addEventListener('pointerdown', (event) => {
      if (!view.editable || event.button !== 0 || !event.isPrimary) return
      if (isInteractiveTarget(event.target)) return
      const from = getPos()
      if (from === undefined) return
      const media = normalizeMedia(node.attrs.media)
      // 拼图里按到某一格 ⇒ 交给格子自己的原生拖拽（拖出 / 同图调序），这里不接管
      if (media.kind === 'gallery' && event.target instanceof Element && event.target.closest('.milkdown-media-photo')) return
      const rect = dom.getBoundingClientRect()
      pointerDrag = {
        startX: event.clientX,
        startY: event.clientY,
        pointerId: event.pointerId,
        from,
        width: rect.width,
        height: rect.height,
        active: false,
        ghost: null,
      }
      document.addEventListener('pointermove', onPointerMove)
      document.addEventListener('pointerup', onPointerUp)
      document.addEventListener('pointercancel', onPointerCancel)
    })

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
        detachPointerListeners()
        if (pointerDrag) {
          cleanupPointerDrag(pointerDrag)
          pointerDrag = null
        }
        refreshers.delete(render)
        // The editor may be destroyed during React's own unmount commit.
        queueMicrotask(() => root.unmount())
      },
    }
  })
}
