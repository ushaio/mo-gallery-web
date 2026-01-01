import 'server-only'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import auth from './auth'
import photos from './photos'
import settings from './settings'
import stories from './stories'
import comments from './comments'
import blogs from './blogs'
import albums from './albums'
import friends from './friends'

const route = new Hono()

route.onError((err, c) => {
  if (err instanceof HTTPException) {
    console.error(err)
    return err.getResponse()
  }
  console.error('Server error:', err)
  return c.json({ error: 'Internal server error' }, 500)
})

// Health check
route.get('/', (c) => {
  return c.json({
    message: 'MO Gallery API',
    version: '1.0.0',
    status: 'running',
  })
})

// API routes
route.route('/auth', auth)
route.route('/', photos)
route.route('/', stories)
route.route('/', comments)
route.route('/', blogs)
route.route('/', albums)
route.route('/', friends)
route.route('/settings', settings)
route.route('/admin/settings', settings)

export default route
