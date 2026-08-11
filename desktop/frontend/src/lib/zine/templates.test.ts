import assert from 'node:assert/strict'

import { buildSpreadFromTemplate, ZINE_TEMPLATES } from './templates'

const pageW = 148
const pageH = 210
const expectedTemplateIds = [
  'single-photo-full',
  'spread-full-bleed',
  'two-up',
  'triptych',
  'triptych-mirror',
  'four-column',
  'eight-photo-grid',
  'text-left-photo-right',
  'hero-caption',
  'editorial-story',
  'spread-title',
]

assert.deepEqual(ZINE_TEMPLATES.map((template) => template.id), expectedTemplateIds)

for (const template of ZINE_TEMPLATES) {
  const spread = buildSpreadFromTemplate(template.id, pageW, pageH)
  assert.equal(spread.templateId, template.id)
  assert.ok(spread.slots.length > 0, `${template.id} should create at least one slot`)
  assert.equal(new Set(spread.slots.map((slot) => slot.id)).size, spread.slots.length, `${template.id} slot ids should be unique`)
  for (const slot of spread.slots) {
    assert.ok(Number.isFinite(slot.x) && Number.isFinite(slot.y), `${template.id} slot coordinates should be finite`)
    assert.ok(slot.w > 0 && slot.h > 0, `${template.id} slot dimensions should be positive`)
  }
}

console.log('✓ Zine templates expose unique, scalable layouts')
