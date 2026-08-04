import assert from 'node:assert/strict'

import { imageLoadReducer, initialImageLoadState } from './image-load-state'

const failed = imageLoadReducer(initialImageLoadState, { type: 'failed' })
assert.equal(failed.status, 'failed')

const retried = imageLoadReducer(failed, { type: 'retry' })
assert.equal(retried.status, 'ready')
assert.equal(retried.retryKey, 1, 'retry remounts the image without removing its slot')

const replacedSource = imageLoadReducer(retried, { type: 'source-changed' })
assert.deepEqual(replacedSource, initialImageLoadState)

console.log('✓ Zine image load failure and retry state')
