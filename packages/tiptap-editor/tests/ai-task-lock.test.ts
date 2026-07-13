import assert from 'node:assert/strict'
import {
  createNarrativeAiTask,
  createNarrativeAiTaskLock,
  executeNarrativeAiTask,
  runWithNarrativeAiTaskLock,
} from '../src/tiptap-editor/ai-task-lock'
import {
  createNarrativeAiTaskSession,
  type NarrativeAiOperationKind,
} from '../src/tiptap-editor/narrative-ai-task-session'
import { createNarrativeAiTaskSessionLifecycle } from '../src/tiptap-editor/narrative-ai-task-session-lifecycle'

const lock = createNarrativeAiTaskLock()
const firstTask = createNarrativeAiTask('first')
const otherTask = createNarrativeAiTask('other')
const notifications: boolean[] = []
const unsubscribe = lock.subscribe(() => notifications.push(lock.getSnapshot()))

assert.equal(lock.acquire(firstTask), true, 'the first task acquires the editor lock')
assert.equal(lock.acquire(firstTask), true, 'same-task acquisition is idempotent')
assert.equal(lock.acquire(otherTask), false, 'a different task cannot steal the editor lock')
assert.equal(lock.release(otherTask), false, 'a different task cannot unbalance the editor lock')
assert.equal(lock.getSnapshot(), true, 'a rejected release leaves the editor locked')
assert.equal(lock.release(firstTask), true, 'the owning task releases the editor lock')
assert.equal(lock.release(firstTask), true, 'same-task release is idempotent')
assert.deepEqual(notifications, [true, false], 'listeners only observe real lock transitions')
unsubscribe()

for (const outcome of ['success', 'failure', 'abort'] as const) {
  const taskLock = createNarrativeAiTaskLock()
  const task = createNarrativeAiTask(outcome)

  try {
    await runWithNarrativeAiTaskLock(taskLock, task, async () => {
      assert.equal(taskLock.getSnapshot(), true, `${outcome} task is locked while running`)
      if (outcome === 'failure') throw new Error('failed')
      if (outcome === 'abort') throw new DOMException('stopped', 'AbortError')
      return 'done'
    })
  } catch (error) {
    assert.notEqual(outcome, 'success', 'successful tasks must not reject')
    assert.ok(error instanceof Error, 'task failures remain observable')
  }

  assert.equal(taskLock.getSnapshot(), false, `${outcome} task always releases its lock`)
}

for (const outcome of ['success', 'failure', 'abort'] as const) {
  const taskLock = createNarrativeAiTaskLock()

  try {
    await executeNarrativeAiTask(taskLock, `assistant-${outcome}`, async () => {
      assert.equal(taskLock.getSnapshot(), true, `${outcome} assistant task owns the lock while executing`)
      if (outcome === 'failure') throw new Error('failed')
      if (outcome === 'abort') throw new DOMException('stopped', 'AbortError')
      return 'done'
    })
  } catch (error) {
    assert.notEqual(outcome, 'success', 'successful assistant tasks must not reject')
    assert.ok(error instanceof Error, 'assistant task failures remain observable')
  }

  assert.equal(taskLock.getSnapshot(), false, `${outcome} assistant task releases in finally`)
}

{
  const taskLock = createNarrativeAiTaskLock()
  let finishFirstTask!: () => void
  const firstTask = executeNarrativeAiTask(taskLock, 'assistant-first', () => new Promise<void>((resolve) => {
    finishFirstTask = resolve
  }))

  await assert.rejects(
    executeNarrativeAiTask(taskLock, 'assistant-concurrent', async () => undefined),
    /already running another AI task/,
    'assistant task execution rejects a concurrent operation',
  )
  finishFirstTask()
  await firstTask
  assert.equal(taskLock.getSnapshot(), false, 'the first assistant task releases after concurrent rejection')
}

