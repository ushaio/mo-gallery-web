import type { SitePublicationState } from './types'

/**
 * 发布状态机（R11）：发布是独立的显式动作，只有两个状态与两条转换。
 * 不提供任何「发布时顺带改外部访问」或反向的联动——两个维度正交，
 * 外部访问的开关由宿主的文件访问端点单独处理。
 */
export function publish(state: SitePublicationState): SitePublicationState {
  return 'published'
}

export function unpublish(state: SitePublicationState): SitePublicationState {
  return 'draft'
}

export function isPublished(state: SitePublicationState): boolean {
  return state === 'published'
}

/**
 * 访客可见性判定：个人站上可见当且仅当站点元数据为 published。
 * 与字节可达性无关——一张 externalAccess 关闭的照片如果处于 published，
 * 个人站页面会列出它，但公开直链仍不可用（页面应走宿主的访客读取通道）。
 */
export function visibleToVisitors(state: SitePublicationState): boolean {
  return state === 'published'
}
