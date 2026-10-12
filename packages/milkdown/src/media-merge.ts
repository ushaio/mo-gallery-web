import { NodeSelection, Plugin, PluginKey } from '@milkdown/kit/prose/state'
import type { Transaction } from '@milkdown/kit/prose/state'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import type { EditorView } from '@milkdown/kit/prose/view'
import { MEDIA_TILE_DRAG_TYPE, galleryEntryKey, isGalleryMedia, mergeMediaCards, normalizeMedia, splitGalleryTile } from './media'
import type { MediaCardData } from './media'

const mediaMergeKey = new PluginKey('mo-milkdown-media-merge')

/**
 * 正在被拖动的那张卡。
 *
 * 位置优先取 **拖动开始时** ProseMirror 记下的那个节点选区（`view.dragging.node`）——
 * 那是「用户抓起来的那张卡」的快照，拖动过程中当前选区怎么变都不影响它。
 * 拿不到才退回当前选区（媒体视图的 mousedown 会把卡片选成 NodeSelection）。
 * `dragging.node` 没进 prosemirror-view 的公开类型（`dragging` 只声明了 slice / move），
 * 所以这里补一个类型断言 —— prosemirror-drop-indicator 读同一个字段时也是这么做的。
 */
function draggingNode(view: EditorView): NodeSelection | null {
  const dragging = view.dragging as { node?: NodeSelection } | null
  return dragging?.node ?? null
}

function draggedCard(view: EditorView): { media: MediaCardData; from: number } | null {
  const selection = draggingNode(view) ?? view.state.selection
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'media_card') return null
  return { media: normalizeMedia(selection.node.attrs.media), from: selection.from }
}

interface MediaDropTarget { media: MediaCardData; pos: number; dom: HTMLElement }

interface MediaNodeEntry { dom: HTMLElement; pos: number }

/**
 * 命中测试的缓存：媒体卡 DOM → 文档位置，一次遍历取齐。
 *
 * 早先是 `positionOfDom` 按 DOM 现查位置 —— 一次整篇 `doc.descendants`，而绑带兜底
 * （见 dropTarget）要为**每一张卡**各查一次，于是单次命中测试就是「卡片数 × 文档长度」。
 * 命中测试跑在 `dragover` 上，而拖动期间 `dragover` 是连续高频事件：长文里几张拼图
 * 就足以把主线程打满，用户看到的就是一拖就卡死。
 *
 * 缓存按 `view.state.doc` 的身份失效：ProseMirror 每次改动都会换掉 doc 对象，
 * 一次拖动期间文档不变，于是整轮拖拽只付一次遍历。`padding` 一起缓存 ——
 * 读它的 `getComputedStyle` 是强制样式重算，比遍历还贵；它与 doc 同生命周期失效。
 */
interface MediaHitCache { doc: ProseNode; entries: MediaNodeEntry[]; padding: { left: number; right: number } }

const hitCaches = new WeakMap<EditorView, MediaHitCache>()

function mediaNodeIndex(view: EditorView): MediaNodeEntry[] {
  const entries: MediaNodeEntry[] = []
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'media_card') return
    const dom = view.nodeDOM(pos)
    if (dom instanceof HTMLElement) entries.push({ dom, pos })
  })
  return entries
}

function hitCache(view: EditorView): MediaHitCache {
  const cached = hitCaches.get(view)
  if (cached && cached.doc === view.state.doc) return cached
  const style = getComputedStyle(view.dom)
  const next: MediaHitCache = {
    doc: view.state.doc,
    entries: mediaNodeIndex(view),
    padding: { left: parseFloat(style.paddingLeft) || 0, right: parseFloat(style.paddingRight) || 0 },
  }
  hitCaches.set(view, next)
  return next
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
  const { entries } = hitCache(view)
  const start = event.target
  if (start instanceof Element) {
    const dom = start.closest('.milkdown-media-node')
    if (dom instanceof HTMLElement) {
      const hit = entries.find((entry) => entry.dom === dom)
      if (hit) return cardAt(view, hit.pos, hit.dom)
    }
  }
  const band = contentBand(view)
  if (event.clientX < band.left || event.clientX > band.right) return null
  for (const entry of entries) {
    const rect = entry.dom.getBoundingClientRect()
    if (event.clientY < rect.top || event.clientY > rect.bottom) continue
    return cardAt(view, entry.pos, entry.dom)
  }
  return null
}

