import assert from 'node:assert/strict'
import {
  createBlogDraftDocumentId,
  resolveBlogDocumentId,
  rotateBlogDraftDocumentId,
} from './blog-draft-document'

const firstDraftId = createBlogDraftDocumentId()
const secondDraftId = createBlogDraftDocumentId()

assert.notEqual(firstDraftId, secondDraftId, 'each new blog draft lifecycle gets a fresh identity')
assert.equal(resolveBlogDocumentId('saved-blog', firstDraftId), 'saved-blog', 'saved blogs use their persisted ID')
assert.equal(resolveBlogDocumentId(undefined, firstDraftId), firstDraftId, 'unsaved blogs use their draft lifecycle ID')

const rotatedDraftId = rotateBlogDraftDocumentId(firstDraftId)
assert.notEqual(rotatedDraftId, firstDraftId, 'rotating a draft identity starts a distinct new-draft lifecycle')
assert.equal(
  resolveBlogDocumentId(undefined, rotatedDraftId),
  rotatedDraftId,
  'the resolver remains stable throughout the rotated draft lifecycle',
)

console.log('✓ blog draft document identity lifecycle')
