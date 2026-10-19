import 'server-only'

import { loadSafeRemoteResource, type SafeRemoteAddressResolver, type SafeRemoteFetch } from './safe-remote-fetch'

/**
 * 抓一页网页的展示元信息，给编辑器的链接卡片用。
 *
 * 只读页面里的 <title> 与几个 meta（og: / twitter: / description），不解析 DOM 树、
 * 不执行脚本、不跟随页面里的资源 —— 我们需要的只是「这张卡上写什么」。
 *
 * 出站请求一律走 safe-remote-fetch：私网地址、重定向到私网、超大响应都会被拒。
 * 这是**服务端替用户访问任意 URL** 的唯一入口，别在别处再开一条。
 */

export type LinkPreview = {
  /** 重定向之后的最终地址，用于把相对的图片 / 图标补成绝对地址。 */
  url: string
  title?: string
  description?: string
  siteName?: string
  image?: string
  icon?: string
}

const MAX_BYTES = 512 * 1024
const TIMEOUT_MS = 8_000
/** 成功结果缓存 30 分钟：同一篇文章里反复插入同一个链接是常态。 */
const CACHE_TTL_MS = 30 * 60 * 1000
/** 失败只压 60 秒：可能只是对方临时 5xx，没必要记仇半小时。 */
const FAILURE_TTL_MS = 60 * 1000
const CACHE_LIMIT = 200

type CacheEntry = { expiresAt: number; value: LinkPreview | null }

const cache = new Map<string, CacheEntry>()

function readCache(key: string): LinkPreview | null | undefined {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return undefined
  }
  // Map 保序：读一次就把这条挪到末尾，淘汰时先扔最久没被碰过的。
  cache.delete(key)
  cache.set(key, entry)
  return entry.value
}

function writeCache(key: string, value: LinkPreview | null): void {
  cache.set(key, { expiresAt: Date.now() + (value ? CACHE_TTL_MS : FAILURE_TTL_MS), value })
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next()
    if (oldest.done) break
    cache.delete(oldest.value)
  }
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'",
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const known = HTML_ENTITIES[entity.toLowerCase()]
    if (known) return known
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X'
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10)
      if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) return String.fromCodePoint(code)
    }
    return match
  })
}

/** 压掉换行与多余空白，再按上限截断（与 shared 侧 normalizeMedia 的字段上限一致）。 */
function cleanText(value: string | undefined, max: number): string | undefined {
  const text = decodeEntities(value ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return undefined
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(tag))) {
    attributes[match[1].toLowerCase()] = match[3] ?? match[4] ?? match[5] ?? ''
  }
  return attributes
}

function absolute(value: string | undefined, base: string): string | undefined {
  if (!value) return undefined
  try {
    const resolved = new URL(value, base)
    return resolved.protocol === 'https:' || resolved.protocol === 'http:' ? resolved.toString() : undefined
  } catch {
    return undefined
  }
}

/**
 * 声明的字符集：先看响应头（已被 safe-remote-fetch 剥掉参数，这里拿不到），
 * 再看页面自己的 <meta charset>。国内站点 gbk 不少，一律按 utf-8 解码会全是乱码。
 */
function sniffCharset(buffer: Buffer): string {
  const head = buffer.subarray(0, 2048).toString('latin1')
  const meta = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)
  return meta?.[1]?.toLowerCase() ?? 'utf-8'
}

function decodeHtml(buffer: Buffer): string {
  const charset = sniffCharset(buffer)
  try {
    return new TextDecoder(charset, { fatal: false }).decode(buffer)
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  }
}

function extractPreview(html: string, baseUrl: string): LinkPreview {
  const metas = new Map<string, string>()
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = parseAttributes(tag)
    const key = (attributes.property ?? attributes.name ?? attributes.itemprop ?? '').toLowerCase()
    const content = attributes.content
    if (key && content && !metas.has(key)) metas.set(key, content)
  }

  let icon: string | undefined
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attributes = parseAttributes(tag)
    const rel = (attributes.rel ?? '').toLowerCase()
    // 只认 icon 一族；apple-touch-icon 一般是大图，退而求其次也能当 favicon 用。
    if (!rel.split(/\s+/).some((token) => token === 'icon' || token === 'shortcut' || token === 'apple-touch-icon')) continue
    const href = absolute(attributes.href, baseUrl)
    if (href && !icon) icon = href
  }

  const documentTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]

  return {
    url: baseUrl,
    title: cleanText(
      metas.get('og:title') ?? metas.get('twitter:title') ?? documentTitle,
      200,
    ),
    description: cleanText(
      metas.get('og:description') ?? metas.get('twitter:description') ?? metas.get('description'),
      400,
    ),
    siteName: cleanText(metas.get('og:site_name'), 80),
    image: absolute(
      metas.get('og:image:secure_url') ?? metas.get('og:image:url') ?? metas.get('og:image') ?? metas.get('twitter:image'),
      baseUrl,
    ),
    icon,
  }
}

/**
 * 抓取失败返回 null 而不是抛错：链接卡片拿不到元信息是**正常情况**（对方拒绝、
 * 页面不是 HTML、超时），调用方要的只是「有没有」，不想为此写 try/catch。
 * 真正的编程错误（URL 非法）仍会抛。
 */
export async function loadLinkPreview(
  rawUrl: string,
  options: {
    signal?: AbortSignal
    /** 与 safe-remote-fetch 一致的可替换解析器 / 抓取器：本地 fake-IP 的代理环境、
        split-horizon DNS 下要跑通，以及做确定性校验时用，不改变默认路径的任何校验。 */
    resolver?: SafeRemoteAddressResolver
    fetch?: SafeRemoteFetch
  } = {},
): Promise<LinkPreview | null> {
  const target = new URL(rawUrl)
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error('Link preview only supports HTTP(S) URLs')
  }
  // 明文 http 升级到 https 再抓：站点不支持 https 时这一步会失败，退化成「只有链接地址」，
  // 比把整篇文章的正文交给一个可被中间人篡改的响应要好。
  if (target.protocol === 'http:') target.protocol = 'https:'

  const key = target.toString()
  const cached = readCache(key)
  if (cached !== undefined) return cached

  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(TIMEOUT_MS)])
    : AbortSignal.timeout(TIMEOUT_MS)

  try {
    const resource = await loadSafeRemoteResource(key, {
      maxBytes: MAX_BYTES,
      signal,
      resolver: options.resolver,
      fetch: options.fetch,
      allowTruncate: true,
      noun: { singular: 'page', plural: 'pages' },
      expectedContentType: 'an HTML content type',
      acceptContentType: (contentType) => (
        contentType === 'text/html'
        || contentType === 'application/xhtml+xml'
        || contentType === 'application/xml'
        || contentType === 'text/xml'
      ),
      headers: {
        // 不少站点按 UA 决定是否给 og: 标签，假装成普通浏览器比自报抓取器拿到的东西更多。
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    })

    const preview = extractPreview(decodeHtml(resource.buffer), resource.finalUrl)
    writeCache(key, preview)
    return preview
  } catch (error) {
    if (signal.aborted && !options.signal?.aborted) {
      // 自己超时的，按「抓不到」处理；调用方主动取消则原样抛出，别把取消说成失败。
      writeCache(key, null)
      return null
    }
    if (options.signal?.aborted) throw error
    // 页面不是 HTML、对方 403、DNS 不通……都归入「没有元信息」，但留一行日志便于排查。
    console.warn(`[link-preview] ${key} 抓取失败：${(error as Error).message}`)
    writeCache(key, null)
    return null
  }
}
