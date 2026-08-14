import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, `${new URL('..', import.meta.url).href}/`), 'utf8')
}

const editorSource = readSource('src/NarrativeTipTapEditor.tsx')
const toolbarSource = readSource('src/tiptap-editor/EditorToolbar.tsx')
const colorPickerSource = readSource('src/tiptap-editor/ColorPickerMenu.tsx')
const cssSource = readSource('src/tiptap-editor.css')
const desktopWrapperSource = readFileSync(
  new URL('../../../desktop/frontend/src/components/NarrativeTipTapEditor.tsx', import.meta.url),
  'utf8',
)

assert.match(editorSource, /createEditorCommandRegistry/, 'editor surfaces share the command registry')
assert.match(editorSource, /event\.altKey[\s\S]*event\.key !== 'F10'/, 'Alt+F10 moves focus into the main toolbar')
assert.match(editorSource, /aria-label=\{t\('editor\.main_toolbar'\)\}/, 'main toolbar has an accessible name')
assert.match(editorSource, /openToolbarMenu === 'insert'/, 'insert commands use a dedicated menu')
assert.match(editorSource, /openToolbarMenu === 'format'/, 'secondary formatting uses a dedicated menu')
assert.match(
  editorSource,
  /flex min-w-0 flex-1 items-center gap-0\.5 overflow-x-auto overflow-y-clip/,
  'the main toolbar command strip scrolls horizontally when space runs out',
)
assert.match(
  editorSource,
  /className="relative z-20 flex min-w-0 items-center justify-between gap-1 overflow-visible/,
  'the toolbar container stays overflow-visible so pinned menus are never clipped',
)
assert.match(editorSource, /tiptap-toolbar-scroll/, 'the scrolling command strip hides its scrollbar while keeping scroll behavior')
assert.match(cssSource, /scrollbar-width:\s*none/, 'the command strip hides its scrollbar (Firefox)')
assert.match(cssSource, /::-webkit-scrollbar\s*\{\s*display:\s*none/, 'the command strip hides its scrollbar (WebKit)')
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
assert.doesNotMatch(editorSource, /max-sm:hidden/, 'redo stays visible in the pinned toolbar group on all widths')
assert.doesNotMatch(editorSource, /max-\[359px\]:hidden/, 'inline formats stay visible and scroll instead of hiding on narrow screens')
assert.match(editorSource, /const mainInlineCommands = mainCommands\.filter/, 'desktop toolbar exposes a dedicated inline-format group')
assert.match(editorSource, /const mainListCommands = mainCommands\.filter/, 'desktop toolbar exposes common list commands')
assert.match(editorSource, /const mainLayoutCommands = mainCommands\.filter/, 'wide toolbar exposes alignment and cleanup commands')
assert.doesNotMatch(
  editorSource,
  /command\.id === 'underline' \|\| command\.id === 'strike'/,
  'underline and strike stay visible in the scrolling strip — no breakpoint promotion needed',
)
assert.match(editorSource, /value=\{resolvedEditorUiState\.fontFamily\}[\s\S]*className="max-w-\[7rem\]"/, 'font family select stays in the scrolling command strip')
assert.match(editorSource, /value=\{resolvedEditorUiState\.fontSize\}[\s\S]*className="max-w-\[5\.5rem\]"/, 'font size select stays in the scrolling command strip')
assert.doesNotMatch(editorSource, /surfaces: \['main', 'bubble', 'format'\]/, 'inline formats are not duplicated into the format menu')
assert.doesNotMatch(editorSource, /surfaces: \['main', 'format'\]/, 'align, redo and clear-formatting are not duplicated into the format menu')
assert.match(editorSource, /surfaces: \['format'\]/, 'format menu keeps only commands absent from the toolbar: drop cap and colors')
assert.doesNotMatch(editorSource, /command\.id === 'blockquote' \? 'hidden lg:flex'/, 'quote command stays in the scrolling command strip')
assert.match(editorSource, /openToolbarMenu === 'copy'/, 'copy opens a toolbar popover below its trigger')
assert.match(editorSource, /icon=\{Copy\}/, 'copy is exposed as an icon command next to editor history')
assert.match(editorSource, /html: editor\.getHTML\(\)/, 'platform copy uses the current unsaved editor HTML')
assert.match(editorSource, /copyCurrentContentToWechat/, 'the WeChat option invokes the host clipboard formatter')
assert.match(editorSource, /<WechatIcon className="h-4 w-4"/, 'the platform option uses the shared WeChat icon')
assert.match(
  desktopWrapperSource,
  /copyWechatArticleToClipboard[\s\S]*copyToWechat/,
  'desktop injects the shared WeChat clipboard formatter so the copy command is visible',
)
assert.match(editorSource, /name: 'fixed-block-handle-x'/, 'block handles use a fixed horizontal positioning rule')
assert.match(
  editorSource,
  /return \{ x: x - \(referenceRect\.left - contentLeft\) \}/,
  'indented blocks keep the drag handle aligned with the default content edge',
)
assert.doesNotMatch(editorSource, /className="hidden lg:flex"/, 'layout commands no longer collapse below a breakpoint; the strip scrolls')
assert.doesNotMatch(editorSource, /'hidden sm:flex'/, 'promoted desktop commands no longer collapse; the strip scrolls')
assert.match(editorSource, /tiptap-editor relative z-0 isolate/, 'editor creates a local stacking context below host dialogs')
assert.doesNotMatch(editorSource, /z-\[(?:6[0-9]|7[0-9]|8[0-9])\]/, 'editor surfaces do not escape above host modal layers')
assert.match(toolbarSource, /top-\[calc\(100%\+6px\)\] z-30/, 'toolbar popovers stay within the editor layer scale')
assert.match(colorPickerSource, /fixed z-40/, 'color pickers remain below the host modal baseline')

console.log('✓ editor toolbar hierarchy and keyboard contracts')
