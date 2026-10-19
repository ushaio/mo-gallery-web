import 'server-only'

import {
  loadSafeRemoteResource,
  type SafeRemoteAddress,
  type SafeRemoteAddressResolver,
  type SafeRemoteFetch,
  type SafeRemoteFetchOptions,
} from './safe-remote-fetch'

/**
 * 抓一张远程图片。SSRF 校验、重定向逐跳检查、字节上限都在
 * `safe-remote-fetch`（链接卡片抓网页也走那一份），这里只多一条「响应必须是图片」。
 */

export type SafeRemoteImageAddress = SafeRemoteAddress

export type SafeRemoteImageResolver = SafeRemoteAddressResolver

export type SafeRemoteImageFetchOptions = SafeRemoteFetchOptions

export type SafeRemoteImageFetch = SafeRemoteFetch

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

export async function loadSafeRemoteImage(
  urlValue: string,
  options: LoadSafeRemoteImageOptions,
): Promise<SafeRemoteImage> {
  return loadSafeRemoteResource(urlValue, {
    ...options,
    acceptContentType: (contentType) => contentType.startsWith('image/'),
    expectedContentType: 'an image content type',
    noun: { singular: 'image', plural: 'images' },
  })
}
