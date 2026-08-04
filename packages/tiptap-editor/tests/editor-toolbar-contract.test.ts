import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, `${new URL('..', import.meta.url).href}/`), 'utf8')
}

const editorSource = readSource('src/NarrativeTipTapEditor.tsx')
const toolbarSource = readSource('src/tiptap-editor/EditorToolbar.tsx')
const colorPickerSource = readSource('src/tiptap-editor/ColorPickerMenu.tsx')

assert.match(editorSource, /createEditorCommandRegistry/, 'editor surfaces share the command registry')
assert.match(editorSource, /event\.altKey[\s\S]*event\.key !== 'F10'/, 'Alt+F10 moves focus into the main toolbar')
assert.match(editorSource, /aria-label=\{t\('editor\.main_toolbar'\)\}/, 'main toolbar has an accessible name')
assert.match(editorSource, /openToolbarMenu === 'insert'/, 'insert commands use a dedicated menu')
assert.match(editorSource, /openToolbarMenu === 'format'/, 'secondary formatting uses a dedicated menu')
assert.doesNotMatch(
  editorSource,
  /<fieldset[\s\S]{0,300}overflow-x-auto/,
  'the main toolbar no longer relies on horizontal scrolling',
)
assert.match(toolbarSource, /aria-haspopup=\{ariaHasPopup\}/, 'popover triggers expose menu semantics')
assert.match(toolbarSource, /requestAnimationFrame/, 'opening a toolbar menu moves focus into its first action')
assert.match(toolbarSource, /\}, \[open\]\)/, 'menu focus runs only when the open state changes')
assert.match(toolbarSource, /ArrowDown[\s\S]*ArrowUp[\s\S]*Home[\s\S]*End/, 'toolbar menus support directional keyboard navigation')
assert.match(
  toolbarSource,
  /closest\('input, select, textarea, \[contenteditable="true"\]'\)/,
  'menu navigation preserves native input and select keyboard behavior',
)
assert.match(toolbarSource, /event\.stopPropagation\(\)/, 'Escape is consumed by the active toolbar menu')
assert.match(editorSource, /!currentEditor\.isActive\('mediaEmbed'\)/, 'selection toolbar excludes media embeds')
assert.match(editorSource, /\$from\.depth === 1/, 'floating menu is restricted to top-level empty paragraphs')
assert.match(editorSource, /command\.id === 'redo' \? 'max-sm:hidden'/, 'redo moves into the format menu on mobile')
assert.match(editorSource, /command\.id === 'italic'[\s\S]*'max-\[359px\]:hidden'/, 'italic remains available through the format menu on very narrow screens')
assert.match(editorSource, /const mainInlineCommands = mainCommands\.filter/, 'desktop toolbar exposes a dedicated inline-format group')
assert.match(editorSource, /const mainListCommands = mainCommands\.filter/, 'desktop toolbar exposes common list commands')
assert.match(editorSource, /const mainLayoutCommands = mainCommands\.filter/, 'wide toolbar exposes alignment and cleanup commands')
assert.match(editorSource, /command\.id === 'underline' \|\| command\.id === 'strike'/, 'underline and strike are promoted on desktop')
assert.match(editorSource, /value=\{resolvedEditorUiState\.fontFamily\}[\s\S]*className="hidden max-w-\[7rem\] md:block"/, 'font family is promoted from the format menu on desktop')
assert.match(editorSource, /value=\{resolvedEditorUiState\.fontSize\}[\s\S]*className="hidden max-w-\[5\.5rem\] md:block"/, 'font size is promoted from the format menu on desktop')
assert.match(editorSource, /command\.id === 'blockquote' \? 'hidden lg:flex'/, 'wide toolbar includes the common quote command')
assert.match(editorSource, /className="hidden lg:flex"/, 'wide-only commands remain collapsed below their responsive breakpoint')
assert.match(editorSource, /'hidden sm:flex'/, 'promoted desktop commands remain collapsed on narrow screens')
assert.match(editorSource, /tiptap-editor relative z-0 isolate/, 'editor creates a local stacking context below host dialogs')
assert.doesNotMatch(editorSource, /z-\[(?:6[0-9]|7[0-9]|8[0-9])\]/, 'editor surfaces do not escape above host modal layers')
assert.match(toolbarSource, /top-\[calc\(100%\+6px\)\] z-30/, 'toolbar popovers stay within the editor layer scale')
assert.match(colorPickerSource, /fixed z-40/, 'color pickers remain below the host modal baseline')

console.log('✓ editor toolbar hierarchy and keyboard contracts')
