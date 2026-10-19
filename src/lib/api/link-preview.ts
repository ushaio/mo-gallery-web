import { buildApiUrl } from './core'
import type { MediaLinkPreview, MediaLinkPreviewResolver } from '@mo-gallery/milkdown/media'

type LinkPreviewResponse = { preview: MediaLinkPreview | null }

/**
 * 编辑器里插入链接卡片时，向自己的后端要一份网页元信息。
 *
 * 走自家 `/api/link-preview` 而不是浏览器直连目标站：跨域基本不通，而且出站要过
 * 服务端那套私网地址校验（server/lib/safe-remote-fetch.ts）。
 *
 * 任何拿不到的情况都返回 null —— 卡片退回「只显示链接地址」的样子，而不是在
 * 编辑器里弹一个让人无从处理的错误。真正的鉴权问题除外：token 失效时重试也没用，
 * 静默吞掉只会让用户以为抓取功能坏了。
 */
export function createLinkPreviewResolver(token: string): MediaLinkPreviewResolver {
  return async (url: string) => {
    const response = await fetch(buildApiUrl(`/api/link-preview?url=${encodeURIComponent(url)}`), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (response.status === 401 || response.status === 403) {
      throw new Error('Unauthorized')
    }
    if (!response.ok) return null
    const body = await response.json() as LinkPreviewResponse
    return body.preview ?? null
  }
}
