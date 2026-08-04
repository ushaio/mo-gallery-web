import assert from 'node:assert/strict'

import { CropSession } from './crop-session'

const initial = { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 }
const session = new CropSession(initial)

session.pan(20, -10, 100, 50)
assert.equal(session.getDraft().offsetX, 20)
assert.equal(session.getDraft().offsetY, -20)

session.zoom(-1)
assert.equal(session.getDraft().scale, 1.08)
assert.deepEqual(session.cancel(), initial, 'cancel restores the crop snapshot without writing a project update')
assert.equal(session.changed(), false)

session.zoom(-1)
const committed = session.commit()
assert.equal(committed.scale, 1.08)
assert.equal(session.changed(), true)

console.log('✓ Zine crop session pan, zoom, commit, and cancel behavior')
