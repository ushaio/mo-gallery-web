#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION = '22.14.0'
const BASE_URL = `https://nodejs.org/dist/v${VERSION}`
const RELEASES = [
  { platform: 'windows-amd64', archive: `node-v${VERSION}-win-x64.zip`, binary: 'node.exe' },
  { platform: 'darwin-amd64', archive: `node-v${VERSION}-darwin-x64.tar.gz`, binary: 'bin/node' },
  { platform: 'darwin-arm64', archive: `node-v${VERSION}-darwin-arm64.tar.gz`, binary: 'bin/node' },
  { platform: 'linux-amd64', archive: `node-v${VERSION}-linux-x64.tar.xz`, binary: 'bin/node' },
  { platform: 'linux-arm64', archive: `node-v${VERSION}-linux-arm64.tar.xz`, binary: 'bin/node' },
]

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

async function download(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`download failed (${response.status}): ${url}`)
  return Buffer.from(await response.arrayBuffer())
}

function extractArchive(archivePath, extractRoot) {
  const isZip = archivePath.toLowerCase().endsWith('.zip')
  // GitHub's Linux runner has unzip installed explicitly by the release
  // workflow. Windows ships bsdtar, which can read the Node .zip archive.
  const command = isZip && process.platform !== 'win32' ? 'unzip' : 'tar'
  const args = isZip && process.platform !== 'win32'
    ? ['-q', archivePath, '-d', extractRoot]
    : ['-xf', archivePath, '-C', extractRoot]
  try {
    execFileSync(command, args, { stdio: 'inherit' })
  } catch (error) {
    const utility = isZip && process.platform !== 'win32' ? 'unzip' : 'tar/bsdtar'
    throw new Error(`cannot extract ${archivePath}; install ${utility} on the release runner: ${error.message}`)
  }
}

const privateKeyPath = argument('--private-key')
if (!privateKeyPath) throw new Error('--private-key is required')
const outputRoot = resolve(argument('--output-root', join(process.cwd(), 'storage_plugins', 'runtime_assets')))
const publicKeyOutput = resolve(argument('--public-key-output', join(dirname(outputRoot), 'node-runtime-public-key.b64')))
const pluginPublicKeyPath = argument('--plugin-public-key')
const pluginPublicKeyOutput = argument('--plugin-public-key-output')
const checksumText = (await download(`${BASE_URL}/SHASUMS256.txt`)).toString('utf8')
const stagingRoot = mkdtempSync(join(resolve(argument('--temp-root', process.env.RUNNER_TEMP || process.cwd())), 'mo-gallery-node-runtime-'))

try {
  const sourceRoot = join(stagingRoot, 'source')
  mkdirSync(sourceRoot, { recursive: true })
  for (const release of RELEASES) {
    const archivePath = join(stagingRoot, release.archive)
    const archive = await download(`${BASE_URL}/${release.archive}`)
    const actual = createHash('sha256').update(archive).digest('hex')
    const line = checksumText.split(/\r?\n/).find((value) => value.trim().endsWith(`  ${release.archive}`) || value.trim().endsWith(` *${release.archive}`))
    const expected = line?.trim().split(/\s+/)[0]?.toLowerCase()
    if (!expected || actual !== expected) throw new Error(`Node archive SHA-256 mismatch: ${release.archive}`)
    writeFileSync(archivePath, archive)

    const extractRoot = join(stagingRoot, `extract-${release.platform}`)
    mkdirSync(extractRoot)
    extractArchive(archivePath, extractRoot)
    const topLevel = readdirSync(extractRoot, { withFileTypes: true }).find((entry) => entry.isDirectory())
    if (!topLevel) throw new Error(`Node archive has no top-level directory: ${release.archive}`)
    const sourceBinary = join(extractRoot, topLevel.name, release.binary)
    const targetBinary = join(sourceRoot, release.platform, release.platform === 'windows-amd64' ? 'node.exe' : 'node')
    mkdirSync(dirname(targetBinary), { recursive: true })
    copyFileSync(sourceBinary, targetBinary)
    if (release.platform !== 'windows-amd64') chmodSync(targetBinary, 0o755)
  }

  const prepareScript = resolve(dirname(fileURLToPath(import.meta.url)), 'prepare-node-runtime.mjs')
  const args = [prepareScript, '--source-root', sourceRoot, '--output-root', outputRoot, '--private-key', resolve(privateKeyPath), '--public-key-output', publicKeyOutput]
  if (pluginPublicKeyPath && pluginPublicKeyOutput) args.push('--plugin-public-key', resolve(pluginPublicKeyPath), '--plugin-public-key-output', resolve(pluginPublicKeyOutput))
  execFileSync(process.execPath, args, { stdio: 'inherit' })
} finally {
  rmSync(stagingRoot, { recursive: true, force: true })
}
