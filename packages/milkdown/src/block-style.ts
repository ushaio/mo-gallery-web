import { walkMarkdown } from './media'
import type { MarkdownTree } from './media'

export function normalizeBlockAlign(value: unknown): 'left' | 'center' | 'right' | 'justify' {
  return value === 'center' || value === 'right' || value === 'justify' ? value : 'left'
}

export function blockStyleDomAttributes(align: unknown): Record<string, string> {
  const value = normalizeBlockAlign(align)
  return { class: 'milkdown-block-style', 'data-milkdown-align': value, style: `text-align: ${value}` }
}

export function remarkBlockStyles() {
  return (tree: MarkdownTree) => {
    walkMarkdown(tree, (node) => {
      if (node.type !== 'containerDirective' || node.name !== 'block-style') return
      node.data = { ...node.data, hName: 'div', hProperties: blockStyleDomAttributes(node.attributes?.align) }
    })
  }
}
