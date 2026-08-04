import assert from 'node:assert/strict'

import { ZINE_GEOMETRY_VERSION, getSlotLocalX, getSlotPageSide, migrateProjectGeometry } from './geometry'
import { buildSpreadFromTemplate } from './templates'
import type { ImageSlot, ZineProject } from './types'

const legacyRightSlot: ImageSlot = {
  id: 'right-slot',
  kind: 'image',
  page: 'right',
  x: 12,
  y: 10,
  w: 40,
  h: 30,
  rotation: 0,
  zIndex: 1,
  assetId: null,
  imageTransform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 },
}

const legacyProject: ZineProject = {
  id: 'legacy-project',
  title: 'Legacy',
  pageSize: 'a5',
  pageOrientation: 'portrait',
  createdBy: 'local',
  createdAt: 1,
  updatedAt: 1,
  spreads: [{ id: 'spread-1', templateId: 'legacy', slots: [legacyRightSlot] }],
  assets: [],
}

const migrated = migrateProjectGeometry(legacyProject)
const migratedSlot = migrated.spreads[0]?.slots[0]
assert.equal(migrated.geometryVersion, ZINE_GEOMETRY_VERSION)
assert.equal(migratedSlot?.x, 160, 'right-page local x is migrated into spread coordinates')
assert.equal(migratedSlot ? getSlotLocalX(migratedSlot, 148) : null, 12)
assert.equal(migrateProjectGeometry(migrated), migrated, 'migration is idempotent for version 2 projects')
const unversionedSpreadProject = { ...legacyProject, spreads: [{ ...legacyProject.spreads[0], slots: [{ ...legacyRightSlot, x: 160 }] }] }
assert.equal(migrateProjectGeometry(unversionedSpreadProject).spreads[0]?.slots[0]?.x, 160, 'unversioned spread coordinates are not migrated twice')

const template = buildSpreadFromTemplate('single-photo-full', 148, 210)
assert.equal(template.slots[0]?.x, 12)
assert.equal(template.slots[1]?.x, 160, 'new templates emit spread coordinates')

assert.equal(getSlotPageSide({ ...legacyRightSlot, x: 130, w: 50 }, 148), 'right')
assert.equal(getSlotPageSide({ ...legacyRightSlot, x: 100, w: 50 }, 148), 'left')

console.log('✓ Zine spread geometry migration and page derivation')