/** 正文栏的横向范围：ProseMirror 自己的内容盒（左右各留一截内边距）。 */
function contentBand(view: EditorView): { left: number; right: number } {
  const rect = view.dom.getBoundingClientRect()
  const { padding } = hitCache(view)
  return { left: rect.left + padding.left, right: rect.right - padding.right }
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

/** 拖某一格时的 payload：源卡位置 + 第几格 + 那一格当时的标识（落点处再认一次，防串味）。 */
interface GalleryTileDrag { from: number; index: number; key: string }

/** 读 payload —— 不是「拖某一格」就返回 null（那是整卡拖动，走原有分支）。 */
function parseGalleryTileDrag(event: DragEvent): GalleryTileDrag | null {
  const raw = event.dataTransfer?.getData(MEDIA_TILE_DRAG_TYPE) ?? ''
  if (!raw) return null
  try {
    const { from, index, key } = JSON.parse(raw) as { from?: unknown; index?: unknown; key?: unknown }
    return typeof from === 'number' && Number.isInteger(from) && from >= 0
      && typeof index === 'number' && Number.isInteger(index) && index >= 0
      && typeof key === 'string' && key.length > 0
      ? { from, index, key }
      : null
  } catch { return null }
}

/** 是否正在拖某张拼图里的一格：dragover 里读不到 payload，只能看类型。 */
function isGalleryTileDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes(MEDIA_TILE_DRAG_TYPE)
}

/**
 * 这次拖格的 payload 副本，由媒体视图在 `dragstart` 时登记、拖拽收尾时清掉。
 *
 * 自定义 MIME 在个别 WebView（Windows 上的 WebView2 就在其中）里 `getData` 会返回空串，
 * 而 `dragover` 里照样看得见类型标记；payload 本来就是我们自己写下去的那一份，这时候
 * 直接用副本比再问一遍 dataTransfer 稳。
 */
let inFlightTileDrag: { view: EditorView; drag: GalleryTileDrag } | null = null

export function rememberTileDrag(view: EditorView, drag: GalleryTileDrag) {
  inFlightTileDrag = { view, drag }
}

export function forgetTileDrag(view: EditorView) {
  if (inFlightTileDrag?.view === view) inFlightTileDrag = null
}

/**
 * 这次拖拽的 payload：先读 dataTransfer，读不到时才回落到本视图登记的那一份 ——
 * 回落要求类型标记确实是 `MEDIA_TILE_DRAG_TYPE`，免得别的拖拽（拖文本、拖文件）误用残留。
 */
function resolveTileDrag(view: EditorView, event: DragEvent): GalleryTileDrag | null {
  const parsed = parseGalleryTileDrag(event)
  if (parsed) return parsed
  if (!isGalleryTileDrag(event)) return null
  const remembered = inFlightTileDrag
  return remembered && remembered.view === view ? remembered.drag : null
}

/**
 * 是否正在拖一整张「能并进拼图」的卡（图片卡 / 拼图 / 待上传占位卡）。
 *
 * 拖整卡时 ProseMirror 自己跑完了 dragstart，`view.dragging` 里就有这次拖拽的切片；
 * 拖某一格则走不到这里 —— 媒体视图在 dragstart 里 stopPropagation 了，ProseMirror 没有 dragging。
 * 切片是节点选区的内容，拖整卡时第一个子节点就是那张卡。
 */
function isGalleryCardDrag(view: EditorView, event: DragEvent): boolean {
  if (isGalleryTileDrag(event)) return false
  const dragging = view.dragging
  if (!dragging?.move) return false
  const node = dragging.slice.content.firstChild
  return node?.type.name === 'media_card' && isGalleryMedia(normalizeMedia(node.attrs.media).kind)
}

