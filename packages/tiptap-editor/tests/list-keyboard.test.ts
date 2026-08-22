/**
 * Typora 对齐：列表键盘交互行为测试。
 *
 * Target behaviors (Typora-aligned):
 * 1. Enter → new item same level.
 * 2. Enter on empty last item → exit list to paragraph.
 * 3. Backspace at start of list row:
 *    - Empty nested row → first Backspace hides marker (blank indented line);
 *      second Backspace deletes the empty row.
 *    - Empty top-level row → lift to paragraph.
 *    - Non-empty nested row → lift to parent list.
 *    - Non-empty top-level row → convert to paragraph.
 * 4. Tab → sink, Shift+Tab → lift.
 * 5. "- " / "1. " on fresh empty row → nested sub-list.
 * 6. Adjacent same-type lists merge.
 * 7. "- " / "1. " at doc start → creates list (input rule).
 */
import assert from 'node:assert/strict'
import {
  setupDom,
  createEditor,
  keydown,
  textInput,
  cursorInText,
  cursorAtStartOfText,
  setTextSelection,
  docShape,
  hasHiddenMarker,
} from './helpers/editor-harness'
import type { TestEditor } from './helpers/editor-harness'

setupDom()

function cursorInEmptyParagraph(h: TestEditor, nth = 0): number {
  const empties: number[] = []
  h.editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' && node.content.size === 0) empties.push(pos)
  })
  const t = empties[nth]
  assert.ok(t !== undefined, `expected ${nth + 1} empty paragraph(s), found ${empties.length}`)
  setTextSelection(h, t + 1)
  return t + 1
}

// ─── 1. Enter on non-empty item ───────────────────────────────────────────
{
  const h = createEditor('<ul><li>one</li></ul>')
  cursorInText(h, 'one', 3)
  keydown(h, 'Enter')
  assert.equal(
    docShape(h),
    'doc(bulletList(listItem(paragraph("one")), listItem(paragraph)))',
    'Enter at end of a bullet item creates a new empty bullet row',
  )
  h.editor.destroy()
}

{
  const h = createEditor('<ol><li>one</li></ol>')
  cursorInText(h, 'one', 3)
  keydown(h, 'Enter')
  assert.equal(
    docShape(h),
    'doc(orderedList(listItem(paragraph("one")), listItem(paragraph)))',
    'Enter at end of an ordered item creates a new empty ordered row',
  )
  h.editor.destroy()
}

// ─── 2. Enter on empty item at list end → exit list ─────────────────────
{
  const h = createEditor('<ul><li>one</li><li></li></ul>')
  cursorInEmptyParagraph(h)
  keydown(h, 'Enter')
  assert.equal(
    docShape(h),
    'doc(bulletList(listItem(paragraph("one"))), paragraph)',
    'Enter on an empty trailing list item exits the list to a plain paragraph',
  )
  h.editor.destroy()
}

// ─── 3a. Backspace on empty NESTED LAST row → hide marker (first) ────────
{
  const h = createEditor('<ul><li>one<ul><li>nested</li><li></li></ul></li></ul>')
  cursorInEmptyParagraph(h)
  keydown(h, 'Backspace')
  const html = h.editor.getHTML()
  assert.ok(hasHiddenMarker(html), 'first Backspace hides the marker (blank indented line)')
  h.editor.destroy()
}

// 3a-2. Second Backspace → delete the empty row
{
  const h = createEditor('<ul><li>one<ul><li>nested</li><li></li></ul></li></ul>')
  cursorInEmptyParagraph(h)
  keydown(h, 'Backspace')
  keydown(h, 'Backspace')
  // The empty row is deleted; "nested" stays as the only nested item.
  // The trailing paragraph from TrailingNode may appear.
  const shape = docShape(h)
  assert.ok(!shape.includes('paragraph), listItem(paragraph)') &&
    !shape.includes('listItem(paragraph), paragraph'),
    'empty row deleted: ' + shape)
  h.editor.destroy()
}

// ─── 3b. Backspace on empty NESTED MIDDLE row → hide marker ─────────────
{
  const h = createEditor('<ul><li>one<ul><li>child</li><li></li><li>after</li></ul></li></ul>')
  cursorInEmptyParagraph(h)
  keydown(h, 'Backspace')
  assert.ok(
    hasHiddenMarker(h.editor.getHTML()),
    'first Backspace hides the marker for a middle empty row',
  )
  h.editor.destroy()
}

// ─── 3c. Backspace on empty TOP-LEVEL row → turns into paragraph ────────
{
  const h = createEditor('<p>before</p><ul><li></li></ul>')
  cursorInEmptyParagraph(h)
  keydown(h, 'Backspace')
  assert.equal(
    docShape(h),
    'doc(paragraph("before"), paragraph)',
    'Backspace on an empty top-level list item turns it into a plain paragraph',
  )
  h.editor.destroy()
}

// ─── 3d. Backspace at start of NESTED NON-EMPTY row → lift one level ────
{
  const h = createEditor('<ul><li>one<ul><li>nested</li></ul></li></ul>')
  cursorAtStartOfText(h, 'nested')
  keydown(h, 'Backspace')
  assert.equal(
    docShape(h),
    'doc(bulletList(listItem(paragraph("one")), listItem(paragraph("nested"))))',
    'Backspace at the start of a nested item promotes it to the parent list',
  )
  h.editor.destroy()
}

// ─── 3e. Backspace at start of TOP-LEVEL non-empty item → paragraph ─────
{
  const h = createEditor('<ul><li>one</li><li>two</li></ul>')
  cursorAtStartOfText(h, 'two')
  keydown(h, 'Backspace')
  assert.equal(
    docShape(h),
    'doc(bulletList(listItem(paragraph("one"))), paragraph("two"))',
    'Backspace at the start of a top-level item turns it into a paragraph',
  )
  h.editor.destroy()
}

