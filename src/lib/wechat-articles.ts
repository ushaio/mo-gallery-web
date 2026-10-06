import { apiRequestData } from '@/lib/api'

/**
 * 公众号图文列表（自部署站点管理员）。
 *
 * 服务端契约见 `mo-gallery-web/hono/wechat.ts` 的 `GET /api/wechat/articles`：
 * 默认读**服务端本地缓存**（首次与手动刷新时才访问微信），`refresh=1` 强制同步。
 * 与绑定状态一样，这个能力目前只有站点后台使用，因此留在应用内而不是共享包。
 *
 * ⚠️ 当前**暂未挂载**：后台「文章创作」的公众号页签已隐藏（等有可联调的认证公众号再恢复，
 * 恢复方式见 web CHANGELOG 第 13 条与 `server/lib/wechat-articles.ts` 的 WECHAT_ARTICLES_ENABLED 说明）。
 */
export type WeChatArticleKind = 'draft' | 'published'

export interface WeChatArticleItem {
  kind: WeChatArticleKind
  /** 草稿是 `media_id`，发表记录是 `article_id`；同一篇图文里的多条 news_item 用 position 区分。 */
  itemId: string
  position: number
  title: string
  author: string
  digest: string
  /** 封面图地址（微信给的临时链接，约 3 天有效）。 */
  coverUrl: string
  /** 已发表文章的公网链接；草稿为空。 */
  articleUrl: string
  sourceUrl: string
  /** 微信侧的更新时间（ISO8601）；微信没给就是 null。 */
  updateTime: string | null
  isDeleted: boolean
}

export interface WeChatArticlePage {
  kind: WeChatArticleKind
  items: WeChatArticleItem[]
  /** 库里这批条目最后一次与微信同步的时间（ISO8601）；从未同步过为 null。 */
  syncedAt: string | null
  /** true = 命中云端数据库（本次没有访问微信）。 */
  cached: boolean
  empty: boolean
}

export function listWeChatArticles(
  token: string | null,
  kind: WeChatArticleKind,
  refresh = false,
): Promise<WeChatArticlePage> {
  const query = new URLSearchParams({ kind })
  if (refresh) query.set('refresh', '1')
  return apiRequestData<WeChatArticlePage>(`/api/wechat/articles?${query.toString()}`, {}, token)
}