/**
 * 「正在拖媒体」的标记，挂在编辑器根上，只用来藏掉编辑器自己的落点指示线
 * （Crepe 的 drop-indicator 画的 `.milkdown-drop-indicator`）。
 *
 * 那条线说的是「把拖拽内容插到这里」，而拖媒体的真实语义有两种：并进某张卡（卡片上另有虚线框预告）、
 * 或者落进正文插成新的独立块。两条提示同时出现会互相矛盾 —— 所以拖格期间一律藏（dragstart 就挂上，
 * 见 media-plugin.tsx），拖整卡则只在「真要并进这张卡」的位置藏（由本文件的 dragover 按落点切换）。
 * 指示线由插件写成内联 display，所以只能从 visibility 这一侧压（CSS 里不写 !important）。
 */
export function setMediaDragMarker(view: EditorView, on: boolean) {
  view.dom.closest('.milkdown-editor')?.classList.toggle('is-media-dragging', on)
}

/**
 * 拖到正文（没落在图片族卡上）时的插入位置：取指针底下的那个节点，按指针在该节点上半 / 下半
 * 决定插在它前面还是后面。
 *
 * 用节点边界而不是 `posAtCoords` 给的原样位置：把图片卡塞进段落内部不是用户的本意，而
 * 「拖到某段 / 某个块上面、下面」的直觉正好就是这条。指针底下是节点 DOM 时用 `inside`
 * （ProseMirror 自己认「点到了哪个节点」也是用它），否则退回指针所在最内层块的上一层块。
 *
 * 位置按传进来的 `point` 算，不直接读 `event`：指针落在编辑器容器里、却不在 `view.dom` 上的
 * 那一片空白时，外面那层兜底（见 attachContainerDrop）会先把指针夹进 `view.dom` 的框内再调
 * 这里 —— 夹进去之后它就在正文末尾附近，于是「落在正文下方的空白」＝「放到正文末尾」。
 */
function dropPosition(view: EditorView, point: { left: number; top: number }): number | null {
  const found = view.posAtCoords(point)
  if (!found) return null
  const doc = view.state.doc
  const $pos = doc.resolve(found.pos)
  const before = found.inside >= 0 ? found.inside : $pos.depth > 0 ? $pos.before(1) : -1
  if (before < 0) return $pos.pos
  const node = doc.nodeAt(before)
  if (!node) return $pos.pos
  const dom = view.nodeDOM(before)
  const rect = dom instanceof HTMLElement ? dom.getBoundingClientRect() : null
  if (!rect || !rect.height) return $pos.pos
  return point.top < rect.top + rect.height / 2 ? before : before + node.nodeSize
}

/** 把抽走的那一格从源拼图上摘掉：还有剩就换成剩下的内容，一格不剩就整卡删掉。 */
function removeGalleryTile(transaction: Transaction, from: number, remainder: MediaCardData | null) {
  if (remainder) transaction.setNodeMarkup(from, undefined, { media: remainder })
  else transaction.delete(from, from + 1)
}

/**
 * 拖出拼图里的一格。
 *
 * - 落在别的图片族卡上：并进那张卡（落位同整卡拖动，可以落在某一格的左 / 右半边）；
 * - 落在自己这张拼图上：同一张拼图里调序；
 * - 落在正文或别的卡上：从拼图里拿出来，成为一张独立的图片卡。
 *
 * 三种落法都是「改落点 + 摘掉这一格」的一步事务：两张卡都是 atom 叶节点（nodeSize 恒为 1），
 * 同事务里的两次修改不会互相错位，整个操作也就只有一步撤销。
 *
 * payload 里的 `key` 对不上（拖动期间这一格被换掉了、或 payload 来自别的文档）就什么都不做，
 * 但仍然认下这次拖拽 —— 带上 payload 的拖动归这里管，不该再掉进 ProseMirror 的默认行为。
 *
 * 落点位置默认取指针本身；容器那层兜底（见 attachContainerDrop）会传一份夹进 `view.dom` 框内
 * 的坐标 —— 指针落在容器空白处时只有夹进去才有 ProseMirror 位置可算，见 dropPosition。
 */
