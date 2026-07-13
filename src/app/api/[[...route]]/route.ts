import 'server-only'
import { handle } from 'hono/vercel'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import route from '~/hono'

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

export const GET = handle(app)
export const POST = handle(app)
export const PUT = handle(app)
export const PATCH = handle(app)
export const DELETE = handle(app)
export const OPTIONS = handle(app)
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