{
  const taskLock = createNarrativeAiTaskLock()
  const task = createNarrativeAiTask('reentrant')
  assert.equal(taskLock.acquire(task), true, 'direct acquisition establishes same-token ownership')

  await assert.rejects(
    runWithNarrativeAiTaskLock(taskLock, task, async () => undefined),
    /already owns the narrative AI task lock/,
    'the helper rejects execution when its token already owns the lock',
  )
  assert.equal(taskLock.getSnapshot(), true, 'rejected helper reentrancy does not release direct ownership')
  assert.equal(taskLock.release(task), true, 'the direct owner still releases its lock')
}

{
  const taskLock = createNarrativeAiTaskLock()
  const task = createNarrativeAiTask('overlap')
  let finishFirst!: () => void
  const first = runWithNarrativeAiTaskLock(taskLock, task, () => new Promise<void>((resolve) => {
    finishFirst = resolve
  }))

  await assert.rejects(
    runWithNarrativeAiTaskLock(taskLock, task, async () => undefined),
    /already owns the narrative AI task lock/,
    'overlapping helper execution with the same token is rejected',
  )
  assert.equal(taskLock.getSnapshot(), true, 'the lock remains held while the first helper is unfinished')
  finishFirst()
  await first
  assert.equal(taskLock.getSnapshot(), false, 'the lock releases after the accepted helper finishes')
}

const operationKinds: NarrativeAiOperationKind[] = ['stream-generation', 'legacy-agent']

for (const operationKind of operationKinds) {
  {
    const taskLock = createNarrativeAiTaskLock()
    const taskSession = createNarrativeAiTaskSession(taskLock)
    const lockStates: boolean[] = []
    let resolveWork!: (value: string) => void
    const unsubscribe = taskLock.subscribe(() => lockStates.push(taskLock.getSnapshot()))

    assert.equal(taskSession.canStart, true, `${operationKind} can start while idle`)
    assert.equal(taskSession.isActive, false, `${operationKind} starts without an active session`)

    const pending = taskSession.start(operationKind, async ({ signal }) => {
      assert.deepEqual(lockStates, [true], `${operationKind} publishes its lock before work starts`)
      assert.equal(taskLock.getSnapshot(), true, `${operationKind} owns the lock before work starts`)
      assert.equal(taskSession.isActive, true, `${operationKind} is active while work is pending`)
      assert.equal(signal.aborted, false, `${operationKind} receives a live abort signal`)
      return new Promise<string>((resolve) => {
        resolveWork = resolve
      })
    })

    assert.equal(taskSession.canStart, false, `${operationKind} cannot start another task while pending`)
    await assert.rejects(
      taskSession.start(operationKind, async () => 'concurrent'),
      /already running another AI task/,
      `${operationKind} rejects a second start while pending`,
    )

    resolveWork('done')
    assert.equal(await pending, 'done', `${operationKind} returns successful work results`)
    assert.deepEqual(lockStates, [true, false], `${operationKind} success publishes lock release`)
    assert.equal(taskLock.getSnapshot(), false, `${operationKind} success releases the lock`)
    assert.equal(taskSession.isActive, false, `${operationKind} success clears the active session`)
    assert.equal(taskSession.canStart, true, `${operationKind} can restart after success`)
    unsubscribe()
  }

  {
    const taskLock = createNarrativeAiTaskLock()
    const taskSession = createNarrativeAiTaskSession(taskLock)
    const expectedError = new Error(`${operationKind} failed`)

    await assert.rejects(
      taskSession.start(operationKind, async () => {
        throw expectedError
      }),
      (error) => error === expectedError,
      `${operationKind} preserves normal work errors`,
    )
    assert.equal(taskLock.getSnapshot(), false, `${operationKind} error releases the lock`)
    assert.equal(taskSession.isActive, false, `${operationKind} error clears the active session`)
    assert.equal(taskSession.canStart, true, `${operationKind} can restart after an error`)
  }

  {
    const taskLock = createNarrativeAiTaskLock()
    const taskSession = createNarrativeAiTaskSession(taskLock)
    let observedAbort = false

    const pending = taskSession.start(operationKind, ({ signal }) => new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        observedAbort = true
        reject(new DOMException('stopped', 'AbortError'))
      }, { once: true })
    }))

    assert.equal(taskSession.stop(), true, `${operationKind} stop aborts an active task`)
    await assert.rejects(
      pending,
      (error) => error instanceof Error && error.name === 'AbortError',
      `${operationKind} work observes AbortError after stop`,
    )
    assert.equal(observedAbort, true, `${operationKind} observes its signal abort`)
    assert.equal(taskLock.getSnapshot(), false, `${operationKind} stop releases the lock`)
    assert.equal(taskSession.isActive, false, `${operationKind} stop clears the active session`)
    assert.equal(taskSession.stop(), false, `${operationKind} stop is inert while idle`)
  }

  {
    const taskLock = createNarrativeAiTaskLock()
    const taskSession = createNarrativeAiTaskSession(taskLock)
    const lockStates: boolean[] = []
    let signalWasAborted = false
    const unsubscribe = taskLock.subscribe(() => lockStates.push(taskLock.getSnapshot()))

    const pending = taskSession.start(operationKind, ({ signal }) => new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        signalWasAborted = signal.aborted
        reject(new DOMException('disposed', 'AbortError'))
      }, { once: true })
    }))

    taskSession.dispose()
    await assert.rejects(
      pending,
      (error) => error instanceof Error && error.name === 'AbortError',
      `${operationKind} disposal settles active work with AbortError`,
    )
    assert.equal(signalWasAborted, true, `${operationKind} disposal aborts the active signal`)
    assert.deepEqual(lockStates, [true, false], `${operationKind} disposal releases the lock exactly once`)
    assert.equal(taskSession.isActive, false, `${operationKind} disposal clears the active operation after settlement`)
    assert.equal(taskSession.canStart, false, `${operationKind} disposal permanently closes the session`)
    await assert.rejects(
      taskSession.start(operationKind, async () => 'late'),
      /disposed/,
      `${operationKind} rejects future starts after disposal`,
    )
    unsubscribe()
  }
}

