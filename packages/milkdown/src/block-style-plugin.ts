import { $node } from '@milkdown/kit/utils'
import { blockStyleDomAttributes, normalizeBlockAlign } from './block-style'

export const blockStyleSchema = $node('block_style', () => ({
  group: 'block',
  content: 'block+',
  defining: true,
  attrs: { align: { default: 'left' } },
  parseDOM: [{
    tag: 'div[data-milkdown-align]',
    getAttrs: (dom) => ({ align: normalizeBlockAlign(dom.getAttribute('data-milkdown-align')) }),
  }],
  toDOM: (node) => ['div', blockStyleDomAttributes(node.attrs.align), 0],
  parseMarkdown: {
    match: (node) => node.type === 'containerDirective' && node.name === 'block-style',
    runner: (state, node, type) => {
      const attributes = node.attributes && typeof node.attributes === 'object' ? node.attributes : {}
      state.openNode(type, { align: normalizeBlockAlign('align' in attributes ? attributes.align : undefined) })
      state.next(node.children)
      state.closeNode()
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'block_style',
    runner: (state, node) => {
      state.openNode('containerDirective', undefined, { name: 'block-style', attributes: { align: normalizeBlockAlign(node.attrs.align) } })
      state.next(node.content)
      state.closeNode()
    },
  },
}))
