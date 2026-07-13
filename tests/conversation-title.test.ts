import assert from 'node:assert/strict'
import {
  buildConversationTitleMessages,
  normalizeConversationTitle,
} from '../packages/ai-agent/src/prompt'

function runTest(name: string, callback: () => void) {
  try {
    callback()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('normalizes common model title wrappers', () => {
  assert.equal(normalizeConversationTitle('## \"Title: Street Photography Notes.\"'), 'Street Photography Notes')
  assert.equal(
    normalizeConversationTitle('\u6807\u9898\uff1a\u300a\u591c\u95f4\u8857\u5934\u6444\u5f71\u300b\u3002'),
    '\u591c\u95f4\u8857\u5934\u6444\u5f71',
  )
})

runTest('keeps the opening and recent conversation context', () => {
  const history = Array.from({ length: 15 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
    content: `message-${index + 1}`,
  }))
  const messages = buildConversationTitleMessages(history)
  const transcript = messages[1]?.text ?? ''

  assert.match(transcript, /message-1/)
  assert.match(transcript, /message-4/)
  assert.doesNotMatch(transcript, /message-5(?:\D|$)/)
  assert.match(transcript, /message-8/)
  assert.match(transcript, /message-15/)
})
