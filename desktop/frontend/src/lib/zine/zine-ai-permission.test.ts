import assert from 'node:assert/strict'

import {
  buildZineConversationHistory,
  createZineAgentPermissionMetadata,
  readZineAgentPermissionMetadata,
  shouldRequestZineAgentPermission,
} from './zine-ai-permission'

assert.equal(shouldRequestZineAgentPermission('ask', '优化页面排版'), true)
assert.equal(shouldRequestZineAgentPermission('ask', '提供三个排版建议'), false)
assert.equal(shouldRequestZineAgentPermission('agent', '优化页面排版'), false)

const pending = createZineAgentPermissionMetadata('优化页面排版')
assert.deepEqual(readZineAgentPermissionMetadata(pending), pending)
assert.equal(readZineAgentPermissionMetadata({ ...pending, state: 'unknown' }), null)
assert.deepEqual(
  createZineAgentPermissionMetadata(pending.instruction, 'continued'),
  { ...pending, state: 'continued' },
)

assert.deepEqual(buildZineConversationHistory([
  { role: 'user', status: 'completed', content: '给照片配文案' },
  { role: 'assistant', status: 'completed', content: '这是什么时刻？希望是什么语气？' },
  { role: 'assistant', status: 'completed', content: 'permission', metadata: pending },
  { role: 'user', status: 'completed', content: '这是上海的雨夜，语气克制。' },
  { role: 'assistant', status: 'failed', content: 'ignored' },
], '写入当前页面', true), [
  { role: 'user', content: '给照片配文案' },
  { role: 'assistant', content: '这是什么时刻？希望是什么语气？' },
  { role: 'user', content: '这是上海的雨夜，语气克制。' },
])

console.log('✓ Zine AI permission modes gate direct edits and preserve escalation state')
