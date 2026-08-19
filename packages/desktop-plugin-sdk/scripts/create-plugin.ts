import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const name = process.argv[2]?.trim()
if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error('Usage: pnpm create-plugin <plugin-directory-name>')
  process.exit(1)
}

const root = resolve(process.cwd(), name)
const manifest = JSON.stringify({ id: `${name}.storage`, version: '0.1.0', apiVersion: '1', type: 'node', runtime: 'node22', entry: 'dist/main.js', platforms: ['windows-amd64', 'darwin-amd64', 'darwin-arm64', 'linux-amd64', 'linux-arm64'], capabilities: ['plugin.health', 'source.validate', 'object.put', 'object.getUrl'], configSchema: { type: 'object', properties: {} }, credentialSchema: { type: 'object', properties: {} } }, null, 2) + '\n'
const files: Record<string, string> = {
  'manifest.json': manifest,
  'src/index.ts': `import { createStoragePlugin, type StoragePlugin } from '@mo-gallery/desktop-plugin-sdk'\n\nconst plugin: StoragePlugin = {\n  manifest: (await import('../manifest.json', { with: { type: 'json' } })).default,\n  async validate() { return { valid: true } },\n  async health() { return { status: 'ready' } },\n  async put(request) { return { key: request.key, size: request.size, urlType: 'public' } },\n  async getUrl(request) { return { key: request.key, size: 0, urlType: 'public' } },\n}\n\ncreateStoragePlugin(plugin).start()\n`,
  'src/plugin.ts': `import type { StoragePlugin } from '@mo-gallery/desktop-plugin-sdk'\n\nexport function createPlugin(): StoragePlugin {\n  throw new Error('Implement provider operations in src/plugin.ts')\n}\n`,
  'package.json': JSON.stringify({ name, private: true, type: 'module', scripts: { build: 'tsc -p tsconfig.json' }, dependencies: { '@mo-gallery/desktop-plugin-sdk': '^0.1.0' }, devDependencies: { '@types/node': '^20', typescript: '^5' } }, null, 2) + '\n',
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, outDir: 'dist', rootDir: 'src', resolveJsonModule: true, esModuleInterop: true }, include: ['src/**/*.ts'] }, null, 2) + '\n',
  'vitest.config.ts': `import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { environment: 'node' } })\n`,
}

for (const [relative, contents] of Object.entries(files)) {
  const target = resolve(root, relative)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, contents, { flag: 'wx' })
}
console.log(`Created ${root}`)
