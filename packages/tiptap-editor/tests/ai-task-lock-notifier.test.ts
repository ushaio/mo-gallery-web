import assert from 'node:assert/strict'
import { createAiTaskLockNotifier } from '../src/tiptap-editor/ai-task-lock-notifier'

const calls: string[] = []
const callbackA = (locked: boolean) => calls.push(`A:${locked}`)
const callbackB = (locked: boolean) => calls.push(`B:${locked}`)
const notifier = createAiTaskLockNotifier()

notifier.update(callbackA, true)
notifier.update(callbackB, true)
notifier.dispose()

assert.deepEqual(
  calls,
  ['A:true', 'A:false', 'B:true', 'B:false'],
  'callback replacement resets the old observer before notifying and later resetting the replacement',
)

console.log('✓ narrative AI task lock callback handoff')
