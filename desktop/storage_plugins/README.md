# Desktop Storage Adapter Plugins

This package defines the Desktop-only storage adapter boundary. A plugin is an
external process plus a `manifest.json`; it may be a native executable or a
Node/JavaScript process started by the bundled Node runtime. The manifest is
metadata and a capability declaration, not the implementation.

## Package layout

```text
my-storage-plugin/
  manifest.json
  dist/main.js                  # type: node
  bin/windows-amd64/plugin.exe  # type: executable (optional)
```

The manifest must contain:

```json
{
  "id": "example.storage",
  "version": "1.0.0",
  "apiVersion": "1",
  "type": "node",
  "runtime": "node22",
  "name": "Example Storage",
  "entry": "dist/main.js",
  "platforms": ["windows-amd64", "darwin-amd64", "darwin-arm64", "linux-amd64", "linux-arm64"],
  "capabilities": [
    "source.validate",
    "plugin.health",
    "object.put",
    "object.delete",
    "object.getUrl"
  ],
  "configSchema": { "type": "object", "properties": {} },
  "credentialSchema": { "type": "object", "properties": {} }
}
```

For a Node plugin, `entry` is a platform-independent JavaScript entry and the
host selects its bundled Node runtime. For a native plugin, use `binaries` to
map platform keys to relative executable paths; older manifests with only
`entry` remain valid and are treated as `type: executable`. The host rejects
absolute paths, path traversal, symbolic links, missing entries, mismatched
IDs, unsupported platforms, and unsupported API versions.

## Bundled Node runtime

The host currently supports the pinned `node22` runtime (`22.14.0`). Desktop
release preparation places one verified executable for each supported target in
`runtime_assets`, which is compiled into the Go application by `go:embed`:

```text
desktop/storage_plugins/runtime_assets/windows-amd64/node.exe
desktop/storage_plugins/runtime_assets/darwin-amd64/node
desktop/storage_plugins/runtime_assets/darwin-arm64/node
desktop/storage_plugins/runtime_assets/linux-amd64/node
desktop/storage_plugins/runtime_assets/linux-arm64/node
desktop/storage_plugins/runtime_assets/runtime-manifest.json
```

`NewManager` materializes the embedded files into a versioned directory in the
Desktop configuration directory. The runtime is selected from that verified
application bundle, never from renderer input, a plugin manifest, or the
system `PATH`. Release automation verifies the archive checksum, manifest
signature, executable permissions, and pinned version before Wails compiles
the application. Builds without prepared runtime assets intentionally report
`runtime_missing` for Node plugins.

The runtime public key and official plugin public key are compile-time trust
roots supplied by release `-ldflags`; no runtime signing key or plugin private
key is shipped in the application or repository.

## Process protocol

The host starts the entry process and communicates with JSON-RPC 2.0 messages
over stdin/stdout, one JSON object per line. The plugin must implement:

| Method | Required capability | Purpose |
| --- | --- | --- |
| `plugin.getManifest` | bootstrap | Return the runtime manifest |
| `source.validate` | `source.validate` | Validate the configured source |
| `plugin.health` | `plugin.health` | Check provider availability |
| `object.put` | `object.put` | Upload one object |
| `object.get` | `object.get` | Read one object through a host transfer |
| `object.stat` | `object.stat` | Read object metadata |
| `object.list` | `object.list` | List objects with a bounded cursor |
| `object.move` | `object.move` | Move an object when explicitly declared |
| `object.delete` | `object.delete` | Delete one object |
| `object.getUrl` | `object.getUrl` | Return a public or temporary URL |

For `object.put`, the host sends a transfer ID rather than file contents. The
plugin reads chunks by sending `host.transfer.read` requests back to the host.
For `object.get`, the host sends a writable transfer ID and destination remains
host-owned; the plugin writes bounded base64 chunks through
`host.transfer.write`. Tokens and secret values are never placed in the
manifest or source registry; the host resolves credential references and
supplies them to the process.

The host owns process lifecycle, timeouts, cancellation, transfer streaming,
credential storage, retry/registration flow, and the Web photo metadata
contract. The plugin author owns the remote service API, authentication
details, object key rules, and provider-specific error handling.

This is a storage adapter contract. Plugins cannot inject React/HTML UI or
arbitrary Desktop business logic; configuration forms are rendered by Desktop
from the manifest schemas.

The official S3-compatible/R2 adapter is implemented in
`packages/desktop-plugin-s3` as a Node/TypeScript package using the AWS SDK's
JavaScript client. Its one `dist/main.js` artifact is shared by all five
supported platforms. Native or legacy executable adapters may still be
installed from an unpacked development directory, but production packages
must contain `checksums.json` and an Ed25519 signature and pass host
verification before installation.
