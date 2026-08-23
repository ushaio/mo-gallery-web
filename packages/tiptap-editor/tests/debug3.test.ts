import { setupDom, createEditor, keydown, setTextSelection, docShape } from './helpers/editor-harness'
setupDom()
const h = createEditor('<ul><li>one</li></ul><p></p><ul><li>two</li></ul>')
const empties: number[] = []
h.editor.state.doc.descendants((node, pos) => { if (node.type.name === 'paragraph' && node.content.size === 0) empties.push(pos) })
setTextSelection(h, empties[0] + 1)
console.log('before:', docShape(h))
keydown(h, 'Delete')
console.log('after:', docShape(h))
const sel = h.editor.state.selection.from
console.log('sel:', sel)
console.log('text at sel:', JSON.stringify(h.editor.state.doc.textBetween(Math.max(0, sel-3), Math.min(sel+3, h.editor.state.doc.content.size))))
h.editor.destroy()