// ─── 3f. Backspace on a deeply nested item lifts one level per press ─────
{
  const h = createEditor(
    '<ul><li>A<ul><li>B<ul><li>C</li></ul></li></ul></li></ul>',
  )
  cursorAtStartOfText(h, 'C')
  keydown(h, 'Backspace')
  assert.equal(
    docShape(h),
    'doc(bulletList(listItem(paragraph("A"), bulletList(listItem(paragraph("B")), listItem(paragraph("C"))))))',
    'first Backspace lifts a deeply nested item to its immediate parent list',
  )
  keydown(h, 'Backspace')
  assert.equal(
    docShape(h),
    'doc(bulletList(listItem(paragraph("A"), bulletList(listItem(paragraph("B")))), listItem(paragraph("C"))))',
    'second Backspace lifts the item to the top-level list',
  )
  keydown(h, 'Backspace')
  assert.equal(
    docShape(h),
    'doc(bulletList(listItem(paragraph("A"), bulletList(listItem(paragraph("B"))))), paragraph("C"))',
    'third Backspace exits the list',
  )
  h.editor.destroy()
}

// ─── 4. Tab → sink, Shift+Tab → lift ────────────────────────────────────
{
  const h = createEditor('<ul><li>one</li><li>two</li></ul>')
  cursorInText(h, 'two', 3)
  keydown(h, 'Tab')
  assert.equal(
    docShape(h),
    'doc(bulletList(listItem(paragraph("one"), bulletList(listItem(paragraph("two"))))))',
    'Tab on the second item sinks it under the first',
  )
  h.editor.destroy()
}

{
  const h = createEditor('<ul><li>one<ul><li>two</li></ul></li></ul>')
  cursorInText(h, 'two', 3)
  keydown(h, 'Tab', { shiftKey: true })
  assert.equal(
    docShape(h),
    'doc(bulletList(listItem(paragraph("one")), listItem(paragraph("two"))))',
    'Shift+Tab on a nested item lifts it to the parent list',
  )
  h.editor.destroy()
}

// ─── 5. Type "- " / "1. " on empty row → nested sub-list ─────────────────
{
  const h = createEditor('<ul><li>one</li><li></li></ul>')
  cursorInEmptyParagraph(h)
  textInput(h, '- ')
  assert.equal(
    docShape(h),
    'doc(bulletList(listItem(paragraph("one"), bulletList(listItem(paragraph)))))',
    'Typing "- " on a fresh empty row creates a nested bullet under the previous item',
  )
  h.editor.destroy()
}

{
  const h = createEditor('<ul><li>one</li><li></li></ul>')
  cursorInEmptyParagraph(h)
  textInput(h, '1. ')
  assert.equal(
    docShape(h),
    'doc(bulletList(listItem(paragraph("one"), orderedList(listItem(paragraph)))))',
    'Typing "1. " on a fresh empty row creates a nested ordered list under the previous item',
  )
  h.editor.destroy()
}

// ─── 6. Adjacent same-type lists merge ──────────────────────────────────
{
  const h = createEditor('<ul><li>one</li></ul><ul><li>two</li></ul>')
  cursorInText(h, 'two', 1)
  // A no-op transaction lets MergeAdjacentLists run.
  setTextSelection(h, h.editor.state.selection.from)
  assert.equal(
    docShape(h),
    'doc(bulletList(listItem(paragraph("one")), listItem(paragraph("two"))))',
    'Two adjacent bullet lists merge into one',
  )
  h.editor.destroy()
}

// ─── 6b. Delete between adjacent lists removes the spacer and joins them ─
{
  const h = createEditor('<ul><li>one</li></ul><p></p><ul><li>two</li></ul>')
  cursorInEmptyParagraph(h)
  keydown(h, 'Delete')
  assert.equal(
    docShape(h),
    'doc(bulletList(listItem(paragraph("one")), listItem(paragraph("two"))))',
    'Delete on a blank spacer joins adjacent lists',
  )
  h.editor.destroy()
}

// ─── 6c. Tab on plain text indents, Shift+Tab removes one indent unit ─────
{
  const h = createEditor('<p>text</p>')
  cursorInText(h, 'text', 4)
  keydown(h, 'Tab')
  assert.equal(h.editor.state.doc.textContent, 'text\t', 'Tab inserts a literal indentation unit')
  h.editor.destroy()
}

{
  const h = createEditor('<p>text\t</p>')
  setTextSelection(h, h.editor.state.doc.content.size - 1)
  keydown(h, 'Tab', { shiftKey: true })
  assert.equal(h.editor.state.doc.textContent, 'text', 'Shift+Tab removes one indentation unit')
  h.editor.destroy()
}

// ─── 7. Markdown block input at doc start (StarterKit input rules) ───────
{
  const h = createEditor('<p>abc</p>')
  setTextSelection(h, 1)
  textInput(h, '- ')
  assert.equal(
    docShape(h),
    'doc(bulletList(listItem(paragraph("abc"))))',
    'Typing "- " at document start converts the paragraph into a bullet list',
  )
  h.editor.destroy()
}

{
  const h = createEditor('<p>abc</p>')
  setTextSelection(h, 1)
  textInput(h, '1. ')
  assert.equal(
    docShape(h),
    'doc(orderedList(listItem(paragraph("abc"))))',
    'Typing "1. " at document start converts the paragraph into an ordered list',
  )
  h.editor.destroy()
}

console.log('✓ Typora-aligned list keyboard interactions')
