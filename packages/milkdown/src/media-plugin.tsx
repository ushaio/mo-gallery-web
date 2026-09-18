import { createRoot } from 'react-dom/client'
import remarkDirective from 'remark-directive'
import { $node, $remark, $view } from '@milkdown/kit/utils'
import { NodeSelection } from '@milkdown/kit/prose/state'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { MediaCard } from './MediaCard'
import { mediaFromAttributes, mediaToAttributes, normalizeMedia } from './media'
import type { MediaCardData, MediaUrlResolver } from './media'

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

    const render = () => {
      const options = getOptions()
      const media = normalizeMedia(node.attrs.media)
      root.render(<MediaCard
        media={media}
        language={options.language}
        resolveUrl={options.resolveUrl}
        // 占位卡（kind='upload'）没有 src，靠 uploadId 现取本地预览图
        uploadPreviewUrl={media.kind === 'upload' && media.uploadId
          ? options.resolveUploadPreview?.(media.uploadId)
          : undefined}
        onEdit={view.editable ? () => options.onEdit(media, getPos) : undefined}
        onRemove={view.editable ? remove : undefined}
      />)
    }
    refreshers.add(render)
    render()

    dom.addEventListener('mousedown', (event) => {
      if (!(event.target instanceof HTMLElement) || event.target.closest('button, a, video, audio, iframe')) return
      const pos = getPos()
      if (pos !== undefined) view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)))
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
        refreshers.delete(render)
        // The editor may be destroyed during React's own unmount commit.
        queueMicrotask(() => root.unmount())
      },
    }
  })
}
