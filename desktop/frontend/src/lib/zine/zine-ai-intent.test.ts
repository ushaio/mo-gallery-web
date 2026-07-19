import assert from 'node:assert/strict'

import { hasExplicitZineEditIntent } from './zine-ai-intent'

for (const instruction of [
  '基于此提供合适的文案',
  '给我三组候选文案',
  '根据当前照片生成一段文案',
  '提供一些排版建议',
  'describe the photos and suggest suitable copy',
]) {
  assert.equal(hasExplicitZineEditIntent(instruction), false, instruction)
}

for (const instruction of [
  '把这段文案写入当前跨页',
  '在当前页面添加一个文本框并写入文案',
  '调整当前跨页的照片布局',
  '将右页图片裁剪得更紧凑',
  'insert this copy into the current spread',
  'adjust the current page layout',
]) {
  assert.equal(hasExplicitZineEditIntent(instruction), true, instruction)
}

console.log('✓ Zine AI routes only explicit editor commands to direct edit')
