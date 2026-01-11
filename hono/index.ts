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
import storage from './storage'
import equipment from './equipment'
import { walineHandler } from './waline'
import { originCheckMiddleware } from './middleware/origin-check'

const route = new Hono()

// Apply origin check middleware to all routes
route.use('*', originCheckMiddleware)

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
route.route('/', storage)
route.route('/', equipment)
route.route('/settings', settings)
route.route('/admin/settings', settings)

// Waline comments API - only register if local Waline is needed
// (when COMMENTS_STORAGE=LEANCLOUD and no external WALINE_SERVER_URL)
// If WALINE_SERVER_URL is set, the frontend will connect directly to the external server
const commentsStorage = process.env.COMMENTS_STORAGE || ''
const walineServerUrl = process.env.WALINE_SERVER_URL || ''
const useLocalWaline = commentsStorage.toUpperCase() === 'LEANCLOUD' && !walineServerUrl

if (useLocalWaline) {
  route.all('/waline/*', walineHandler)
  route.all('/api/waline/*', walineHandler)
}

export default route