function dropGalleryTile(
  view: EditorView,
  event: DragEvent,
  drag: GalleryTileDrag,
  point: { left: number; top: number } = { left: event.clientX, top: event.clientY },
): boolean {
  const node = view.state.doc.nodeAt(drag.from)
  const source = node?.type.name === 'media_card' ? normalizeMedia(node.attrs.media) : null
  const tile = source?.images?.[drag.index]
  const split = source && tile && galleryEntryKey(tile) === drag.key ? splitGalleryTile(source, drag.index) : null
  if (!source || !tile || !split) return true

  const target = dropTarget(view, event)
  const transaction = view.state.tr

  if (target && isGalleryMedia(target.media.kind)) {
    if (target.pos === drag.from) {
      // 同一张拼图内调序：先把这一格摘掉，落位要按「摘掉之后」的下标重算
      const images = (source.images ?? []).filter((_, at) => at !== drag.index)
      if (!images.length) return true
      const at = dropIndex(target, event, source.images?.length ?? 0)
      const insertAt = at > drag.index ? at - 1 : at
      if (insertAt === drag.index) return true
      transaction.setNodeMarkup(drag.from, undefined, { media: { ...source, images: [...images.slice(0, insertAt), tile, ...images.slice(insertAt)] } })
      view.dispatch(transaction)
      return true
    }
    const count = target.media.kind === 'gallery' ? target.media.images?.length ?? 0 : 1
    const merged = mergeMediaCards(target.media, split.extracted, dropIndex(target, event, count))
    if (!merged) return true
    transaction.setNodeMarkup(target.pos, undefined, { media: merged })
    removeGalleryTile(transaction, drag.from, split.remainder)
    view.dispatch(transaction.scrollIntoView())
    return true
  }

  const pos = dropPosition(view, point)
  if (pos === null) return true
  removeGalleryTile(transaction, drag.from, split.remainder)
  transaction.insert(transaction.mapping.map(pos), view.state.schema.nodes.media_card.create({ media: split.extracted }))
  view.dispatch(transaction.scrollIntoView())
  return true
}

/**
 * 媒体卡的两种拖拽：整张卡拖到另一张图片族卡上并成拼图，以及把拼图里的一格拖出去。
 *
 * 整卡拖动仍交给 ProseMirror 自己跑（slice / dragging 全在它手里，这里只用传进来的 `moved`
 * 判断「拖的是文档里已有的节点」，再决定并进落点那张卡）—— 于是「拖到画布别处 = 移动这个块」
 * 依旧是 ProseMirror 的行为。
 *
 * 拖某一格则整条链路都由这里接手：媒体视图在 dragstart 时 `stopPropagation` 并写上自己的
 * payload，ProseMirror 收不到那次 dragstart（它的处理器会清掉 dataTransfer、并把拖动源当成
 * 整张卡），也就不会把整张拼图当成被拖的节点。
 */
/**
 * 拖某一格的落点接管入口 —— **视图级 props（`editorViewOptionsCtx.handleDrop`）要在所有插件之前先调它**。
 *
 * 为什么必须抢在最前面：Crepe 内核带 `prosemirror-drop-indicator`，它的 handleDrop 语义是
 * 「把这次拖拽的切片插到最近的落点」。拖一格时那个切片是浏览器给图片的默认拖拽数据
 * （`<img src=…>`），于是它会插入一份副本、原来的格子还在 —— 用户看到的就是「复制，而不是移动」。
 * 视图自身的 props 在 `EditorView.someProp` 里先于所有 state 插件被问到（见 prosemirror-view），
 * 所以入口放在这里才能稳定压过它。返回 true 即「这次拖拽归我管」，交给本插件处理。
 *
 * 本插件的 handleDrop 同样认这条 payload（宿主没接这个入口时的兜底），语义一致。
 */
