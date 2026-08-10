import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findAgentMentionContext,
  removeAgentMentionQuery,
  replaceAgentMention,
  resolveAgentMentionSelection,
} from './agent-composer-mentions'
import type { AgentExtensionSnapshot } from './agent-extensions'

const snapshot: AgentExtensionSnapshot = {
  skills: [{
    id: 'photo-review', name: 'Photo Review', description: 'Review photos', sourceType: 'skill', sourcePath: '', installPath: '', contentHash: '', enabled: true, scriptExecutionEnabled: false, validationStatus: 'valid', installedAt: '', updatedAt: '',
  }],
  mcpServers: [{
    id: 'local-files', name: 'Local Files', command: 'server', args: [], env: [], enabled: true, capabilityFingerprint: '', runtimeStatus: 'stopped', idleTimeoutSeconds: 60, requestTimeoutSeconds: 60, tools: [], createdAt: '', updatedAt: '',
  }],
  authorizations: [],
  audits: [],
}

test('finds shortcut mentions only at a token boundary', () => {
  assert.deepEqual(findAgentMentionContext('请使用 /photo', 10), { kind: 'skill', start: 4, end: 10, query: 'photo' })
  assert.deepEqual(findAgentMentionContext('@mcp:local', 10), { kind: 'mcp', start: 0, end: 10, query: 'mcp:local' })
  assert.equal(findAgentMentionContext('https://example.com/a', 21), null)
})

test('replaces the active query and preserves trailing text', () => {
  const context = findAgentMentionContext('用 /pho 完成', 6)
  assert.ok(context)
  assert.deepEqual(replaceAgentMention('用 /pho 完成', context, '/photo-review'), {
    text: '用 /photo-review 完成',
    caret: 16,
  })
})

test('removes an active query without leaving duplicate whitespace', () => {
  const middleContext = findAgentMentionContext('Use /pho to review', 8)
  assert.ok(middleContext)
  assert.deepEqual(removeAgentMentionQuery('Use /pho to review', middleContext), {
    text: 'Use to review',
    caret: 4,
  })

  const endContext = findAgentMentionContext('Use /pho', 8)
  assert.ok(endContext)
  assert.deepEqual(removeAgentMentionQuery('Use /pho', endContext), {
    text: 'Use',
    caret: 3,
  })
})

test('resolves enabled structured selections from visible tokens', () => {
  assert.deepEqual(resolveAgentMentionSelection('/photo-review 请检查 @mcp:local-files', snapshot), {
    selectedSkillIds: ['photo-review'],
    selectedMcpServerIds: ['local-files'],
    hasExplicitMcpMention: true,
  })
})

test('merges chip selections with visible tokens without duplicate IDs', () => {
  assert.deepEqual(resolveAgentMentionSelection('/photo-review', snapshot, [
    { id: 'photo-review', kind: 'skill', label: 'Photo Review', description: 'Review photos', token: '/photo-review' },
    { id: 'local-files', kind: 'mcp', label: 'Local Files', description: 'Local files', token: '@mcp:local-files' },
  ]), {
    selectedSkillIds: ['photo-review'],
    selectedMcpServerIds: ['local-files'],
    hasExplicitMcpMention: true,
  })
})
