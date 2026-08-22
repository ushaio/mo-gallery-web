/**
 * P0 behavior matrix for non-list blocks and history operations.
 *
 * This is intentionally headless: each case describes a document, a cursor
 * or selection state, an action, and the resulting ProseMirror shape.
 */
import assert from 'node:assert/strict'
import {
  setupDom,
  createEditor,
  cursorInText,
  setTextSelection,
} from './helpers/editor-harness'

setupDom()

// Paragraph: Enter at the end creates a sibling paragraph.
{
  const h = createEditor('<p>one</p>')
  cursorInText(h, 'one', 3)
  assert.equal(h.editor.commands.splitBlock(), true)
  assert.equal(h.editor.state.doc.toString(), 'doc(paragraph("one"), paragraph)')
  h.editor.destroy()
}

// Heading: Enter exits into a plain paragraph after the heading.
{
  const h = createEditor('<h2>title</h2>')
  cursorInText(h, 'title', 5)
  assert.equal(h.editor.commands.splitBlock(), true)
  assert.equal(h.editor.state.doc.toString(), 'doc(heading("title"), paragraph, paragraph)')
  h.editor.destroy()
}

// Quote: Enter creates another paragraph inside the same quote.
{
  const h = createEditor('<blockquote><p>quote</p></blockquote>')
  cursorInText(h, 'quote', 5)
  assert.equal(h.editor.commands.splitBlock(), true)
  assert.equal(h.editor.state.doc.toString(), 'doc(blockquote(paragraph("quote"), paragraph), paragraph)')
  h.editor.destroy()
}

// Code block: Enter is handled by the code-block keymap and inserts a line.
{
  const h = createEditor('<pre><code>const x = 1</code></pre>')
  cursorInText(h, 'const x = 1', 11)
  h.editor.commands.insertContent('\n')
  assert.equal(h.editor.state.doc.textContent, 'const x = 1\n')
  h.editor.destroy()
}

// Selection deletion: Backspace removes only the selected text.
{
  const h = createEditor('<p>abcd</p>')
  setTextSelection(h, 2, 4)
  assert.equal(h.editor.commands.deleteSelection(), true)
  assert.equal(h.editor.state.doc.textContent, 'ad')
  h.editor.destroy()
}

// History: one user transaction is undoable and redoable as one unit.
{
  const h = createEditor('<p>a</p>')
  cursorInText(h, 'a', 1)
  h.editor.commands.insertContent('b')
  assert.equal(h.editor.state.doc.textContent, 'ab')
  assert.equal(h.editor.commands.undo(), true)
  assert.equal(h.editor.state.doc.textContent, 'a')
  assert.equal(h.editor.commands.redo(), true)
  assert.equal(h.editor.state.doc.textContent, 'ab')
  h.editor.destroy()
}

console.log('✓ P0 editor behavior matrix')
