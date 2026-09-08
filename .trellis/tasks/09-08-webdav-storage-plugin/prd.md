# Desktop plugin marketplace: generic WebDAV storage plugin (fnOS preset)

## Goal

Add a new storage source plugin to the desktop plugin marketplace: a **generic WebDAV plugin**
that works with any WebDAV server (飞牛云 fnOS, Nextcloud, 坚果云, Synology, Alist, Apache/nginx
WebDAV …). fnOS (飞牛云) is the primary verified target and appears as a built-in preset, but the
plugin is not fnOS-specific: any standards-compliant WebDAV endpoint is in scope.

## Background

- Desktop storage plugins are external Node.js repositories executed by the packaged Node 22
  runtime, speaking JSON-RPC over stdio (`storage@1` capability domain, core API `1`).
- Reference implementation: `../mo-gallery-plugin-s3` (s3-compatible, v0.1.2).
- Marketplace index is maintained in the separate repo `../mo-gallery-plugin`
  (`ushaio/mo-gallery-plugin` on GitHub); desktop fetches
  `https://raw.githubusercontent.com/ushaio/mo-gallery-plugin/master/index.json`.
- Existing entries (`github`, `s3-compatible`) currently have empty `platforms: {}` (catalog
  display only). The WebDAV plugin follows the same staged rollout: index entry first, signed
  release artifacts later.

## Requirements

### R1 — New plugin repository `../mo-gallery-plugin-webdav`

- Mirrors the S3 plugin repository layout: `manifest.json`, `src/{main,manifest,plugin}.ts`,
  `dist/main.js` esbuild bundle, `package.json`, `pnpm-workspace.yaml`, `tsconfig*.json`,
  `PLUGIN.md`, `README.md`, `tests/contract.test.ts`.
- Plugin id `webdav`, version `0.1.0`, type `node`, runtime `node22`, entry `dist/main.js`,
  all 5 supported platforms, contribution `storage@1`.
- Pure-JS implementation using Node built-ins (`node:http`/`node:https`/`node:stream`) — no
  runtime dependencies beyond `@mo-gallery/desktop-plugin-sdk` (`file:` link like the S3 repo).

### R2 — WebDAV capability mapping (full `storage@1` surface)

| Capability | WebDAV method(s) |
|---|---|
| `plugin.health` | `PROPFIND depth:0` on base path, 10s timeout |
| `source.validate` | `PROPFIND depth:0` with credentials; map 401/403/404 to readable errors |
| `object.put` | `PUT` (streamed from transfer, `If-Match`/overwrite semantics), sha256 upload verification where server returns ETag |
| `object.get` | `GET` streamed back via `host.transfer.write` |
| `object.stat` | `PROPFIND depth:1` on the object |
| `object.list` | `PROPFIND depth:1` (XML parse, pagination via marker key + truncated response handling) |
| `object.move` | `MOVE` (server-side), fallback documented if server lacks `MOVE` support |
| `object.delete` | `DELETE` |
| `object.getUrl` | direct URL to the object (Basic-auth protected servers return the plain URL; no signed URLs in WebDAV) |
| `checksum` | ETag from PROPFIND/PUT response when available |
| `idempotency` | supported via deterministic PUT semantics (same key overwrites) |

- Basic Auth via credentialSchema `username` / `password` (format password). Credentials only
  flow through `context.credentials` (env-injected by the OS credential store) — never in
  manifest, RPC, or logs.
- Health timeout 10s (short), data-transfer socket timeout 5min (long) — same layering as S3.
- Retry (≤3, exponential backoff) only for 5xx / network timeouts, idempotent methods only.
- HTTPS strongly recommended; plain `http://` allowed with a config-schema warning (self-hosted
  LAN NAS like fnOS commonly use http).

### R3 — Config schema (schema-driven form, no frontend code changes)

Fields (all strings; rendered generically by `StorageTab.tsx`):

- `url` (required) — WebDAV root, e.g. `https://nas.local:5666/dav` (fnOS) or
  `https://dav.jianguoyun.com/dav/` (坚果云)
- `basePath` (optional) — subdirectory under the WebDAV root; **must not be re-applied by the
  plugin** because the host injects basePath into keys and blanks the config value
  (manager.go `pluginEnvironment`) — same semantic as the S3 plugin
- `publicUrl` (optional) — public URL prefix when the server exposes objects over HTTP without
  auth (e.g. reverse proxy); used by `object.getUrl` when set
- `urlMode` (optional) — `public` | `direct` (default `direct`)
- `preset` (optional, hidden from docs but accepted) — `fnos` etc.; informational only for now

`x-i18n` zh/en for every title/description. fnOS appears in the zh descriptions/docs as the
recommended example (fnOS WebDAV is typically `http://<ip>:5666/dav`).

### R4 — Marketplace listing in `../mo-gallery-plugin/index.json`

- New `webdav` entry following the existing entry shape (`platforms: {}` until a signed release
  exists), name "WebDAV (飞牛云 / 通用)", description zh+en via repo README, contributions
  mirroring the manifest, homepage/repository pointing to the new plugin repo.
- Run `npm run check` in `mo-gallery-plugin` to validate the index.

### R5 — Desktop frontend (mo-gallery-web, minimal)

- `StorageTab.tsx`: add a dedicated icon mapping for plugin id `webdav` (currently falls back to
  the generic puzzle icon; both market card and installed list). No other frontend changes —
  config/credential forms are schema-driven.
- No Go host changes: marketplace discovery, install, signature validation, and plugin runtime
  are generic. (Verify this claim during implementation by checking id whitelists — research
  suggests `PluginS3Compatible` is referenced in manager.go; confirm no id whitelist blocks
  `webdav`.)

### Out of scope (explicit)

- Signed release artifacts + GitHub Release upload (`package-desktop-plugin.mjs`, Ed25519 key) —
  separate release step after this task; requires the release private key.
- fnOS private APIs, S3-gateway mode, thumbnails/cache, partial-range downloads (plain GET only).
- Web 端（Next.js）storage provider — desktop only.

## Acceptance Criteria

- [ ] `../mo-gallery-plugin-webdav` exists with full plugin implementation; `pnpm build` produces
      a self-contained `dist/main.js` bundle (tsc typecheck + esbuild).
- [ ] `tests/contract.test.ts` (fake WebDAV server over `node:http`) passes: full contract walk
      getManifest → health → validate → put → get → stat → list → move → getUrl → delete, plus
      auth-failure and timeout cases. (Justified against "非必要不要编写测试代码": protocol
      contract implementation, replicating the established S3-plugin pattern.)
- [ ] `../mo-gallery-plugin/index.json` gains the `webdav` entry and `npm run check` passes.
- [ ] `StorageTab.tsx` renders a WebDAV-specific icon for the plugin id `webdav`;
      `cd desktop/frontend && npm run build` passes.
- [ ] No changes required to Go host code, or if a whitelist exists, it is extended and
      documented.
- [ ] README/PLUGIN.md documents fnOS preset configuration (endpoint, credentials) plus generic
      WebDAV usage.

## Notes

- User decision: WebDAV protocol (standard, inherently compatible with other WebDAV drives);
  generic plugin with fnOS as preset — not an fnOS-only plugin.
- The plugin repo intentionally lives outside the mo-gallery-web workspace (same as
  mo-gallery-plugin-s3) and is not committed to mo-gallery-web.
