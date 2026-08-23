import { setupDom, createEditor, keydown, setTextSelection, docShape, compactHtml } from './helpers/editor-harness'
setupDom()

// Issue 1: Delete between two lists
console.log('=== Issue 1: Delete between two lists ===')
const h1 = createEditor('<ul><li>one</li></ul><p></p><ul><li>two</li></ul>')
// Cursor in empty paragraph between lists
const empties: number[] = []
h1.editor.state.doc.descendants((node, pos) => { if (node.type.name === 'paragraph' && node.content.size === 0) empties.push(pos) })
// The middle empty paragraph is the one between lists
for (const p of empties) {
  const parent = h1.editor.state.doc.resolve(p + 1).node(-1)
  console.log('empty p at', p, 'parent:', parent?.type.name)
}
setTextSelection(h1, empties[0] + 1)
console.log('before:', compactHtml(h1.editor.getHTML()))
keydown(h1, 'Delete')
console.log('after Delete:', compactHtml(h1.editor.getHTML()))
console.log('sel:', h1.editor.state.selection.from)
h1.editor.destroy()

// Issue 2: Backspace on empty nested row
console.log('\n=== Issue 2: Backspace on empty nested row ===')
const h2 = createEditor('<ul><li>one<ul><li>two</li><li></li></ul></li></ul>')
const empties2: number[] = []
h2.editor.state.doc.descendants((node, pos) => { if (node.type.name === 'paragraph' && node.content.size === 0) empties2.push(pos) })
setTextSelection(h2, empties2[0] + 1)
console.log('before:', compactHtml(h2.editor.getHTML()))
keydown(h2, 'Backspace')
console.log('after 1st Backspace:', compactHtml(h2.editor.getHTML()))
keydown(h2, 'Backspace')
console.log('after 2nd Backspace:', compactHtml(h2.editor.getHTML()))
console.log('doc shape:', docShape(h2))
h2.editor.destroy()
