import 'server-only'

import { lookup } from 'node:dns/promises'
import { request } from 'node:https'
import { isIP } from 'node:net'
import { Readable } from 'node:stream'

export type SafeRemoteImageAddress = {
  address: string
  family: 4 | 6
}

export type SafeRemoteImageResolver = (hostname: string) => Promise<SafeRemoteImageAddress[]>

type SafeRemoteImageFetchOptions = {
  addresses: SafeRemoteImageAddress[]
  redirect: 'manual'
  signal?: AbortSignal
}

type SafeRemoteImageResponse = Pick<Response, 'body' | 'headers' | 'ok' | 'status'>

export type SafeRemoteImageFetch = (
  url: string,
  options: SafeRemoteImageFetchOptions,
) => Promise<SafeRemoteImageResponse>

export type LoadSafeRemoteImageOptions = {
  maxBytes: number
  signal?: AbortSignal
  resolver?: SafeRemoteImageResolver
  fetch?: SafeRemoteImageFetch
  maxRedirects?: number
}

export type SafeRemoteImage = {
  buffer: Buffer
  contentType: string
  finalUrl: string
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

const UNSAFE_IPV4_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00000000, 8],
  [0x0a000000, 8],
  [0x64400000, 10],
  [0x7f000000, 8],
  [0xa9fe0000, 16],
  [0xac100000, 12],
  [0xc0000000, 24],
  [0xc0000200, 24],
  [0xc0586300, 24],
  [0xc0a80000, 16],
  [0xc6120000, 15],
  [0xc6336400, 24],
  [0xcb007100, 24],
  [0xe0000000, 4],
  [0xf0000000, 4],
]

function ipv4ToNumber(address: string): number | null {
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null
  }
  return (((octets[0] * 256 + octets[1]) * 256 + octets[2]) * 256 + octets[3]) >>> 0
}

function isInIpv4Range(value: number, network: number, prefix: number): boolean {
  const divisor = 2 ** (32 - prefix)
  return Math.floor(value / divisor) === Math.floor(network / divisor)
}

function parseIpv6(address: string): number[] | null {
  const zoneIndex = address.indexOf('%')
  if (zoneIndex >= 0) return null

  let normalized = address.toLowerCase()
  const dottedIndex = normalized.lastIndexOf(':')
  const dottedPart = dottedIndex >= 0 ? normalized.slice(dottedIndex + 1) : ''
  if (dottedPart.includes('.')) {
    const ipv4 = ipv4ToNumber(dottedPart)
    if (ipv4 === null) return null
    normalized = `${normalized.slice(0, dottedIndex)}:${(ipv4 >>> 16).toString(16)}:${(ipv4 & 0xffff).toString(16)}`
  }

  const halves = normalized.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null

  const words = [...left, ...Array.from({ length: missing }, () => '0'), ...right]
  if (words.length !== 8 || words.some((word) => !/^[0-9a-f]{1,4}$/.test(word))) return null
  return words.map((word) => Number.parseInt(word, 16))
}

function isPublicIpAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) {
    const value = ipv4ToNumber(address)
    return value !== null && !UNSAFE_IPV4_RANGES.some(([network, prefix]) => (
      isInIpv4Range(value, network, prefix)
    ))
  }
  if (family !== 6) return false

  const words = parseIpv6(address)
  if (words === null) return false

  // IPv4-mapped IPv6 must inherit the IPv4 safety decision.
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    const mapped = words[6] * 0x10000 + words[7]
    return !UNSAFE_IPV4_RANGES.some(([network, prefix]) => isInIpv4Range(mapped, network, prefix))
  }

  // Only global unicast is eligible; exclude IETF special-purpose and documentation space.
  const globalUnicast = (words[0] & 0xe000) === 0x2000
  const ietfSpecialPurpose = words[0] === 0x2001 && words[1] < 0x0200
  const documentation = (
    (words[0] === 0x2001 && words[1] === 0x0db8)
    || (words[0] === 0x3fff && words[1] < 0x1000)
  )
  const sixToFour = words[0] === 0x2002
  return globalUnicast && !ietfSpecialPurpose && !documentation && !sixToFour
}

