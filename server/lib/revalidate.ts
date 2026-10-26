import 'server-only'
import type { MiddlewareHandler } from 'hono'
import { revalidatePath } from 'next/cache'

/**
 * 公开页的按需刷新。
 *
 * 这些页面在 `next build` 时就被渲染成静态 HTML，且**没有 ISR 周期**（见构建产物
 * `.next/prerender-manifest.json`：`/`、`/story`、`/blog`、`/curated`、`/gallery/film`
 * 等全部是 `compute: "static"` + `initialRevalidateSeconds: false`）。本地 `pnpm dev`
 * 每个请求都实时查库，所以看不出问题；部署到 Vercel 后，新写的叙事 / 文章 / 照片
 * 要等到下一次部署重建静态页才会出现在线上 —— 这就是「本地有、线上没有、同一个库」
 * 的成因。
 *
 * 因此在写接口成功落库后，显式刷新受影响的路径，内容即可对访客即时生效。
 */
export const STATIC_PUBLIC_PATHS = {
  home: '/',
  curated: '/curated',
  film: '/gallery/film',
  stories: '/story',
  blogs: '/blog',
  sitemap: '/sitemap.xml',
} as const

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

interface RevalidateOptions {
  /** 命中任一子串的请求跳过刷新：这类接口只读库（查重、AI 生成、能力探测），不必清缓存。 */
  skipPathIncludes?: readonly string[]
  /** `layout` 用于站点级设置（标题、导航等），失效范围覆盖全部页面。 */
  scope?: 'page' | 'layout'
}

/**
 * 挂在写接口上的后置钩子：请求成功（2xx/3xx）且确实是写方法时，刷新给定路径。
 * 刷新失败只记日志，不会把一次已经落库的写入变成 500。
 */
export function revalidateAfterWrite(
  paths: readonly string[],
  options: RevalidateOptions = {},
): MiddlewareHandler {
  const { skipPathIncludes = [], scope = 'page' } = options

  return async (c, next) => {
    await next()

    if (!MUTATING_METHODS.has(c.req.method)) return
    if (c.res.status >= 400) return

    const path = c.req.path
    if (skipPathIncludes.some((needle) => path.includes(needle))) return

    try {
      for (const target of paths) {
        revalidatePath(target, scope)
      }
    } catch (error) {
      console.error('Revalidate after write failed:', error)
    }
  }
}
