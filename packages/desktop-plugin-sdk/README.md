# `@mo-gallery/desktop-plugin-sdk`

This package is the TypeScript/JavaScript SDK for Desktop system plugins. The
first capability domain is storage; other domains can be declared without
changing the core lifecycle contract.
Plugins run as a separate Node process and communicate with the Desktop host
using JSON-RPC 2.0 over stdin/stdout. `stdout` is protocol-only; diagnostics
go to `stderr` through the supplied logger.

The SDK exposes only the storage host contract. A plugin does not receive
Wails bindings, the renderer DOM, SQLite, the Desktop configuration directory,
or arbitrary local file paths. Uploads use a `transferId`; the host serves
bounded chunks through `host.transfer.read`. Downloads use a host-created
`transferId`; the plugin writes bounded chunks through `host.transfer.write`.

Legacy manifests with `apiVersion` and top-level `capabilities` are interpreted
as `storage@1`. New manifests should declare domains explicitly:

```json
{
  "id": "example.publisher",
  "version": "1.0.0",
  "coreApiVersion": "1",
  "runtime": { "type": "node", "version": "node22", "entry": "dist/main.js" },
  "contributions": [
    { "domain": "storage", "apiVersion": "1", "capabilities": ["object.put"] },
    { "domain": "export", "apiVersion": "1", "capabilities": ["export.publish"] }
  ],
  "permissions": ["network:https://example.test"]
}
```

The Host authorizes each contribution independently. Unsupported UI
contributions are rejected and cannot execute renderer code.

## Minimal plugin

```ts
import { createStoragePlugin, type StoragePlugin } from '@mo-gallery/desktop-plugin-sdk'

const plugin: StoragePlugin = {
  manifest: {
    id: 'example.storage',
    version: '1.0.0',
    apiVersion: '1',
    type: 'node',
    runtime: 'node22',
    entry: 'dist/main.js',
    capabilities: ['plugin.health', 'source.validate', 'object.put', 'object.getUrl'],
  },
  async validate() { return { valid: true } },
  async health() { return { status: 'ready' } },
  async put(request, context) {
    for await (const chunk of context.transfer.open({ id: request.transferId, size: request.size }).stream()) {
      // Send each chunk to the provider; do not read the whole file into memory.
      void chunk
    }
    return { key: request.key, size: request.size, urlType: 'public' }
  },
  async get(request, context) {
    const writer = context.transferWriter.open({ id: request.transferId, size: 0 })
    const bytes = new TextEncoder().encode('object bytes')
    await writer.write(0, bytes)
    return { key: request.key, size: bytes.byteLength, urlType: 'public' }
  },
  async getUrl(request) {
    return { key: request.key, size: 0, urlType: 'public', url: `https://example.test/${request.key}` }
  },
}

createStoragePlugin(plugin).start()
```

Declare every operation in `manifest.capabilities`. The host rejects calls for
undeclared capabilities and keeps credentials out of RPC parameters and logs.
Use `pnpm --filter @mo-gallery/desktop-plugin-sdk test` for the local fake-host
contract tests and `pnpm --filter @mo-gallery/desktop-plugin-sdk build` to emit
the distributable JavaScript package.
