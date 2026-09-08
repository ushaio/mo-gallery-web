# Design — Generic WebDAV storage plugin (`webdav`)

## Boundaries & Repositories

| Repo | Role | Changes |
|---|---|---|
| `../mo-gallery-plugin-webdav` (new) | Plugin source | Everything: manifest, src, tests, build config, docs |
| `../mo-gallery-plugin` | Marketplace index | `index.json` new entry |
| `mo-gallery-web` | Desktop host + frontend | `StorageTab.tsx` icon only (verify no Go whitelist) |

No changes to `packages/desktop-plugin-sdk`, `desktop/storage_plugins/*.go` (unless an id
whitelist blocks `webdav` — to be verified first).

## Manifest contract

```jsonc
{
  "id": "webdav",
  "version": "0.1.0",
  "coreApiVersion": "1",
  "apiVersion": "1",
  "type": "node",
  "runtime": "node22",
  "entry": "dist/main.js",
  "platforms": ["windows-amd64", "darwin-amd64", "darwin-arm64", "linux-amd64", "linux-arm64"],
  "capabilities": [/* same list as contributions */],
  "contributions": [{
    "domain": "storage", "apiVersion": "1",
    "capabilities": ["plugin.health", "source.validate", "object.put", "object.get",
                     "object.stat", "object.list", "object.move", "object.delete",
                     "object.getUrl", "checksum", "idempotency"]
  }],
  "permissions": ["network:configured-endpoint"],
  "configSchema": { url*, basePath, publicUrl, urlMode },
  "credentialSchema": { username*, password* (format: password) }
}
```

`src/manifest.ts` mirrors `manifest.json` (SDK `PluginManifest` type); `manifest.json` is
authoritative for the host.

## WebDAV client layer (`src/webdav.ts`)

Hand-rolled minimal client on `node:https`/`node:http` — no external deps:

- `request(method, url, {headers, bodyStream?, timeoutMs})` → `{status, headers, bodyStream?}`
  using `http.request`; response consumed lazily so `put`/`get` stream without buffering.
- Basic Auth: `Authorization: Basic base64(user:pass)` from `context.credentials`.
- `propfind(path, depth)` → parsed multistatus document (hand-written regex-free XML parser via
  `node:stream` + a small XML tokenizer, or a ~100-line parser over `<D:response>` blocks —
  decision: small hand parser, no dependency; must handle namespace prefixes variants
  `D:`/`d:`/no-namespace).
- URL/key encoding: percent-encode path segments (keys are slash-separated relative paths);
  reject absolute paths and `..` segments (`cleanPrefix`-style normalization copied from S3
  plugin semantics, applied to keys not config).

### Capability mapping

- `health` → `PROPFIND url depth:0` expect 207 (or 200/204 for lenient servers); 10s timeout.
- `validate` → same call but distinct error mapping: 401/403 → `invalid_config` "用户名或密码错
  误 / 认证被拒绝"; 404 → `invalid_config` "WebDAV 路径不存在"; DNS/timeout → readable network
  error. Return `{valid:true}` on success.
- `put` → stream from `ctx.transfer.open({id,size}).stream()` into `PUT url/key`; verify server
  ETag/checksum when present; return `ObjectInfo` with `checksum` = strong ETag if quoted-hex
  else sha256 computed over the streamed body (tee the stream through a hash when the request
  carried a sha256 checksum, same approach as S3 `ChecksumSHA256`).
- `get` → `GET url/key`; pipe body into `ctx.transferWriter` sequential 256KB writes.
- `stat` → `PROPFIND depth:1` on object; 404 → `PluginError('invalid_object_key'|provider_error)`.
- `list` → `PROPFIND depth:1` on prefix directory; parse `<D:response>` entries, strip
  `basePath`, filter prefix, exclude the directory itself; cursor = last returned key
  (lexicographic marker), `hasMore` via sorted re-application (WebDAV has no server-side
  pagination; PROPFIND depth 1 per directory keeps payloads bounded; recurse option not needed).
- `move` → `MOVE` with `Destination` header (absolute URL of target); handle 405/501 (server
  without MOVE) with clear `provider_error`.
- `delete` → `DELETE`; 404 tolerated as success? No — surface `provider_error` with HTTP status.
- `getUrl` → `publicUrl` + encoded key when `urlMode=public` and `publicUrl` set; otherwise the
  direct `url` + key with `urlType: 'public'` (direct URL; document that Basic-auth servers
  require the client to supply credentials — desktop renders it as a link).

### Error / retry / timeout layering (copied from S3 semantics)

- `normalizeWebdavError` maps HTTP status + method to `PluginError` with readable message
  including status code; never log credentials (SDK logger already redacts).
- `withRetry` (3 attempts, 250ms×2^attempt) only for idempotent verbs on 5xx/timeouts
  (PROPFIND/GET/DELETE/MOVE retry-safe; PUT retried only if the first attempt failed before any
  body byte was sent — simpler: retry PUT only on connect errors).
- health/validate 10s; transfers 5min socket timeout.

## Compatibility & rollout

- Index entry first with `platforms: {}` (display-only, matches existing `github`/
  `s3-compatible` entries); signed artifact upload + release is a follow-up release step
  (needs the Ed25519 release key, out of scope).
- Local verification path: developer-mode install via
  `InstallDesktopSystemPluginPackage` on the built plugin directory, then configure a source
  pointing at a local test WebDAV server (or fnOS instance) in Settings → Storage.

## Trade-offs

- Hand-rolled HTTP+XML vs `webdav` npm package: zero runtime deps keeps the bundle small and
  avoids supply-chain surface; cost is ~200 lines of XML multistatus parsing. Chosen: hand-rolled,
  mitigated by contract tests against a fake WebDAV server.
- fnOS preset: informational (config descriptions/docs) rather than structural — the generic
  schema covers all WebDAV servers; a dedicated preset selector would add schema/UI surface
  without changing behavior.
- `object.getUrl` on auth-protected servers returns a URL the browser can't fetch without
  credentials — documented limitation, same as direct URLs in the S3 plugin.
