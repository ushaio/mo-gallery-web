import 'server-only'
import { db } from '~/server/lib/db'
import {
  WeChatBindingError,
  WECHAT_API_BASE,
  getWeChatAccessToken,
  getWeChatAppId,
  requestWeChatApi,
  weChatErrorFromCode,
  getWeChatEgressIp,
} from '~/server/lib/wechat'

/**
 * 公众号图文（草稿箱 / 发表记录）→ **云端数据库**。
 *
 * 同步方向只有一条：微信 → 本站库。列表页读的是库里的 `WeChatArticle` 表，
 * 只有「首次进入页签 / 点同步 / 双击页签」才去微信拉一次：
 *  - access_token 类接口对频率敏感，且微信单页上限 20 条、逐页翻很慢；
 *  - 拉回来的条目要长期留存（后续「草稿可编辑 / 推送到草稿箱」都要按 itemId 回查），
 *    因此落成实体表而不是一次性响应。
 *
 * 归一化后的行按 `(appId, kind, itemId, position)` 唯一：同一篇图文里的多条 news_item 各占一行；
 * 站点级绑定 ⇒ 按 appId 区分，换绑到另一个公众号后旧公众号的行不会被读出来。
 * 同步失败**保留**已有行（不清空），界面继续显示上一次同步的数据。
 */

export type WeChatArticleKind = 'draft' | 'published'

/**
 * 公众号图文能力的开关（**默认关闭**）。
 *
 * 页面侧（后台 `/admin/logs` 的公众号页签）已暂时隐藏，接口也一并默认关掉：
 * 草稿箱与发表记录需要微信认证的公众号才能真正联调，等有可用账号再打开
 * `WECHAT_ARTICLES_ENABLED=1` 一起恢复（页面按 CHANGELOG 第 13 条加回即可）。
 * 与官网侧 `WECHAT_BINDING_ENABLED` 同一套「先建能力、默认不开」的做法。
 */
export function isWeChatArticlesEnabled(): boolean {
  const value = process.env.WECHAT_ARTICLES_ENABLED?.trim().toLowerCase()
  return value === '1' || value === 'true'
}

export interface WeChatArticleItem {
  kind: WeChatArticleKind
  /** 草稿是 `media_id`，发表记录是 `article_id`；回查单篇时用它。 */
  itemId: string
  /** 同一篇图文里的第几条 news_item。 */
  position: number
  title: string
  author: string
  digest: string
  /** 封面图（微信给的临时链接，约 3 天失效；失效由界面兜底）。 */
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
  /** true = 直接读库（本次没有访问微信）。 */
  cached: boolean
  /** true = 该公众号还没有图文。 */
  empty: boolean
}

/** 每次同步最多拉几页（微信单页上限 20 条），避免大号一次翻几百条。 */
const WECHAT_ARTICLE_MAX_PAGES = 3
const WECHAT_ARTICLE_PAGE_SIZE = 20

interface WeChatNewsItem {
  title?: string
  author?: string
  digest?: string
  thumb_url?: string
  url?: string
  content_source_url?: string
  is_deleted?: boolean
}

interface WeChatArticleBatchItem {
  media_id?: string
  article_id?: string
  update_time?: number
  content?: { news_item?: WeChatNewsItem[] }
}

interface WeChatArticleBatchResponse {
  total_count?: number
  item_count?: number
  item?: WeChatArticleBatchItem[]
  errcode?: number
  errmsg?: string
}

/** 48001 = 该公众号没有这个接口权限（未认证 / 未开通发布能力），单独给一句能照做的文案。 */
function weChatArticleError(errcode: number, errmsg: string, kind: WeChatArticleKind, egressIp: string): WeChatBindingError {
  if (errcode === 48001) {
    const feature = kind === 'draft' ? '草稿箱' : '发表记录'
    return new WeChatBindingError(
      'WECHAT_ARTICLE_API_UNAUTHORIZED',
      `该公众号未开放${feature}接口权限：草稿箱与发表记录需要微信认证的公众号，请到公众平台「设置与开发 → 接口权限」确认`,
      403,
    )
  }
  return weChatErrorFromCode(errcode, errmsg, egressIp)
}

/** 微信返回的一页 → 待落库的行（多篇 news_item 展开成多行）。 */
function normalizeBatch(kind: WeChatArticleKind, batch: WeChatArticleBatchItem[]): WeChatArticleItem[] {
  const rows: WeChatArticleItem[] = []
  for (const entry of batch) {
    const itemId = (kind === 'draft' ? entry.media_id : entry.article_id)?.trim()
    if (!itemId) continue
    const updateTime = typeof entry.update_time === 'number' && entry.update_time > 0
      ? new Date(entry.update_time * 1000).toISOString()
      : null
    const newsItems = entry.content?.news_item ?? []
    newsItems.forEach((news, position) => {
      rows.push({
        kind,
        itemId,
        position,
        title: news.title?.trim() ?? '',
        author: news.author?.trim() ?? '',
        digest: news.digest?.trim() ?? '',
        coverUrl: news.thumb_url?.trim() ?? '',
        articleUrl: news.url?.trim() ?? '',
        sourceUrl: news.content_source_url?.trim() ?? '',
        updateTime,
        isDeleted: Boolean(news.is_deleted),
      })
    })
  }
  return rows
}

