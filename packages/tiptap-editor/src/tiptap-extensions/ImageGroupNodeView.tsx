'use client'

import { NodeViewWrapper, NodeViewContent, type ReactNodeViewProps } from '@tiptap/react'

export function ImageGroupNodeView({ node, selected }: ReactNodeViewProps) {
  const align = (node.attrs.align as string) || null

  const wrapperClassName = align === 'center'
    ? 'image-group-wrapper flex gap-2 mx-auto max-w-full'
    : align === 'right'
      ? 'image-group-wrapper flex gap-2 ml-auto max-w-full'
      : 'image-group-wrapper flex gap-2 max-w-full'

  return (
    <NodeViewWrapper
      className={wrapperClassName}
      data-type="image-group"
      style={{
        boxShadow: selected ? '0 0 0 2px hsl(var(--primary) / 0.3)' : undefined,
        borderRadius: '0.5rem',
        padding: '0.25rem',
      }}
    >
      <NodeViewContent className="image-group-content flex w-full gap-2 [&>*]:min-w-0 [&>*]:flex-1" />
    </NodeViewWrapper>
  )
}

export default ImageGroupNodeView
