import 'server-only'
import { handle } from 'hono/vercel'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

type RouteHandler = (req: Request) => Promise<Response> | Response

async function createHandler(): Promise<RouteHandler> {
  // 动态导入：把本模块的加载与全部业务路由（含 sharp 等原生依赖）解耦。
  // 否则任何一个路由模块在加载期抛错，整个 /api 函数都会以空体 500 失败，
  // 线上只剩 "Request failed (500)"，无从定位。
  const { default: route } = await import('~/hono')

  const app = new Hono().basePath('/api')

  // Middleware
  app.use('*', logger())
  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      // Leave allowHeaders unset so Hono reflects Access-Control-Request-Headers.
      // Pi AI's OpenAI client adds X-Stainless-* headers in browser requests.
    }),
  )

  app.route('/', route)

  app.notFound((c) => {
    return c.json({ error: 'Not found' }, 404)
  })

  return handle(app) as RouteHandler
}

let handlerPromise: Promise<RouteHandler> | null = null

function getHandler(): Promise<RouteHandler> {
  if (!handlerPromise) {
    handlerPromise = createHandler().catch((error) => {
      // 允许后续请求重试，避免一次瞬时失败把整个函数实例钉死
      handlerPromise = null
      throw error
    })
  }
  return handlerPromise
}

const handler: RouteHandler = async (req) => {
  try {
    const routeHandler = await getHandler()
    return await routeHandler(req)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('API bootstrap failed:', error)
    return Response.json(
      {
        code: 'API_BOOTSTRAP_FAILED',
        error: message,
        // 生产环境不回传堆栈；预览/本地环境保留，便于排障
        ...(process.env.VERCEL_ENV === 'production'
          ? {}
          : { stack: error instanceof Error ? error.stack : undefined }),
      },
      { status: 500 },
    )
  }
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
export const OPTIONS = handler
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
