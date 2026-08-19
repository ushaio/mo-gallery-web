#!/usr/bin/env node

import { createHash, sign } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const rootArgument = process.argv.indexOf('--root')
const outputArgument = process.argv.indexOf('--output')
const keyArgument = process.argv.indexOf('--private-key')
const keyIDArgument = process.argv.indexOf('--key-id')
if (rootArgument < 0 || outputArgument < 0 || keyArgument < 0 || keyIDArgument < 0) {
  throw new Error('Usage: node package-desktop-plugin.mjs --root <package> --output <zip> --private-key <pem> --key-id <id>')
}

const root = resolve(process.argv[rootArgument + 1])
const output = resolve(process.argv[outputArgument + 1])
const privateKeyPath = resolve(process.argv[keyArgument + 1])
const keyID = process.argv[keyIDArgument + 1].trim()
if (!keyID) throw new Error('plugin signing key id is required')

const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))
manifest.signingKeyId = keyID
mkdirSync(dirname(output), { recursive: true })
const stage = mkdtempSync(join(resolve(process.env.RUNNER_TEMP || dirname(output)), 'mo-gallery-plugin-'))
try {
  writeFileSync(join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  for (const relativeRoot of ['dist', 'bin']) {
    const source = join(root, relativeRoot)
    try {
      if (statSync(source).isDirectory()) cpSync(source, join(stage, relativeRoot), { recursive: true })
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  const icon = join(root, 'icon.png')
  try { if (statSync(icon).isFile()) cpSync(icon, join(stage, 'icon.png')) } catch (error) { if (error.code !== 'ENOENT') throw error }

  const payloadFiles = []
  const collect = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) collect(absolute)
      else if (entry.isFile()) payloadFiles.push(relative(stage, absolute).replaceAll('\\', '/'))
      else throw new Error(`plugin package contains an unsupported file: ${absolute}`)
    }
  }
  collect(stage)
  payloadFiles.sort()
  const checksums = Object.fromEntries(payloadFiles.map((file) => [
    file,
    createHash('sha256').update(readFileSync(join(stage, file))).digest('hex'),
  ]))
  const checksumsData = Buffer.from(`${JSON.stringify(checksums, null, 2)}\n`, 'utf8')
  writeFileSync(join(stage, 'checksums.json'), checksumsData)
  writeFileSync(join(stage, 'signature.sig'), sign(null, checksumsData, readFileSync(privateKeyPath, 'utf8')))
  try {
    execFileSync('zip', ['-q', '-r', output, 'manifest.json', 'checksums.json', 'signature.sig', ...payloadFiles.filter((file) => file !== 'manifest.json')], { cwd: stage, stdio: 'inherit' })
  } catch (error) {
    throw new Error(`cannot create plugin zip; install the zip utility on the packaging runner: ${error.message}`)
  }
  console.log(`Created signed plugin package ${output}`)
} finally {
  rmSync(stage, { recursive: true, force: true })
}
