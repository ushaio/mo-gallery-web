#!/usr/bin/env node

import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const VERSION = '22.14.0'
const PLATFORMS = ['darwin-amd64', 'darwin-arm64', 'linux-amd64', 'linux-arm64', 'windows-amd64']

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const sourceRoot = resolve(argument('--source-root', join(process.cwd(), 'node-runtime')))
const outputRoot = resolve(argument('--output-root', join(process.cwd(), 'storage_plugins', 'runtime_assets')))
const privateKeyPath = argument('--private-key')
const publicKeyOutput = argument('--public-key-output')
const pluginPublicKeyPath = argument('--plugin-public-key')
const pluginPublicKeyOutput = argument('--plugin-public-key-output')
if (!privateKeyPath) {
  throw new Error('--private-key is required; release builds must sign the runtime manifest')
}

const files = Object.fromEntries(PLATFORMS.map((platform) => [
  platform,
  `${platform}/node${platform === 'windows-amd64' ? '.exe' : ''}`,
]))
const sha256 = {}
for (const platform of PLATFORMS) {
  const source = resolve(sourceRoot, files[platform])
  const data = readFileSync(source)
  sha256[platform] = createHash('sha256').update(data).digest('hex')
  const target = join(outputRoot, files[platform])
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(source, target)
  if (!platform.startsWith('windows-')) chmodSync(target, 0o755)
}

const signedPayload = JSON.stringify({ version: VERSION, files, sha256 })
const privateKey = readFileSync(resolve(privateKeyPath), 'utf8')
const signature = sign(null, Buffer.from(signedPayload), privateKey).toString('base64')
const publicKey = createPublicKey(createPrivateKey(privateKey)).export({ type: 'spki', format: 'pem' })
const manifest = { version: VERSION, files, sha256, signature, publicKey }
mkdirSync(outputRoot, { recursive: true })
writeFileSync(join(outputRoot, 'runtime-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
const publicKeyBase64 = createPublicKey(createPrivateKey(privateKey)).export({ type: 'spki', format: 'der' }).toString('base64')
if (publicKeyOutput) {
  mkdirSync(dirname(resolve(publicKeyOutput)), { recursive: true })
  writeFileSync(resolve(publicKeyOutput), `${publicKeyBase64}\n`)
}
if (pluginPublicKeyPath && pluginPublicKeyOutput) {
  const pluginPublicKey = readFileSync(resolve(pluginPublicKeyPath), 'utf8')
  const pluginPublicKeyBase64 = createPublicKey(pluginPublicKey).export({ type: 'spki', format: 'der' }).toString('base64')
  mkdirSync(dirname(resolve(pluginPublicKeyOutput)), { recursive: true })
  writeFileSync(resolve(pluginPublicKeyOutput), `${pluginPublicKeyBase64}\n`)
}

const verifier = resolve(dirname(fileURLToPath(import.meta.url)), 'verify-node-runtime.mjs')
execFileSync(process.execPath, [verifier, '--root', outputRoot, '--manifest', join(outputRoot, 'runtime-manifest.json')], { stdio: 'inherit' })
console.log(`Prepared signed Node ${VERSION} runtime at ${outputRoot}`)
