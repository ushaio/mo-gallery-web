/**
 * Headless TipTap editor test helper.
 *
 * Boots a real Editor (MarkerHiddenListItem + MergeAdjacentLists, the exact
 * list schema used by the narrative editor) inside jsdom so list keyboard
 * interactions can be exercised end-to-end.
 */
import { JSDOM } from 'jsdom'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import {
  MarkerHiddenListItem,
  MergeAdjacentLists,
  createListEditorHandlers,
} from '../../src/tiptap-editor/narrative-list'
import { ListMarkerFontSize } from '../../src/tiptap-extensions/ListMarkerFontSize'
import { PastedStyleMark } from '../../src/tiptap-extensions/PastedStyleMark'

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
})

export function setupDom() {
  const { window } = dom
  const globalRecord = globalThis as unknown as Record<string, unknown>
  const windowRecord = window as unknown as Record<string, unknown>
  // ProseMirror touches a broad set of globals even when the editor is never
  // attached to the live document.
  const keys = [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Element',
    'Node',
    'NodeList',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'MutationObserver',
    'KeyboardEvent',
    'MouseEvent',
  ] as const
  for (const key of keys) {
    try {
      globalRecord[key] = windowRecord[key]
    } catch {
      Object.defineProperty(globalThis, key, {
        value: windowRecord[key],
        configurable: true,
        writable: true,
      })
    }
  }
  globalRecord.document = window.document
  globalRecord.window = window
  globalRecord.getSelection = window.getSelection.bind(window)
}

export function createEditor(content?: string) {
  const element = document.createElement('div')
  const handlers = createListEditorHandlers({ isAiTaskLocked: () => false })

  const editor = new Editor({
    element,
    extensions: [
      StarterKit.configure({
        horizontalRule: false,
        listItem: false,
      }),
      MarkerHiddenListItem,
      MergeAdjacentLists,
      PastedStyleMark,
      ListMarkerFontSize,
    ],
    content: content || '<p></p>',
    editorProps: handlers,
  })
  return { editor, handlers }
}

export type TestEditor = ReturnType<typeof createEditor>

/** Dispatch a real keydown through the editor view so ProseMirror's full
 *  pipeline (node shortcuts, keymaps, input rules) runs. */
export function keydown(
  harness: TestEditor,
  key: string,
  opts: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {},
) {
  const { editor } = harness
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    shiftKey: Boolean(opts.shiftKey),
    ctrlKey: Boolean(opts.ctrlKey),
    metaKey: Boolean(opts.metaKey),
    altKey: Boolean(opts.altKey),
  })
  // Detached jsdom nodes do not always bubble native key events through
  // ProseMirror's keymap plugins. Invoke the same view prop pipeline first;
  // fall back to DOM dispatch for plugins that only listen on the element.
  const handled = editor.view.someProp('handleKeyDown', fn => fn(editor.view, event))
  if (!handled) editor.view.dom.dispatchEvent(event)
  // Let the synchronous listener run; TipTap/PM dispatch transactions inline.
  return !event.defaultPrevented
}

/** Feed text through the exact path the browser uses for IME-free typing:
 *  try handleTextInput props, and if none handle it, insert the text
 *  directly (mirrors ProseMirror's view textInput routing). */
export function textInput(harness: TestEditor, text: string) {
  const { editor } = harness
  const view = editor.view
  const { from, to } = view.state.selection
  // ProseMirror hands handlers a `deflt` factory that builds the transaction it
  // would have applied; mirror that so handlers can defer to default insertion.
  const deflt = () => view.state.tr.insertText(text, from, to).scrollIntoView()
  const handled = view.someProp('handleTextInput', fn => fn(view, from, to, text, deflt))
  if (!handled) {
    view.dispatch(deflt())
  }
}

export function setTextSelection(harness: TestEditor, from: number, to?: number) {
  harness.editor.commands.setTextSelection({ from, to: to ?? from })
}

/** Place the cursor at the end of the first text node whose text matches,
 *  or at `offset` characters into it. Returns the absolute position. */
export function cursorInText(harness: TestEditor, text: string, offset = 0): number {
  const { doc } = harness.editor.state
  let target = -1
  doc.descendants((node, pos) => {
    if (target >= 0) return false
    if (node.isText && node.text === text) {
      target = pos + offset
      return false
    }
    return true
  })
  if (target < 0) throw new Error(`no text node "${text}"`)
  setTextSelection(harness, target)
  return target
}

/** Place the cursor at the very start of the first textblock containing
 *  `text` (i.e. before the first character). */
export function cursorAtStartOfText(harness: TestEditor, text: string): number {
  const { doc } = harness.editor.state
  let target = -1
  doc.descendants((node, pos) => {
    if (target >= 0) return false
    if (node.isTextblock && node.textContent.startsWith(text)) {
      target = pos + 1
      return false
    }
    return true
  })
  if (target < 0) throw new Error(`no textblock with "${text}"`)
  setTextSelection(harness, target)
  return target
}

export function jsonSummary(json: unknown): string {
  return JSON.stringify(json)
    .replace(/"attrs":\{[^}]*\}/g, '')
    .replace(/,"attrs":\{"markerHidden":false\}/g, '')
}

export function compactHtml(html: string): string {
  return html
    .replace(/\s+/g, ' ')
    .replace(/ data-list-marker-hidden="true"/g, ' [hidden]')
    .trim()
}

/** Canonical ProseMirror doc shape, with the trailing empty paragraph PM
 *  appends after a list dropped, and marker-hidden annotated. */
export function docShape(harness: TestEditor): string {
  let s = harness.editor.state.doc.toString()
  s = s.replace(/, paragraph\)$/, ')')
  return s
}

/** Check whether the rendered HTML contains a markerHidden attribute. */
export function hasHiddenMarker(html: string): boolean {
  return html.includes('data-list-marker-hidden="true"')
}

export function closeEditor(harness: TestEditor) {
  harness.editor.destroy()
}
