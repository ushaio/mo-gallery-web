import assert from 'node:assert/strict'

import {
  encodeEditorAiMetadataTransport,
  filterPersistableEditorAiImageReferences,
} from '../desktop/frontend/src/lib/api/editor-ai-metadata'

const metadata = {
  images: ['https://example.com/photo.jpg', 'C:/photos/a.jpg'],
  nested: { values: [1, true, null] },
}
const expectedTransport = Array.from(new TextEncoder().encode(JSON.stringify(metadata)))
assert.deepEqual(encodeEditorAiMetadataTransport(metadata), expectedTransport)

const inputImages = [
  ' data:image/png;base64,AAAA ',
  '\tDaTa:ImAgE/jpeg;base64,BBBB',
  'https://example.com/photo.jpg',
  ' C:/photos/a.jpg ',
  '',
]
assert.deepEqual(filterPersistableEditorAiImageReferences(inputImages), [
  'https://example.com/photo.jpg',
  'C:/photos/a.jpg',
])
assert.equal(inputImages[0], ' data:image/png;base64,AAAA ')

console.log('desktop editor AI metadata tests passed')
