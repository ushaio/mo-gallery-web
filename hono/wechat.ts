import 'server-only'
import { Hono } from 'hono'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { authMiddleware, AuthVariables } from './middleware/auth'
import {
  WeChatBindingError,
  bindWeChatAccount,
  getWeChatBinding,
  unbindWeChatAccount,
  updateWeChatAccountName,
} from '~/server/lib/wechat'
import {
  deleteWeChatMaterial,
  fetchWeChatMaterialContent,
  getWeChatMaterialCapability,
  listWeChatMaterials,
  uploadWeChatMaterial,
} from '~/server/lib/wechat-materials'
import { isWeChatArticlesEnabled, listWeChatArticles } from '~/server/lib/wechat-articles'

const wechat = new Hono<{ Variables: AuthVariables }>()

/**
 * 微信公众号绑定（站点级）。
 * 鉴权由 authMiddleware 兜住：它已经强制要求管理员身份（JWT 的 isAdmin）。
 * 错误文案直接面向用户（桌面端原样展示），所以用中文，并按 design.md 的错误码表返回。
 */
function respondWeChatError(c: Context, error: unknown, logLabel: string): Response {
  if (error instanceof WeChatBindingError) {
    console.warn(logLabel, error.code, error.message)
    return c.json(
      { success: false, code: error.code, error: error.message },
      error.status as ContentfulStatusCode,
    )
  }

  console.error(logLabel, error)
  return c.json(
    { success: false, code: 'WECHAT_STORE_FAILED', error: '微信公众号绑定操作失败，请重试' },
    500,
  )
}

wechat.get('/binding', authMiddleware, async (c) => {
  try {
    return c.json({ success: true, data: await getWeChatBinding() })
  } catch (error) {
    return respondWeChatError(c, error, 'Get WeChat binding error:')
  }
})

wechat.post('/binding', authMiddleware, async (c) => {
  try {
    let body: { appId?: unknown; appSecret?: unknown } = {}
    try {
      body = await c.req.json<{ appId?: unknown; appSecret?: unknown }>()
    } catch {
      // 空 body 也能走到参数校验，返回 WECHAT_APP_ID_REQUIRED
    }

    const data = await bindWeChatAccount({
      appId: typeof body.appId === 'string' ? body.appId : '',
      appSecret: typeof body.appSecret === 'string' ? body.appSecret : '',
    })
    return c.json({ success: true, data })
  } catch (error) {
    return respondWeChatError(c, error, 'Bind WeChat account error:')
  }
})

wechat.patch('/binding', authMiddleware, async (c) => {
  try {
    let body: { accountName?: unknown } = {}
    try {
      body = await c.req.json<{ accountName?: unknown }>()
    } catch {
      // 空 body 视为清除手填名称（回落微信返回值/前端兜底）
    }

    const data = await updateWeChatAccountName(
      typeof body.accountName === 'string' ? body.accountName : '',
    )
    return c.json({ success: true, data })
  } catch (error) {
    return respondWeChatError(c, error, 'Update WeChat account name error:')
  }
})

wechat.delete('/binding', authMiddleware, async (c) => {
  try {
    return c.json({ success: true, data: await unbindWeChatAccount() })
  } catch (error) {
    return respondWeChatError(c, error, 'Unbind WeChat account error:')
  }
})

/**
 * 公众号图文列表（草稿箱 / 发表记录）。
 *
 * **默认关闭**（`WECHAT_ARTICLES_ENABLED`，见 server/lib/wechat-articles.ts）：页面侧暂时隐藏，
 * 接口一并关掉，等有可联调的认证公众号再开。打开后：默认读**云端数据库**（首次与手动刷新
 * 时才访问微信），`refresh=1` 强制同步；按公众号 AppID 分键，换绑后不串数据。
 */
wechat.get('/articles', authMiddleware, async (c) => {
  if (!isWeChatArticlesEnabled()) {
    return c.json(
      { success: false, code: 'WECHAT_ARTICLES_DISABLED', error: '公众号图文功能暂未开放' },
      403,
    )
  }
  try {
    const data = await listWeChatArticles({
      kind: c.req.query('kind') === 'published' ? 'published' : 'draft',
      refresh: c.req.query('refresh') === '1' || c.req.query('refresh') === 'true',
    })
    return c.json({ success: true, data })
  } catch (error) {
    return respondWeChatError(c, error, 'List WeChat articles error:')
  }
})

/**
 * 素材管理（站点级代理）。
 *
 * 微信素材接口只能在服务端调用（AppSecret + IP 白名单），桌面端一律走这里转发；
 * 临时素材没有列表接口，其列表来自服务端自建的上传索引（见 server/lib/wechat-materials.ts）。
 */
function formString(value: FormDataEntryValue | null): string | undefined {
  return typeof value === 'string' ? value : undefined
}

wechat.get('/materials', authMiddleware, async (c) => {
  try {
    const data = await listWeChatMaterials({
      kind: c.req.query('kind'),
      type: c.req.query('type'),
      offset: Number(c.req.query('offset')),
      count: Number(c.req.query('count')),
    })
    return c.json({ success: true, data })
  } catch (error) {
    return respondWeChatError(c, error, 'List WeChat materials error:')
  }
})

wechat.get('/materials/capability', authMiddleware, async (c) => {
  try {
    return c.json({ success: true, data: await getWeChatMaterialCapability() })
  } catch (error) {
    return respondWeChatError(c, error, 'Check WeChat material capability error:')
  }
})

wechat.get('/materials/content', authMiddleware, async (c) => {
  try {
    const content = await fetchWeChatMaterialContent({
      mediaId: c.req.query('mediaId') ?? '',
      kind: c.req.query('kind'),
      type: c.req.query('type'),
    })
    return new Response(content.body, {
      status: 200,
      headers: {
        'Content-Type': content.contentType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(content.fileName)}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return respondWeChatError(c, error, 'Fetch WeChat material content error:')
  }
})

wechat.post('/materials', authMiddleware, async (c) => {
  try {
    let form: FormData
    try {
      form = await c.req.formData()
    } catch {
      throw new WeChatBindingError('WECHAT_MATERIAL_FILE_REQUIRED', '请选择要上传的文件', 400)
    }

    const uploaded = form.get('media') ?? form.get('file')
    if (!uploaded || typeof (uploaded as Blob).arrayBuffer !== 'function') {
      throw new WeChatBindingError('WECHAT_MATERIAL_FILE_REQUIRED', '请选择要上传的文件', 400)
    }

    const file = uploaded as File
    const data = await uploadWeChatMaterial({
      kind: formString(form.get('kind')),
      type: formString(form.get('type')),
      file,
      fileName: typeof file.name === 'string' && file.name ? file.name : (formString(form.get('fileName')) ?? ''),
      title: formString(form.get('title')),
      introduction: formString(form.get('introduction')),
    })
    return c.json({ success: true, data })
  } catch (error) {
    return respondWeChatError(c, error, 'Upload WeChat material error:')
  }
})

wechat.delete('/materials/:mediaId', authMiddleware, async (c) => {
  try {
    const data = await deleteWeChatMaterial(c.req.param('mediaId') ?? '', c.req.query('kind'))
    return c.json({ success: true, data })
  } catch (error) {
    return respondWeChatError(c, error, 'Delete WeChat material error:')
  }
})

export default wechat
