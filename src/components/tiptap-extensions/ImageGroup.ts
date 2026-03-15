import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import ImageGroupNodeView from './ImageGroupNodeView'

export const ImageGroup = Node.create({
  name: 'imageGroup',
  group: 'block',
  content: 'image+',
  draggable: true,
  isolating: true,

  addAttributes() {
    return {
      align: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-align') || null,
        renderHTML: (attributes) => {
          if (!attributes.align) return {}
          return { 'data-align': attributes.align }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="image-group"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'image-group' }, HTMLAttributes), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageGroupNodeView)
  },

  addCommands() {
    return {
      // No custom commands needed - grouping is handled by the drop plugin
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('imageGroupDrop'),
        props: {
          handleDrop(view, event, slice, moved) {
            if (!event) return false

            // Only handle if we're dragging an image
            const draggingImage = slice?.content?.firstChild?.type.name === 'image'
            if (!draggingImage) return false

            const draggedImageNode = slice.content.firstChild
            if (!draggedImageNode) return false

            // Find drop position
            const coordinates = { left: event.clientX, top: event.clientY }
            const pos = view.posAtCoords(coordinates)
            if (!pos) return false

            const $pos = view.state.doc.resolve(pos.pos)

            // Check what's at the drop position
            // Case 1: Dropping onto an existing imageGroup
            const parentNode = $pos.parent
            if (parentNode.type.name === 'imageGroup') {
              if (parentNode.childCount >= 3) return false // max 3

              // Find the end of the imageGroup to insert there
              const parentPos = $pos.before($pos.depth)
              const insertPos = parentPos + parentNode.nodeSize - 1 // before closing tag

              const tr = view.state.tr

              // If moved (dragged from within editor), delete the original
              if (moved) {
                // The original node was already removed by ProseMirror's default drag handling
                // We just need to insert at the right position
              }

              tr.insert(insertPos, draggedImageNode)
              view.dispatch(tr)
              event.preventDefault()
              return true
            }

            // Case 2: Dropping near a standalone image - create a new group
            // Find the closest image node at the resolved position
            let targetImagePos: number | null = null
            let targetImageNode = null

            // Check if the node at pos is an image or adjacent to one
            const nodeAfter = $pos.nodeAfter
            const nodeBefore = $pos.nodeBefore

            if (nodeAfter?.type.name === 'image') {
              targetImagePos = pos.pos
              targetImageNode = nodeAfter
            } else if (nodeBefore?.type.name === 'image') {
              targetImagePos = pos.pos - nodeBefore.nodeSize
              targetImageNode = nodeBefore
            } else {
              // Check parent level
              for (let d = $pos.depth; d >= 0; d--) {
                const node = $pos.node(d)
                if (node.type.name === 'image') {
                  targetImagePos = $pos.before(d)
                  targetImageNode = node
                  break
                }
              }
            }

            // Also check: if dropping next to an imageGroup, add to it
            if (nodeAfter?.type.name === 'imageGroup' && nodeAfter.childCount < 3) {
              const groupPos = pos.pos
              const insertPos = groupPos + 1 // after opening tag
              const tr = view.state.tr
              tr.insert(insertPos, draggedImageNode)
              view.dispatch(tr)
              event.preventDefault()
              return true
            }

            if (nodeBefore?.type.name === 'imageGroup' && nodeBefore.childCount < 3) {
              const groupPos = pos.pos - nodeBefore.nodeSize
              const insertPos = groupPos + nodeBefore.nodeSize - 1 // before closing
              const tr = view.state.tr
              tr.insert(insertPos, draggedImageNode)
              view.dispatch(tr)
              event.preventDefault()
              return true
            }

            if (!targetImageNode || targetImagePos === null) return false

            // Don't group with yourself
            if (targetImageNode === draggedImageNode) return false

            // Create the imageGroup node wrapping both images
            const imageGroupType = view.state.schema.nodes.imageGroup
            if (!imageGroupType) return false

            const groupNode = imageGroupType.create(
              null,
              [targetImageNode, draggedImageNode],
            )

            // Replace the target image with the group
            const tr = view.state.tr
            tr.replaceWith(targetImagePos, targetImagePos + targetImageNode.nodeSize, groupNode)
            view.dispatch(tr)
            event.preventDefault()
            return true
          },
        },
      }),
      // Auto-dissolve groups with only 1 child
      new Plugin({
        key: new PluginKey('imageGroupAutoDissolve'),
        appendTransaction(transactions, oldState, newState) {
          const tr = newState.tr
          let modified = false

          newState.doc.descendants((node, pos) => {
            if (node.type.name === 'imageGroup' && node.childCount <= 1) {
              if (node.childCount === 1) {
                // Replace group with its single child
                tr.replaceWith(pos, pos + node.nodeSize, node.firstChild!)
              } else {
                // Empty group - delete it
                tr.delete(pos, pos + node.nodeSize)
              }
              modified = true
              return false // stop descending into this node
            }
          })

          return modified ? tr : null
        },
      }),
    ]
  },
})

export default ImageGroup