{
  const taskLock = createNarrativeAiTaskLock()
  const lifecycle = createNarrativeAiTaskSessionLifecycle()
  const firstSetup = lifecycle.setup(taskLock)
  const firstPending = firstSetup.session.start('stream-generation', ({ signal }) => new Promise<never>((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      reject(new DOMException('Strict Mode cleanup', 'AbortError'))
    }, { once: true })
  }))

  firstSetup.cleanup()
  assert.equal(firstSetup.session.canStart, false, 'Strict Mode cleanup disposes the first committed session')
  assert.equal(lifecycle.current, null, 'Strict Mode cleanup clears the disposed current session')

  const secondSetup = lifecycle.setup(taskLock)
  assert.notEqual(secondSetup.session, firstSetup.session, 'Strict Mode replay creates a fresh production session')
  assert.equal(lifecycle.current, secondSetup.session, 'callbacks resolve the second committed session')
  firstSetup.cleanup()
  assert.equal(lifecycle.current, secondSetup.session, 'stale cleanup cannot clear or dispose the replacement session')
  await assert.rejects(
    firstPending,
    (error) => error instanceof Error && error.name === 'AbortError',
    'Strict Mode cleanup aborts active work from its exact session',
  )
  assert.equal(
    await lifecycle.requireCurrent().start('stream-generation', async () => 'stream-ready'),
    'stream-ready',
    'the replayed setup can run streaming work',
  )
  assert.equal(
    await lifecycle.requireCurrent().start('legacy-agent', async () => 'agent-ready'),
    'agent-ready',
    'the replayed setup can run legacy agent work',
  )

  secondSetup.cleanup()
  assert.equal(secondSetup.session.canStart, false, 'final cleanup disposes the exact replayed session')
  assert.equal(taskLock.getSnapshot(), false, 'final cleanup leaves the shared task lock released')
}

console.log('✓ narrative AI task ownership and session lifecycle behavior')