export function handleMediaTileDrop(view: EditorView, event: DragEvent): boolean {
  if (!view.editable) return false
  const drag = resolveTileDrag(view, event)
  if (!drag) return false
  forgetTileDrag(view)
  return dropGalleryTile(view, event, drag)
}

/**
 * 整张卡拖到另一张图片族卡上：并成拼图。**视图级 props（`editorViewOptionsCtx.handleDrop`）
 * 同样要在所有插件之前先调它** —— 理由和拖格那条一模一样，而且这条更硬：
 *
 * Crepe 的 Cursor 特性在**构造函数里**就 `use` 了 `prosemirror-drop-indicator`（见 Crepe 源码的
 * `loadFeature`），而宿主是在 `new Crepe(...)` 之后才 `.use(createMediaMergePlugin())`，
 * 于是那个插件的 handleDrop 排在本插件之前。它只要指针附近找得到块边界就返回 true，
 * 把这次拖拽的切片插到那条边界上 —— 「拖到另一张图上并成拼图」就被它做成了「把这张卡挪到那个边界」。
 * 它唯一会罢手的情况是落点正好落在拖动源自己的范围里（`isDraggingToItself`），
 * 所以只靠插件那条路时，并得上还是并不上取决于松手时指针离哪条边界更近 —— 时灵时不灵。
 *
 * 返回 true 即「这次拖拽归我管」；拖动源不是图片族卡、或落点不是图片族卡时返回 false，
 * 交回后面的插件与 ProseMirror 自己 ——「拖到画布别处 = 移动这个块」仍是它们的行为。
 */
export function handleMediaCardDrop(view: EditorView, event: DragEvent, moved: boolean): boolean {
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
}

/**
 * 拖拽期间「松手会并进哪张卡」。拖某一格时落点上的任何媒体卡都算（落在自己那张拼图上就是调序，
 * 也是有效落法），拖整张卡时只有图片族才算 —— 并进播放器 / 链接卡是做不到的。
 */
function mergeTargetDom(view: EditorView, event: DragEvent): HTMLElement | null {
  const target = dropTarget(view, event)
  if (!target) return null
  if (isGalleryTileDrag(event)) return target.dom
  if (!isGalleryCardDrag(view, event) || !isGalleryMedia(target.media.kind)) return null
  // 拖到自己身上什么都不做（见 handleMediaCardDrop 的同一个判定），别预告成一个有效落点
  return draggedCard(view)?.from === target.pos ? null : target.dom
}

/**
 * 编辑器最外层容器（`.milkdown-editor`；取不到就退到滚动区）。
 *
 * 每次事件现场取、不缓存：本插件的 `view` 钩子和 milkdown 自己那个「把 view.dom 挪进
 * `.milkdown` 里」的视图容器插件谁先跑不保证，注册那一刻 `view.dom` 未必已经在容器里。
 */
function editorContainer(view: EditorView): HTMLElement | null {
  const found = view.dom.closest('.milkdown-editor') ?? view.dom.closest('.milkdown-editor-scroll')
  return found instanceof HTMLElement ? found : null
}

/**
 * 编辑器容器这一层的落点兜底（只认「拖某一格」）。
 *
 * ProseMirror 把自己那些拖放监听全挂在 `view.dom`（`.ProseMirror`）上，而正文那一栏居中、
 * 高度只到「内容 + 内边距」（`min-height: 360px`）：正文短的时候它下方那一大片、以及左右两侧
 * 的留白都不属于 `view.dom`。那些地方没人 `preventDefault` 掉 `dragover`，浏览器于是连
 * `drop` 都不派发 —— 把拼图里的一格拖到拼图下方的空白松手，用户看到的就是「什么也没发生」。
 *
 * 所以在这里补一层：挂在文档上、事件现场再认容器（容器的挂载时机见 editorContainer），
 * 只在指针落在容器里、但**落在 `view.dom` 的框外**、这次事件又确实没人处理
 * （`defaultPrevented` 为假）、并且确实是「拖某一格」时才接手。
 *
 * 「框外」这条是必须的：框内的落点 ProseMirror 自己都收得到，真没被处理只有一种可能 ——
 * NodeView 的 `stopEvent` 把事件让给了更里层的交互元素（有 photoId 的图片本体就渲染成按钮），
 * 那是刻意的交接，不该在这里用一份夹过的坐标顶替（夹过的坐标会把「并进这张卡」误当成
 * 「放进正文末尾」）。
 */