function hostnameLiteral(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
}

async function defaultResolver(hostname: string): Promise<SafeRemoteImageAddress[]> {
  const results = await lookup(hostname, { all: true, verbatim: true })
  return results.map(({ address, family }) => {
    if (family !== 4 && family !== 6) throw new Error('Remote image DNS returned an unsupported address family')
    return { address, family }
  })
}

const productionFetch: SafeRemoteImageFetch = (urlValue, options) => new Promise((resolve, reject) => {
  const url = new URL(urlValue)
  const pinned = options.addresses[0]
  const req = request(url, {
    agent: false,
    signal: options.signal,
    lookup: (_hostname, _lookupOptions, callback) => {
      callback(null, pinned.address, pinned.family)
    },
  }, (response) => {
    resolve({
      status: response.statusCode ?? 0,
      ok: Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300),
      headers: new Headers(Object.entries(response.headers).flatMap(([name, value]) => (
        value === undefined ? [] : [[name, Array.isArray(value) ? value.join(', ') : value]]
      ))),
      body: Readable.toWeb(response) as Response['body'],
    })
  })
  req.once('error', reject)
  req.end()
})

async function validateDestination(
  url: URL,
  resolver: SafeRemoteImageResolver,
): Promise<SafeRemoteImageAddress[]> {
  if (url.protocol !== 'https:') throw new Error('Remote images must use HTTPS')
  if (url.username || url.password) throw new Error('Remote image URLs must not include credentials')

  const hostname = hostnameLiteral(url.hostname)
  const literalFamily = isIP(hostname)
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily } as SafeRemoteImageAddress]
    : await resolver(hostname)

  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error('Remote image host must resolve only to public IP addresses')
  }
  return addresses
}

async function cancelBody(response: SafeRemoteImageResponse): Promise<void> {
  await response.body?.cancel().catch(() => {})
}

async function readBoundedBody(
  response: SafeRemoteImageResponse,
  maxBytes: number,
): Promise<Buffer> {
  if (!response.body) throw new Error('Remote image response body is empty')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        throw new Error(`Remote image exceeds ${maxBytes} bytes`)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  if (total === 0) throw new Error('Remote image response body is empty')
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total)
}

export async function loadSafeRemoteImage(
  urlValue: string,
  options: LoadSafeRemoteImageOptions,
): Promise<SafeRemoteImage> {
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0) {
    throw new Error('maxBytes must be a positive safe integer')
  }

  const resolver = options.resolver ?? defaultResolver
  const fetchImage = options.fetch ?? productionFetch
  const maxRedirects = options.maxRedirects ?? 3
  let currentUrl = new URL(urlValue)

  for (let redirectCount = 0; ; redirectCount += 1) {
    const addresses = await validateDestination(currentUrl, resolver)
    const response = await fetchImage(currentUrl.toString(), {
      addresses,
      redirect: 'manual',
      signal: options.signal,
    })

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location')
      await cancelBody(response)
      if (!location) throw new Error('Remote image redirect is missing a location')
      if (redirectCount >= maxRedirects) throw new Error('Remote image exceeded redirect limit')
      currentUrl = new URL(location, currentUrl)
      continue
    }
    if (!response.ok) {
      await cancelBody(response)
      throw new Error(`Remote image download failed (${response.status})`)
    }

    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (!contentType?.startsWith('image/')) {
      await cancelBody(response)
      throw new Error('Remote response must have an image content type')
    }
    const declaredLength = response.headers.get('content-length')
    if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > options.maxBytes) {
      await cancelBody(response)
      throw new Error(`Remote image exceeds ${options.maxBytes} bytes`)
    }

    return {
      buffer: await readBoundedBody(response, options.maxBytes),
      contentType,
      finalUrl: currentUrl.toString(),
    }
  }
}
