import 'server-only'

import { lookup } from 'node:dns/promises'
import { request } from 'node:https'
import { isIP } from 'node:net'
import { Readable } from 'node:stream'

/**
 * 出站抓取的唯一入口：把 URL 拆到「解析出的每个 IP 都必须是公网地址」这一步为止，
 * 之后的连接**钉死**在那个已验证地址上（见 productionFetch 的 lookup），避免 DNS
 * rebinding 在验证与连接之间把目标换成内网。
 *
 * 原本只有图片走这条路（safe-remote-image）。链接卡片要抓别人家网页，需要同一条防线，
 * 于是把逻辑提到这里，图片只是它的一个「只收 image/*」的预设；两份实现迟早会漂移，
 * 而漏掉一处校验就等于整条防线作废。
 */

export type SafeRemoteAddress = {
  address: string
  family: 4 | 6
}

export type SafeRemoteAddressResolver = (hostname: string) => Promise<SafeRemoteAddress[]>

export type SafeRemoteFetchOptions = {
  addresses: SafeRemoteAddress[]
  redirect: 'manual'
  signal?: AbortSignal
  /** 额外请求头（UA / Accept）。图片抓取不需要，抓网页需要，由调用方给。 */
  headers?: Record<string, string>
}

type SafeRemoteResponse = Pick<Response, 'body' | 'headers' | 'ok' | 'status'>

export type SafeRemoteFetch = (
  url: string,
  options: SafeRemoteFetchOptions,
) => Promise<SafeRemoteResponse>

export type LoadSafeRemoteOptions = {
  maxBytes: number
  signal?: AbortSignal
  resolver?: SafeRemoteAddressResolver
  fetch?: SafeRemoteFetch
  maxRedirects?: number
  /** 校验响应 content-type；返回 false 即中止。 */
  acceptContentType?: (contentType: string) => boolean
  /** 拼进「必须先有 X 类型的响应」这句错误里，例如 'an image content type'。 */
  expectedContentType?: string
  /**
   * 超过 maxBytes 时截断返回已读到的部分，而不是报错。
   *
   * 只给「只需要文件开头」的用途开：抓网页元信息时，og: 标签全在 <head> 里，
   * 而一个 1MB 的 SSR 页面正文对我们毫无价值 —— 为它整页失败，等于大部分现代
   * 站点都抓不到。图片必须完整才有用，所以那边保持默认的报错行为。
   */
  allowTruncate?: boolean
  /** 错误信息里指代资源的名词（单/复数），例如 image / page。 */
  noun?: { singular: string; plural: string }
  headers?: Record<string, string>
}

export type SafeRemoteResource = {
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

async function defaultResolver(hostname: string, noun: string): Promise<SafeRemoteAddress[]> {
  const results = await lookup(hostname, { all: true, verbatim: true })
  return results.map(({ address, family }) => {
    if (family !== 4 && family !== 6) throw new Error(`Remote ${noun} DNS returned an unsupported address family`)
    return { address, family }
  })
}

const productionFetch: SafeRemoteFetch = (urlValue, options) => new Promise((resolve, reject) => {
  const url = new URL(urlValue)
  const pinned = options.addresses[0]
  const req = request(url, {
    agent: false,
    signal: options.signal,
    headers: options.headers,
    lookup: (_hostname, _lookupOptions, callback) => {
      callback(null, pinned.address, pinned.family)
    },
  }, (response) => {
    resolve({
      status: response.statusCode ?? 0,
      ok: Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300),
      headers: new Headers(Object.entries(response.headers).flatMap(([name, value]) => {
        if (value === undefined) return [] as [string, string][]
        return [[name, Array.isArray(value) ? value.join(', ') : value]] as [string, string][]
      })),
      body: Readable.toWeb(response) as Response['body'],
    })
  })
  req.once('error', reject)
  req.end()
})

/**
 * 校验目标地址，返回已解析并全部通过检查的地址列表。
 *
 * 只要有一条记录不是公网地址就整体拒绝（而不是挑一条能用的）：一个域名同时指向
 * 内网与公网，本身就说明这不是我们该替用户去访问的东西。
 */
async function validateDestination(
  url: URL,
  resolver: SafeRemoteAddressResolver,
  noun: string,
): Promise<SafeRemoteAddress[]> {
  if (url.protocol !== 'https:') throw new Error(`Remote ${noun}s must use HTTPS`)
  if (url.username || url.password) throw new Error(`Remote ${noun} URLs must not include credentials`)

  const hostname = hostnameLiteral(url.hostname)
  const literalFamily = isIP(hostname)
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily } as SafeRemoteAddress]
    : await resolver(hostname)

  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error(`Remote ${noun} host must resolve only to public IP addresses`)
  }
  return addresses
}

async function cancelBody(response: SafeRemoteResponse): Promise<void> {
  await response.body?.cancel().catch(() => {})
}

async function readBoundedBody(
  response: SafeRemoteResponse,
  maxBytes: number,
  noun: string,
  allowTruncate: boolean,
): Promise<Buffer> {
  if (!response.body) throw new Error(`Remote ${noun} response body is empty`)
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
        if (!allowTruncate) throw new Error(`Remote ${noun} exceeds ${maxBytes} bytes`)
        // 把越界的那个 chunk 也切到上限为止：调用方拿到的始终是「前 maxBytes 字节」，
        // 而不是少一个 chunk 的、长度不可预测的片段。
        const keep = value.byteLength - (total - maxBytes)
        if (keep > 0) chunks.push(value.subarray(0, keep))
        total = maxBytes
        break
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  if (total === 0) throw new Error(`Remote ${noun} response body is empty`)
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total)
}

export async function loadSafeRemoteResource(
  urlValue: string,
  options: LoadSafeRemoteOptions,
): Promise<SafeRemoteResource> {
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0) {
    throw new Error('maxBytes must be a positive safe integer')
  }

  const noun = options.noun?.singular ?? 'resource'
  const resolver = options.resolver ?? ((hostname: string) => defaultResolver(hostname, noun))
  const runFetch = options.fetch ?? productionFetch
  const maxRedirects = options.maxRedirects ?? 3
  let currentUrl = new URL(urlValue)

  for (let redirectCount = 0; ; redirectCount += 1) {
    const addresses = await validateDestination(currentUrl, resolver, noun)
    const response = await runFetch(currentUrl.toString(), {
      addresses,
      redirect: 'manual',
      signal: options.signal,
      headers: options.headers,
    })

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location')
      await cancelBody(response)
      if (!location) throw new Error(`Remote ${noun} redirect is missing a location`)
      if (redirectCount >= maxRedirects) throw new Error(`Remote ${noun} exceeded redirect limit`)
      currentUrl = new URL(location, currentUrl)
      // 重定向同样要过一遍协议检查：https 跳回 http 就等于把明文内容放进来。
      continue
    }
    if (!response.ok) {
      await cancelBody(response)
      throw new Error(`Remote ${noun} download failed (${response.status})`)
    }

    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    const accepted = options.acceptContentType ?? (() => true)
    if (!contentType || !accepted(contentType)) {
      await cancelBody(response)
      throw new Error(`Remote response must have ${options.expectedContentType ?? 'an accepted content type'}`)
    }
    const declaredLength = response.headers.get('content-length')
    if (!options.allowTruncate && declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > options.maxBytes) {
      await cancelBody(response)
      throw new Error(`Remote ${noun} exceeds ${options.maxBytes} bytes`)
    }

    return {
      buffer: await readBoundedBody(response, options.maxBytes, noun, options.allowTruncate ?? false),
      contentType,
      finalUrl: currentUrl.toString(),
    }
  }
}