/** 从微信逐页拉取列表。 */
async function fetchWeChatArticles(kind: WeChatArticleKind): Promise<{ rows: WeChatArticleItem[]; totalCount: number }> {
  const [accessToken, egressIp] = await Promise.all([getWeChatAccessToken(), getWeChatEgressIp()])
  const endpoint = kind === 'draft' ? 'draft/batchget' : 'freepublish/batchget'
  const rows: WeChatArticleItem[] = []
  let totalCount = 0

  for (let page = 0; page < WECHAT_ARTICLE_MAX_PAGES; page += 1) {
    const offset = page * WECHAT_ARTICLE_PAGE_SIZE
    const body = await requestWeChatApi<WeChatArticleBatchResponse>(
      `${WECHAT_API_BASE}/cgi-bin/${endpoint}?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // no_content=1：列表只要标题/封面/时间，正文留到编辑单篇时再取
        body: JSON.stringify({ offset, count: WECHAT_ARTICLE_PAGE_SIZE, no_content: 1 }),
      },
    )

    if (typeof body.errcode === 'number' && body.errcode !== 0) {
      console.warn(`[wechat] ${endpoint} 失败：errcode=${body.errcode} errmsg=${body.errmsg ?? ''}`)
      throw weChatArticleError(body.errcode, body.errmsg ?? '', kind, egressIp)
    }

    if (page === 0) totalCount = typeof body.total_count === 'number' ? body.total_count : 0
    const batch = body.item ?? []
    rows.push(...normalizeBatch(kind, batch))
    if (batch.length < WECHAT_ARTICLE_PAGE_SIZE || rows.length >= totalCount) break
  }

  return { rows, totalCount }
}

/** 把一轮同步写进库：逐行 upsert；这一轮取全了才删掉已经不存在的条目。 */
async function persistArticles(appId: string, kind: WeChatArticleKind, rows: WeChatArticleItem[], totalCount: number) {
  const syncedAt = new Date()

  await db.$transaction(
    rows.map((row) => db.weChatArticle.upsert({
      where: { appId_kind_itemId_position: { appId, kind: row.kind, itemId: row.itemId, position: row.position } },
      update: {
        title: row.title,
        author: row.author,
        digest: row.digest,
        coverUrl: row.coverUrl,
        articleUrl: row.articleUrl,
        sourceUrl: row.sourceUrl,
        updateTime: row.updateTime ? new Date(row.updateTime) : null,
        isDeleted: row.isDeleted,
        syncedAt,
      },
      create: {
        appId,
        kind: row.kind,
        itemId: row.itemId,
        position: row.position,
        title: row.title,
        author: row.author,
        digest: row.digest,
        coverUrl: row.coverUrl,
        articleUrl: row.articleUrl,
        sourceUrl: row.sourceUrl,
        updateTime: row.updateTime ? new Date(row.updateTime) : null,
        isDeleted: row.isDeleted,
        syncedAt,
      },
    })),
  )

  // 只在这一轮确实取全时才清理：否则「没看到」只代表「还没翻到」，删了会丢数据
  if (rows.length < totalCount) return
  const itemIds = Array.from(new Set(rows.map((row) => row.itemId)))
  await db.weChatArticle.deleteMany({ where: { appId, kind, itemId: { notIn: itemIds } } })
}

async function readStored(appId: string, kind: WeChatArticleKind): Promise<WeChatArticlePage> {
  const rows = await db.weChatArticle.findMany({
    where: { appId, kind },
    orderBy: [{ updateTime: { sort: 'desc', nulls: 'last' } }, { position: 'asc' }],
  })
  const items: WeChatArticleItem[] = rows.map((row) => ({
    kind,
    itemId: row.itemId,
    position: row.position,
    title: row.title,
    author: row.author,
    digest: row.digest,
    coverUrl: row.coverUrl,
    articleUrl: row.articleUrl,
    sourceUrl: row.sourceUrl,
    updateTime: row.updateTime ? row.updateTime.toISOString() : null,
    isDeleted: row.isDeleted,
  }))
  const syncedAt = rows.reduce<Date | null>((latest, row) => (
    !latest || row.syncedAt > latest ? row.syncedAt : latest
  ), null)
  return { kind, items, syncedAt: syncedAt ? syncedAt.toISOString() : null, cached: true, empty: items.length === 0 }
}

/**
 * 读公众号图文列表：先读库，库为空或 `refresh` 为 true 时同步一次再读。
 *
 * 同步失败会抛出（界面显示可照做的文案），但**已经落库的旧数据不受影响**。
 */
export async function listWeChatArticles(input: {
  kind: WeChatArticleKind
  refresh?: boolean
}): Promise<WeChatArticlePage> {
  const kind = input.kind === 'published' ? 'published' : 'draft'
  const appId = await getWeChatAppId()
  const stored = await readStored(appId, kind)
  if (!input.refresh && !stored.empty) return stored

  const { rows, totalCount } = await fetchWeChatArticles(kind)
  try {
    await persistArticles(appId, kind, rows, totalCount)
  } catch (error) {
    // 落库失败不该让用户看不到这一轮结果；下次同步会重试
    console.warn('Persist WeChat articles failed:', error)
    return {
      kind,
      items: rows,
      syncedAt: new Date().toISOString(),
      cached: false,
      empty: rows.length === 0,
    }
  }
  return await readStored(appId, kind)
}
