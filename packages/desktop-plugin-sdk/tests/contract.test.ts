import assert from 'node:assert/strict'
import test from 'node:test'
import { createFakeHost } from '../src/fake-host.js'
import { createStoragePlugin } from '../src/host.js'
import { ERROR_CODES, PluginError } from '../src/errors.js'
import type { StoragePlugin } from '../src/types.js'

function createTestPlugin(): StoragePlugin {
  return {
    manifest: {
      id: 'fake.storage',
      version: '1.0.0',
      apiVersion: '1',
      type: 'node',
      runtime: 'node22',
      entry: 'dist/main.js',
      capabilities: ['plugin.health', 'source.validate', 'object.put', 'object.get', 'object.getUrl'],
    },
    async validate(request) {
      return { valid: request.config.endpoint === 'https://example.test' }
    },
    async health() {
      return { status: 'ready' }
    },
    async put(request, context) {
      let total = 0
      for await (const chunk of context.transfer.open({ id: request.transferId, size: request.size }).stream()) total += chunk.byteLength
      assert.equal(total, request.size)
      return { key: request.key, size: total, urlType: 'public', url: `https://example.test/${request.key}` }
    },
    async getUrl(request) {
      return { key: request.key, size: 0, urlType: 'public', url: `https://example.test/${request.key}` }
    },
    async get(request, context) {
      const data = new TextEncoder().encode('downloaded object')
      const writer = context.transferWriter.open({ id: request.transferId, size: 0 })
      await writer.write(0, data)
      return { key: request.key, size: data.byteLength, urlType: 'public', url: `https://example.test/${request.key}` }
    },
  }
}

test('fake host completes lifecycle and transfer contract', async () => {
  const host = createFakeHost()
  const running = createStoragePlugin(createTestPlugin(), {
    input: host.pluginInput,
    output: host.pluginOutput,
    env: {
      MO_STORAGE_PLUGIN_CONFIG: JSON.stringify({ endpoint: 'https://example.test' }),
    },
  })
  const data = new TextEncoder().encode('hello plugin')
  const handle = { id: 'transfer-test', size: data.byteLength }
  host.setTransfer(handle, data)

  assert.equal((await host.request<{ id: string }>('plugin.getManifest')).id, 'fake.storage')
  assert.deepEqual(await host.request('plugin.health', { sourceId: 'source-1' }), { status: 'ready' })
  assert.deepEqual(await host.request('source.validate', { sourceId: 'source-1', config: { endpoint: 'https://example.test' } }), { valid: true })
  const result = await host.request<{ key: string; size: number }>('object.put', {
    sourceId: 'source-1', transferId: handle.id, size: handle.size, key: 'photo.jpg',
  })
  assert.deepEqual(result, { key: 'photo.jpg', size: data.byteLength, urlType: 'public', url: 'https://example.test/photo.jpg' })
  assert.equal((await host.request<{ url: string }>('object.getUrl', { sourceId: 'source-1', key: 'photo.jpg' })).url, 'https://example.test/photo.jpg')

  const downloadHandle = { id: 'download-test', size: 0 }
  host.setDownloadTransfer(downloadHandle)
  const downloaded = await host.request<{ key: string; size: number }>('object.get', {
    sourceId: 'source-1', transferId: downloadHandle.id, key: 'photo.jpg',
  })
  assert.equal(downloaded.size, 'downloaded object'.length)
  assert.deepEqual(new TextDecoder().decode(host.readDownloadTransfer(downloadHandle.id)), 'downloaded object')

  running.close()
  host.close()
})

test('undeclared capability is rejected as structured error', async () => {
  const host = createFakeHost()
  const running = createStoragePlugin(createTestPlugin(), { input: host.pluginInput, output: host.pluginOutput })
  await assert.rejects(
    host.request('object.delete', { sourceId: 'source-1', key: 'photo.jpg' }),
    (error: unknown) => error instanceof PluginError && error.code === ERROR_CODES.CAPABILITY_MISSING,
  )
  running.close()
  host.close()
})

test('abort signal cancels an outbound request', async () => {
  const host = createFakeHost()
  const running = createStoragePlugin(createTestPlugin(), { input: host.pluginInput, output: host.pluginOutput })
  running.transport.on('plugin.never', () => new Promise(() => undefined))
  const controller = new AbortController()
  const promise = host.request('plugin.never', undefined, { signal: controller.signal })
  controller.abort()
  await assert.rejects(promise, (error: unknown) => error instanceof PluginError && error.code === ERROR_CODES.REQUEST_CANCELED)
  running.close()
  host.close()
})
