import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getEditorContent, hasEditorContent } from '../packages/api-client/src/editor-content'
import { convertToMilkdown, getMilkdownContent } from '../packages/milkdown/src/legacy-content'
import { getMilkdownPhotoIds } from '../packages/milkdown/src/media'
import type { ArticleContentDto } from '../packages/api-client/src/types'

const article: ArticleContentDto = {
  editorType: 'tiptap',
  contentEditorTypes: ['tiptap', 'milkdown'],
  tiptapContent: '<p>Original TipTap article</p>',
  milkContent: 'Separate Milkdown article',
}

test('the selected editor wins even when another body is non-null', () => {
  assert.equal(getEditorContent(article), article.tiptapContent)
  assert.equal(getEditorContent({ ...article, editorType: 'milkdown' }), article.milkContent)
})

test('a saved empty body stays empty and is distinguishable from a missing row', () => {
  const empty: ArticleContentDto = { ...article, editorType: 'milkdown', milkContent: '' }
  assert.equal(hasEditorContent(empty, 'milkdown'), true)
  assert.equal(getEditorContent(empty), '')
  assert.equal(getMilkdownContent(empty), '')
  assert.equal(hasEditorContent({ contentEditorTypes: ['tiptap'] }, 'milkdown'), false)
})

test('opening TipTap content never performs a Milkdown conversion', () => {
  assert.equal(getMilkdownContent(article), '')
  assert.equal(getMilkdownContent({ tiptapContent: article.tiptapContent }), '')
})

test('explicit conversion uses TipTap JSON and preserves photo references and the source', () => {
  const source = {
    tiptapContent: '<p>Stale HTML</p>',
    tiptapContentJson: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Saved title' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Photo journal', marks: [{ type: 'bold' }] }] },
        { type: 'image', attrs: { photoId: 'photo-123', src: 'https://example.com/photo.jpg' } },
      ],
    },
  }
  const original = JSON.stringify(source)
  const markdown = convertToMilkdown(source)
  assert.match(markdown, /## Saved title/)
  assert.match(markdown, /\*\*Photo journal\*\*/)
  assert.doesNotMatch(markdown, /Stale HTML/)
  assert.deepEqual([...getMilkdownPhotoIds(markdown)], ['photo-123'])
  assert.equal(JSON.stringify(source), original)
})

test('legacy HTML can be explicitly converted without a JSON document', () => {
  const markdown = convertToMilkdown({ tiptapContent: '<h2>Legacy title</h2><p>First paragraph.</p>' })
  assert.match(markdown, /## Legacy title/)
  assert.match(markdown, /First paragraph\./)
})

test('an explicitly empty TipTap document does not revive stale HTML during conversion', () => {
  assert.equal(convertToMilkdown({ tiptapContent: 'Stale text', tiptapContentJson: { type: 'doc', content: [] } }), '')
  assert.equal(convertToMilkdown({ tiptapContent: '' }), '')
})
