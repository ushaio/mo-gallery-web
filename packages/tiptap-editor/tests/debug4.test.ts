import { setupDom, createEditor, keydown, setTextSelection } from './helpers/editor-harness'
setupDom()
const h = createEditor('<ul><li>one</li></ul><p></p><ul><li>two</li></ul>')
const empties: number[] = []
h.editor.state.doc.descendants((node, pos) => { if (node.type.name === 'paragraph' && node.content.size === 0) empties.push(pos) })
setTextSelection(h, empties[0] + 1)
// simulate the handler
const { $from } = h.editor.state.selection
const paragraph = $from.parent
const parent = $from.node($from.depth - 1)
const paragraphIndex = $from.index($from.depth - 1)
const previousNode = parent.child(paragraphIndex - 1)
const paragraphStart = $from.before($from.depth)
const previousListStart = paragraphStart - previousNode.nodeSize
console.log('previousNode type:', previousNode.type.name)
console.log('previousListStart:', previousListStart, 'paragraphStart:', paragraphStart)
let lastTextEnd = -1
previousNode.descendants((node, pos) => { if (node.isText) lastTextEnd = pos + node.nodeSize })
console.log('relative lastTextEnd:', lastTextEnd, 'abs:', previousListStart + lastTextEnd)
console.log('doc at that abs pos:', h.editor.state.doc.resolve(previousListStart + lastTextEnd).parent.type.name)
console.log('doc.textBetween:', JSON.stringify(h.editor.state.doc.textBetween(previousListStart + lastTextEnd - 3, previousListStart + lastTextEnd + 2)))
h.editor.destroy()
