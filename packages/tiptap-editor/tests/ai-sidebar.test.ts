import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  INITIAL_AI_SIDEBAR_STATE,
  getAiSidebarPresentation,
  toggleAiSidebar,
} from '../src/tiptap-editor/ai-sidebar-state'

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, `${new URL('..', import.meta.url).href}/`), 'utf8')
}

const assistantSource = readSource('src/TipTapAiAssistant.tsx')
const editorStyles = readSource('src/tiptap-editor.css')

assert.deepEqual(getAiSidebarPresentation(INITIAL_AI_SIDEBAR_STATE), {
  ariaExpanded: false,
  ariaHidden: true,
  panelState: 'collapsed',
}, 'sidebar starts collapsed with its panel hidden')

let expandCalls = 0
let transition = toggleAiSidebar(INITIAL_AI_SIDEBAR_STATE)
if (transition.shouldNotifyExpand) expandCalls += 1
let state = transition.expanded

assert.deepEqual(getAiSidebarPresentation(state), {
  ariaExpanded: true,
  ariaHidden: false,
  panelState: 'expanded',
}, 'clicking the collapsed sidebar expands it and exposes the panel')
assert.equal(expandCalls, 1, 'one collapsed-to-expanded click calls onExpand exactly once')

transition = toggleAiSidebar(state)
if (transition.shouldNotifyExpand) expandCalls += 1
state = transition.expanded
assert.equal(state, false, 'clicking the expanded sidebar collapses it')
assert.equal(expandCalls, 1, 'collapsing does not call onExpand')

assert.doesNotMatch(assistantSource, /createPortal/, 'assistant must remain inline instead of using a portal')
assert.doesNotMatch(editorStyles, /position:\s*fixed/, 'editor sidebar must not use a fixed viewport overlay')

console.log('✓ AI sidebar state and inline architecture contracts')
