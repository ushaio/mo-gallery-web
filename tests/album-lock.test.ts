import assert from 'node:assert/strict'
import { test } from 'node:test'

/**
 * 同一相册的追加串行化。
 *
 * 这段逻辑原本直接跑在 `albums.post('/admin/albums/:id/photos')` 里，为了能单测而抽成
 * 独立模块（路由只负责解析参数与拼响应）。测试不碰数据库：验证的是**调度语义** ——
 * 同 id 不重叠、不同 id 并行、失败不堵队、队尾会被清掉。
 *
 * 用动态 import：本仓库的 package.json 没有 `"type": "module"`，静态 import 一个 `.ts`
 * 会被 tsx 当成 CJS 编译，命名导出就看不见了。动态 import 走的是同一套加载器，
 * 但能拿到真实的 ESM 形状（`tests/security-crypto.test.ts` 也是这么绕的）。
 */
const { withAlbumLock, albumLockSizeForTest } = await import('../hono/album-lock')

const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms))

test('同一相册的追加不会重叠执行', async () => {
  const events: string[] = []
  const work = (name: string) => async () => {
    events.push(`${name}:start`)
    await tick(20)
    events.push(`${name}:end`)
    return name
  }

  // 三个「同时到达」的请求打同一个相册。
  await Promise.all([
    withAlbumLock('album-a', work('first')),
    withAlbumLock('album-a', work('second')),
    withAlbumLock('album-a', work('third')),
  ])

  // 期望完全串行：每个 start 之后紧跟自己的 end，中间不插别人的 start。
  assert.deepEqual(events, [
    'first:start', 'first:end',
    'second:start', 'second:end',
    'third:start', 'third:end',
  ])
})

test('不同相册之间仍然并行', async () => {
  const events: string[] = []
  const job = (name: string) => async () => {
    events.push(`${name}:start`)
    await tick(20)
    events.push(`${name}:end`)
  }

  const startedAt = Date.now()
  await Promise.all([
    withAlbumLock('album-x', job('x')),
    withAlbumLock('album-y', job('y')),
  ])
  const elapsed = Date.now() - startedAt

  // 若两张相册被错误地串成一条队列，耗时会是两倍（约 40ms+）。
  // 只断言「明显小于串行」，避免依赖过紧的定时。
  assert.ok(elapsed < 38, `expected parallel execution, took ${elapsed}ms`)
  assert.equal(events.filter((event) => event.endsWith(':start')).length, 2)
})

test('前一个失败不会堵住后面的请求', async () => {
  await assert.rejects(
    withAlbumLock('album-fail', async () => { throw new Error('boom') }),
    /boom/,
  )

  const result = await withAlbumLock('album-fail', async () => 'still works')
  assert.equal(result, 'still works')
})

test('队尾会被清理，不会按相册 id 无限累积', async () => {
  const before = albumLockSizeForTest()
  for (let index = 0; index < 20; index += 1) {
    await withAlbumLock(`album-${index}`, async () => index)
  }
  // 让 finally 里的清理跑到
  await tick(10)
  assert.equal(albumLockSizeForTest(), before, 'completed albums should not stay in the queue map')
})

test('返回值原样透传', async () => {
  const payload = { ok: true, count: 3 }
  assert.deepEqual(await withAlbumLock('album-v', async () => payload), payload)
})
