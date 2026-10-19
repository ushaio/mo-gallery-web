import 'server-only'
import { Hono } from 'hono'
import { authMiddleware, AuthVariables } from './middleware/auth'
import { loadLinkPreview } from '~/server/lib/link-preview'

/**
 * 链接卡片抓取网页信息。**必须登录**：这是个「服务端替你访问任意 URL」的口子，
 * 开放给匿名访客等于给整个内网配了一个探测代理（safe-remote-fetch 会挡住私网，
 * 但公网扫描、刷别人的站、把响应内容当探测信号，仍然只该是登录用户能干的事）。
 * 公开阅读页不调用它 —— 读者看到的元信息早在编辑时就随文档存下来了。
 */
const linkPreview = new Hono<{ Variables: AuthVariables }>()

linkPreview.use('*', authMiddleware)

linkPreview.get('/link-preview', async (c) => {
  const raw = c.req.query('url')?.trim()
  if (!raw) return c.json({ error: 'Missing url parameter' }, 400)

  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return c.json({ error: 'Invalid url parameter' }, 400)
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return c.json({ error: 'Only HTTP(S) URLs are supported' }, 400)
  }
  if (target.username || target.password) {
    return c.json({ error: 'URLs must not include credentials' }, 400)
  }

  // 抓不到不是错误：对方站点拒绝、页面不是 HTML、超时，都只是「这张卡没有元信息」，
  // 前端据此退回只显示链接地址的形态，不需要一个 5xx 让用户以为出了故障。
  const preview = await loadLinkPreview(target.toString())
  return c.json({ preview })
})

export default linkPreview
