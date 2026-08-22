import assert from 'node:assert/strict'
import { convertMarkdownToHtml } from '../src/tiptap-editor/markdown-converter'
import { TAB_INDENT } from '../src/tiptap-editor/editor-constants'

const nested = convertMarkdownToHtml([
  '1. Capture the scene',
  '   - Check the light',
  '   - Check the frame',
  '2. Write the note',
].join('\n'))

assert.match(nested, /<ol><li>Capture the scene<ul><li>Check the light<\/li><li>Check the frame<\/li><\/ul><\/li><li>Write the note<\/li><\/ol>/)

const mixed = convertMarkdownToHtml([
  '- First',
  '  1. Nested ordered',
  '  2. Another nested ordered',
  '- Second',
].join('\n'))

assert.match(mixed, /<ul><li>First<ol><li>Nested ordered<\/li><li>Another nested ordered<\/li><\/ol><\/li><li>Second<\/li><\/ul>/)

const emptyItems = convertMarkdownToHtml([
  '1. Parent',
  '   - Child',
  '   -',
  '     1.',
  '     2. Sibling',
].join('\n'))

assert.match(emptyItems, /<ol><li>Parent<ul><li>Child<\/li><li><ol><li><\/li><li>Sibling<\/li><\/ol><\/li><\/ul><\/li><\/ol>/)

const deepMixed = convertMarkdownToHtml([
  '1. 按时打算',
  '2. 是的asdasd',
  '   - 大师的',
  '   - 打算',
  '     - 123142',
  '     -',
  '     - 去玩325',
  '       1. 按时',
  '          - 撒',
  '          -',
  '       2. 阿萨德',
  '          1. 打算',
  '          2. 刚好',
  '   - 啊士大夫',
  '3. sdagsd',
].join('\n'))

assert.equal((deepMixed.match(/<ol>/g) || []).length, 3)
assert.equal((deepMixed.match(/<ul>/g) || []).length, 3)
assert.match(deepMixed, /<li>去玩325<ol><li>按时<ul><li>撒<\/li><li><\/li><\/ul><\/li><li>阿萨德<ol><li>打算<\/li><li>刚好<\/li><\/ol><\/li><\/ol><\/li>/)

assert.equal(TAB_INDENT, '\t', 'plain-text Tab uses a literal tab character')

console.log('✓ markdown list conversion preserves ordered/unordered nesting')
