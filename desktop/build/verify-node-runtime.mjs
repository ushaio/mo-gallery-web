#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash, createPublicKey, verify } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

const SUPPORTED_PLATFORMS = [
  'darwin-amd64',
  'darwin-arm64',
  'linux-amd64',
  'linux-arm64',
  'windows-amd64',
]

function usage() {
  console.error('Usage: node verify-node-runtime.mjs --root <runtime-root> --manifest <manifest.json> [--public-key <key.pem>]')
  process.exit(2)
}

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function readPublicKey(path) {
  const value = readFileSync(resolve(path), 'utf8').trim()
  if (value.includes('BEGIN PUBLIC KEY')) return value
  const der = Buffer.from(value, 'base64')
  if (der.length === 0) throw new Error('public key file is empty')
  return createPublicKey({ key: der, format: 'der', type: 'spki' })
}

const rootArgument = argument('--root')
const manifestArgument = argument('--manifest')
const publicKeyArgument = argument('--public-key')
if (!rootArgument || !manifestArgument) usage()

const root = resolve(rootArgument)
const manifestPath = resolve(manifestArgument)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const version = String(manifest.version || '')
const files = manifest.files
if (!/^\d+\.\d+\.\d+$/.test(version) || !files || typeof files !== 'object' || Array.isArray(files)) {
  throw new Error('runtime manifest must contain a semantic version and files map')
}

for (const platform of SUPPORTED_PLATFORMS) {
  const relativePath = files[platform]
  if (typeof relativePath !== 'string' || relativePath.trim() === '') {
    throw new Error(`runtime manifest is missing ${platform}`)
  }
  const expectedPath = `${platform}/node${platform === 'windows-amd64' ? '.exe' : ''}`
  if (relativePath !== expectedPath) {
    throw new Error(`runtime manifest uses an unexpected file layout: ${platform}`)
  }
  const target = resolve(root, relativePath)
  const targetRelative = relative(root, target)
  if (!targetRelative || targetRelative.startsWith('..') || isAbsolute(targetRelative)) {
    throw new Error(`runtime path escapes root: ${platform}`)
  }
  const info = statSync(target)
  if (!info.isFile()) throw new Error(`runtime is not a regular file: ${platform}`)
  const actualHash = createHash('sha256').update(readFileSync(target)).digest('hex')
  const expectedHash = String(manifest.sha256?.[platform] || '').toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || actualHash !== expectedHash) {
    throw new Error(`runtime SHA-256 mismatch: ${platform}`)
  }
  if (!relativePath.endsWith('.exe') && (info.mode & 0o111) === 0) {
    throw new Error(`runtime is not executable: ${platform}`)
  }
}

const signature = String(manifest.signature || '')
const publicKey = publicKeyArgument
  ? readPublicKey(publicKeyArgument)
  : String(manifest.publicKey || '')
if (!signature || !publicKey) throw new Error('runtime manifest signature and Ed25519 public key are required')
const signedPayload = Buffer.from(JSON.stringify({ version, files, sha256: manifest.sha256 }), 'utf8')
if (!verify(null, signedPayload, publicKey, Buffer.from(signature, 'base64'))) {
  throw new Error('runtime manifest Ed25519 signature verification failed')
}

const hostPlatform = `${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch === 'x64' ? 'amd64' : process.arch}`
if (SUPPORTED_PLATFORMS.includes(hostPlatform)) {
  const runtimePath = resolve(root, files[hostPlatform])
  const output = execFileSync(runtimePath, ['--version'], { encoding: 'utf8', timeout: 5000 }).trim()
  if (!output.includes(`v${version}`) && !output.includes(version)) {
    throw new Error(`runtime version mismatch: expected ${version}, got ${output}`)
  }
}

console.log(`Verified Node runtime ${version} for ${SUPPORTED_PLATFORMS.length} platforms.`)
