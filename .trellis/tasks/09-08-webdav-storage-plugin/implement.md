# Implement — Generic WebDAV storage plugin

Ordered checklist. Validation commands assume repo-rooted shells.

## 0. Pre-flight verification (in mo-gallery-web)

- [ ] Verify no Go-side plugin-id whitelist blocks `webdav`: grep `desktop/storage_plugins/` for
      `PluginS3Compatible` / id constants / hardcoded id checks. If `webdav` is blocked, extend
      the whitelist and note it in the PRD acceptance list.
- [ ] Read `packages/desktop-plugin-sdk/README.md` + `src/types.ts` once to confirm the exact
      `StoragePlugin` interface shape (names may differ slightly from research summary).

## 1. Scaffold `../mo-gallery-plugin-webdav`

- [ ] `package.json` (`@mo-gallery/desktop-plugin-webdav`, private, `type: module`,
      deps: `@mo-gallery/desktop-plugin-sdk` via `file:../mo-gallery-web/packages/desktop-plugin-sdk`;
      devDeps: esbuild, typescript, @types/node, tsx; scripts: build / test mirroring S3).
- [ ] `pnpm-workspace.yaml` (allowBuilds: esbuild), `tsconfig.json` / `tsconfig.test.json`.
- [ ] `manifest.json` + `src/manifest.ts` (per design.md).

## 2. WebDAV client + plugin core

- [ ] `src/webdav.ts`: http(s) request helper (streaming, timeouts), Basic auth header,
      percent-encoding for keys, PROPFIND builder + multistatus XML parser (namespace-prefix
      tolerant), error normalization.
- [ ] `src/plugin.ts`: `createWebdavPlugin()` implementing validate/health/put/get/stat/list/
      move/delete/getUrl with retry + timeout layering; config reader (url required, basePath
      semantics: host blanks it — never re-prepend), credential reader (username/password).
- [ ] `src/main.ts`: 4-line entry.

## 3. Tests (replicate S3 contract-test pattern)

- [ ] `tests/contract.test.ts` with a fake WebDAV `node:http` server implementing
      PROPFIND/PUT/GET/MOVE/DELETE:
      full walk getManifest → health → validate → put → get → stat → list → move → getUrl →
      delete; 401 wrong-credentials case; unreachable-server timeout case.
      Uses `createFakeHost()` + `createStoragePlugin(plugin, {input, output, env})` from the SDK.

## 4. Build + local verification

- [ ] `pnpm install && pnpm build` in the plugin repo → `dist/main.js` self-contained bundle,
      tsc typecheck clean.
- [ ] `pnpm test` passes.
- [ ] Manual smoke (if a fnOS/WebDAV endpoint is available): developer-mode install via
      Settings → Storage → 插件 (InstallDesktopSystemPluginPackage), create source, verify
      upload/download. Otherwise rely on contract tests + fake host.

## 5. Marketplace index (`../mo-gallery-plugin`)

- [ ] Add `webdav` entry to `index.json` (`platforms: {}`, contributions mirroring manifest,
      homepage/repository = plugin repo URL placeholder consistent with existing entries).
- [ ] `npm run check` in `mo-gallery-plugin`.

## 6. Frontend icon (mo-gallery-web)

- [ ] `desktop/frontend/src/pages/settings/StorageTab.tsx`: map plugin id `webdav` to a fitting
      existing lucide icon (e.g. `Cloud`/`HardDrive`/`Globe`) in both market-card and installed
      icon lookup spots (~lines 522/565).
- [ ] `cd desktop/frontend && npm run build`.

## 7. Docs

- [ ] Plugin repo `README.md` (中文为主): build/run, fnOS preset config example
      (`http://<ip>:5666/dav`, username/password), 坚果云/Nextcloud examples, limitations
      (getUrl on auth servers), release sign-off pointer.
- [ ] `PLUGIN.md`: capability contract summary, distribution contract (dist + manifest +
      checksums + signature), same structure as S3 PLUGIN.md.

## 8. Finish (Trellis phase 3)

- [ ] Quality check (typecheck, builds, contract tests, lint sanity on touched area).
- [ ] Spec update: record the "new storage plugin" recipe into
      `.trellis/spec/desktop-plugin-sdk/backend/` if not already captured.
- [ ] Commit mo-gallery-web changes (StorageTab icon) — Conventional Commit
      `feat(desktop): add webdav storage plugin icon for marketplace entry`.
      Plugin repo and index repo commits happen in their own repos (mention in wrap-up; user
      decides push timing).

## Rollback

- Plugin repo is new — delete directory.
- `index.json` entry: revert single-file change.
- mo-gallery-web: revert `StorageTab.tsx` icon edit (single-file, additive).

## Review gates

- After step 2 (core implemented): self-review protocol mapping vs design.md before tests.
- After step 4: contract test pass is the hard gate for "implementation complete".
- Steps 5–6 only after step 4 passes.