export function attachContainerDrop(view: EditorView): { destroy: () => void } {
  const doc = view.dom.ownerDocument

  /** 指针是否落在编辑器容器里；不在就整条兜底让路（应用里别处也有拖放）。 */
  const insideContainer = (event: DragEvent) => {
    const container = editorContainer(view)
    const target = event.target
    return Boolean(container && target instanceof Node && container.contains(target))
  }

  /** 指针是否落在 `view.dom` 框外 —— 框外那一片才是这一层要补的缺口。 */
  const outsideEditorDom = (event: DragEvent) => {
    const rect = view.dom.getBoundingClientRect()
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
  }

  /** 把指针夹进 `view.dom` 的框内：容器上那一片空白没有 ProseMirror 位置可言，夹进去按正文末尾算。 */
  const clampToEditor = (event: DragEvent) => {
    const rect = view.dom.getBoundingClientRect()
    return {
      left: Math.min(Math.max(event.clientX, rect.left + 1), rect.right - 1),
      top: Math.min(Math.max(event.clientY, rect.top + 1), rect.bottom - 1),
    }
  }

  const dragover = (event: DragEvent) => {
    if (!view.editable || event.defaultPrevented || !isGalleryTileDrag(event)) return
    if (!insideContainer(event) || !outsideEditorDom(event)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    setMediaDragMarker(view, true)
  }
  const drop = (event: DragEvent) => {
    if (!view.editable || event.defaultPrevented) return
    if (!insideContainer(event) || !outsideEditorDom(event)) return
    const drag = resolveTileDrag(view, event)
    if (!drag) return
    event.preventDefault()
    forgetTileDrag(view)
    dropGalleryTile(view, event, drag, clampToEditor(event))
  }
  // 指针离开容器（`relatedTarget` 落在容器外，或被拖出窗口时是 null）：落点预告跟着收掉。
  const dragleave = (event: DragEvent) => {
    const next = event.relatedTarget
    if (next instanceof Node && editorContainer(view)?.contains(next)) return
    setMediaDragMarker(view, false)
  }
  // 收尾：拖出窗口松手、拖动源被删掉这类情况下 drop 到不了这里，靠它把残留清干净。
  const dragend = () => {
    forgetTileDrag(view)
    setMediaDragMarker(view, false)
  }

  doc.addEventListener('dragover', dragover)
  doc.addEventListener('drop', drop)
  doc.addEventListener('dragleave', dragleave)
  doc.addEventListener('dragend', dragend)
  return {
    destroy() {
      doc.removeEventListener('dragover', dragover)
      doc.removeEventListener('drop', drop)
      doc.removeEventListener('dragleave', dragleave)
      doc.removeEventListener('dragend', dragend)
    },
  }
}

export function createMediaMergePlugin(): Plugin {
  /** 当前描着落点虚线的卡（拖拽期间的高亮，松手 / 结束都要清掉）。 */
  let highlighted: HTMLElement | null = null
  const clearHighlight = () => {
    highlighted?.classList.remove('is-drop-target')
    highlighted = null
  }

  return new Plugin({
    key: mediaMergeKey,
    // 容器那层的落点兜底（拖某一格专用）：ProseMirror 的监听只挂在 view.dom 上，编辑区里
    // view.dom 之外那一大片空白收不到 dragover、也就等不到 drop —— 见 attachContainerDrop。
    view: (view) => attachContainerDrop(view),
    props: {
      handleDOMEvents: {
        // 新一次拖拽开始时把编辑器扫干净：两次拖拽不会重叠，这一刻不该有任何落点预告留着。
        // 收尾事件（dragend）在「拖出窗口松手」「拖动源那张卡被删掉」这类情况下都到不了 view.dom，
        // 按记录逐个清（clearHighlight）会漏，直接按类名扫一遍最省心 —— 一次拖拽只付一次。
        // 拖格走的是另一条路（媒体视图在 dragstart 里 stopPropagation，这里根本收不到），
        // 它那段的标记由 media-plugin.tsx 自己挂、自己收。
        dragstart: (view) => {
          view.dom.querySelectorAll('.is-drop-target').forEach((element) => element.classList.remove('is-drop-target'))
          highlighted = null
          setMediaDragMarker(view, false)
          // 上一次拖格的残留（拖出窗口松手之类收尾事件没回来的情况）：新一次拖拽开始了，
          // 别再让那份旧 payload 有机会被认成「这次要拖的那一格」。
          forgetTileDrag(view)
          return false
        },
        // 拖媒体期间给它底下的那张卡描一圈虚线：「松手会并进哪张卡」在松手前就看得见；
        // 指针离开所有卡（即会拆成独立图片卡 / 只是把块挪个位置）时高亮自然消失。
        // 同时按落点切换「藏 drop-indicator」的标记：只有真要并进这张卡时才藏（见 setMediaDragMarker）。
        // 返回 false 不改动 ProseMirror 自己的 dragover（drop 事件要它 preventDefault 才发得出来）。
        dragover: (view, event) => {
          const tileDrag = isGalleryTileDrag(event)
          const dom = mergeTargetDom(view, event)
          // 拖格时标记在 dragstart 就挂上了（整段拖拽都藏），这里只管高亮，别去动它
          if (!tileDrag) setMediaDragMarker(view, Boolean(dom))
          if (dom !== highlighted) {
            highlighted?.classList.remove('is-drop-target')
            dom?.classList.add('is-drop-target')
            highlighted = dom
          }
          return false
        },
        // 指针彻底离开编辑器（relatedTarget 落在编辑器之外，或被拖出窗口时是 null）：
        // 落点已经不存在了，预告必须跟着收掉 —— 否则虚线框会停在最后掠过的那张卡上，
        // 一路留到松手（松手还未必传得回来，见下面 drop 那条）。
        dragleave: (view, event) => {
          const next = event.relatedTarget
          if (!(next instanceof Node) || !view.dom.contains(next)) { clearHighlight(); setMediaDragMarker(view, false) }
          return false
        },
        // 松手：这次拖拽结束了，预告一律收掉。**不能只靠 dragend**：并成拼图会把拖动源那张卡
        // 从文档里删掉，源的 DOM 随之脱离文档 —— 之后浏览器派发的 dragend 落在一个没有祖先的
        // 节点上，传不到 view.dom，靠它收尾就会漏掉这一次（虚线框留在并好的那张卡上，
        // 用户看到的就是「没碰它，却有一圈虚线」）。drop 事件来自指针位置、从落点那张卡冒上来，
        // 与拖动源还在不在无关；这里只清理，不参与落点判定（真正的 handleDrop 在后面）。
        drop: (view) => { clearHighlight(); setMediaDragMarker(view, false); return false },
        dragend: (view) => { clearHighlight(); setMediaDragMarker(view, false); return false },
      },
      // 宿主没接视图级入口时的兜底（语义与 handleMediaCardDrop 一致）。注意只要 Crepe 的
      // drop-indicator 在插件表里排在前面，这条路对整卡拖动就走不到 —— 见 handleMediaCardDrop。
      handleDrop: (view, event, _slice, moved) => {
        clearHighlight()
        if (handleMediaTileDrop(view, event)) return true
        return handleMediaCardDrop(view, event, moved)
      },
    },
  })
}
