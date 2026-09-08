# Adding a New Storage Plugin (Protocol Recipe)

> Recipe captured from shipping the `webdav` plugin (task 09-08-webdav-storage-plugin).
> Reference implementations: `../mo-gallery-plugin-s3` (AWS SDK based) and
> `../mo-gallery-plugin-webdav` (zero-dependency hand-written client).

## Repository layout

A new storage plugin lives in its **own repository outside the mo-gallery-web
workspace** (e.g. `../mo-gallery-plugin-<name>`), mirroring the S3/WebDAV
layout:

```
manifest.json            # authoritative for the host
src/main.ts              # createStoragePlugin(createXPlugin()).start()
src/manifest.ts          # PluginManifest mirror of manifest.json (keep in sync)
src/plugin.ts            # capability implementations
src/<provider>.ts        # provider client (optional)
tests/contract.test.ts   # fake provider + SDK createFakeHost
package.json             # dep: @mo-gallery/desktop-plugin-sdk via file: link
pnpm-workspace.yaml      # allowBuilds: esbuild: true
tsconfig.json / tsconfig.test.json
README.md / PLUGIN.md
```

Scripts: `build` = tsc declarations + esbuild single self-contained
`dist/main.js` (node22, ESM, createRequire banner); `test` = tsc noEmit test
config + `node --import tsx tests/contract.test.ts`.

## Manifest contract

- `coreApiVersion: "1"`, contribution `domain: "storage", apiVersion: "1"`.
- Top-level `capabilities` and the contribution's list must match the RPC
  methods actually implemented — the SDK rejects undeclared methods with
  `capability_missing`.
- `configSchema` / `credentialSchema` are plain string properties rendered
  generically by `desktop/frontend/src/pages/settings/StorageTab.tsx`
  (`schemaFields`); `x-i18n: {zh, en}` per field, `format: "password"` for
  secrets. No frontend code changes needed for a new plugin.
- `permissions: ["network:configured-endpoint"]` for network plugins.

## Host behavior to respect

- **basePath is host-owned**: `desktop/storage_plugins/manager.go`
  (`pluginEnvironment`) blanks `config.basePath` and injects the prefix into
  object keys. The plugin must never re-prepend basePath when building URLs.
- Credentials arrive as env vars `MO_STORAGE_PLUGIN_CREDENTIAL_<NAME>`; read
  only via `context.credentials` — never in manifest, RPC, or logs (SDK
  logger redacts automatically).
- Data bytes never ride the JSON-RPC channel: uploads read via
  `context.transfer.open({id, size}).stream()` (256KB chunks), downloads write
  sequentially via `context.transferWriter`.
- No plugin-id whitelist exists in the Go host. The only id constants
  (`PluginGitHub`, `PluginS3Compatible`) are in `storage_source_sync.go`'s
  `cloudSourceType` — unmapped ids simply skip cloud sync of the source.

## WebDAV-specific lessons (P0/P1 from review)

- **PROPFIND Depth:1 lists direct children only** (RFC 4918) — it is NOT an
  S3-style recursive prefix listing. To list a prefix, PROPFIND the prefix's
  own collection; on 404 fall back to the parent directory. A fake test
  server that returns all descendants hides this class of bug: the fake must
  implement true depth semantics.
- **Cursor pagination order must match the cursor comparison**: use
  code-unit ordering (`<`/`>`) for both the sort and the cursor filter.
  `localeCompare` orders case differently from `>` and silently drops keys
  across pages with mixed-case names.
- **PUT to a nested key 409s on real servers** (Apache mod_dav, nginx,
  Sabre/DAV) until the parent collection exists — MKCOL each missing path
  segment first, tolerating 200/301/405 (= already exists).
- A PUT that failed after body bytes hit the wire must not be retried.
- Hash an upload stream through a `Transform`, not a buffering Readable, so
  socket backpressure still applies.

## Marketplace listing

Index lives in the separate `../mo-gallery-plugin` repo
(`ushaio/mo-gallery-plugin` on GitHub; desktop hardcodes its raw master
`index.json`). Add an entry mirroring the manifest contributions; `platforms:
{}` until a signed release exists. Validate with `npm run check`. Signed
artifacts require the release Ed25519 key (`mo-gallery-plugins-v1`) via
`desktop/build/package-desktop-plugin.mjs` — a separate release step.

## Frontend icon

`StorageTab.tsx` maps plugin ids to lucide icons at four sites
(`storageTypeMeta` ~line 197, market card ~521, installed list ~568, source
row ~645). Add the new id or it falls back to the puzzle icon (cosmetic
only).
