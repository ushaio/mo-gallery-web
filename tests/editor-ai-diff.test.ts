import assert from 'node:assert/strict'
import { Schema } from '@tiptap/pm/model'
import { linearizeDoc, findDocTextRange } from '../packages/tiptap-editor/src/tiptap-editor/doc-text'
import { diffText } from '../packages/tiptap-editor/src/tiptap-editor/text-diff'

function runTest(name: string, callback: () => void) {
  try {
    callback()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'text*', group: 'block' },
    text: { group: 'inline' },
  },
})

const paragraph = (text: string) => schema.node('paragraph', null, text ? schema.text(text) : undefined)

runTest('linearizes block text with a single newline separator', () => {
  const doc = schema.node('doc', null, [paragraph('first paragraph'), paragraph('second paragraph')])
  assert.equal(linearizeDoc(doc).text, 'first paragraph\nsecond paragraph')
})

runTest('maps a unique cross-paragraph fragment back to a document range', () => {
  const doc = schema.node('doc', null, [paragraph('alpha ending'), paragraph('beta opening')])
  const searchText = 'ending\nbeta'
  const range = findDocTextRange(doc, searchText)

  assert.ok(range)
  assert.equal(doc.textBetween(range.from, range.to, '\n'), searchText)
})

runTest('rejects ambiguous source fragments instead of editing the wrong occurrence', () => {
  const doc = schema.node('doc', null, [paragraph('same'), paragraph('same')])
  assert.equal(findDocTextRange(doc, 'same'), null)
})

runTest('produces compact same/delete/insert diff segments', () => {
  assert.deepEqual(diffText('old text', 'new text'), [
    { type: 'del', text: 'old' },
    { type: 'ins', text: 'new' },
    { type: 'same', text: ' text' },
  ])
})

runTest('falls back for inputs that would create an oversized LCS table', () => {
  assert.equal(diffText('a '.repeat(700), 'b '.repeat(700)), null)
})
