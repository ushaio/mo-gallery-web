import assert from 'node:assert/strict'

import { getImageLoadInstanceKey, imageLoadReducer, initialImageLoadState } from './image-load-state'

const failed = imageLoadReducer(initialImageLoadState, { type: 'failed' })
assert.equal(failed.status, 'failed')

const retried = imageLoadReducer(failed, { type: 'retry' })
assert.equal(retried.status, 'ready')
assert.equal(retried.retryKey, 1, 'retry remounts the image without removing its slot')

assert.notEqual(
  getImageLoadInstanceKey('asset-1', 'blob:preview-1'),
  getImageLoadInstanceKey('asset-2', 'blob:preview-2'),
  'replacing an existing asset mounts a fresh image instance',
)

console.log('✓ Zine image load failure and retry state')
