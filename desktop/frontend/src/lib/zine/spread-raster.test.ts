import assert from 'node:assert/strict'

import { calculateZineRasterSize, createZineImageFileName } from './spread-raster'
import type { ZineProject } from './types'

const project: ZineProject = {
  id: 'project-1',
  title: 'Test: Zine?',
  pageSize: 'a5',
  pageOrientation: 'portrait',
  createdBy: 'local',
  createdAt: 1,
  updatedAt: 1,
  spreads: [
    { id: 'spread-1', templateId: 'one', slots: [] },
    { id: 'spread-2', templateId: 'two', slots: [] },
  ],
  assets: [],
}

const aiSize = calculateZineRasterSize(project, { maxEdge: 768 })
assert.equal(aiSize.width, 768)
assert.equal(aiSize.height, 545)

const exportSize = calculateZineRasterSize(project, { dpi: 300 })
assert.equal(exportSize.width, 3496)
assert.equal(exportSize.height, 2480)

assert.equal(createZineImageFileName(project, 'spread-2', 'jpeg'), 'Test Zine-spread-02.jpg')
assert.equal(createZineImageFileName(project, 'spread-1', 'png'), 'Test Zine-spread-01.png')
