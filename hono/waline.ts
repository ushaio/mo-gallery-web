import 'server-only'
import { Hono } from 'hono'
import type { Handler } from 'hono'

// Check if we should use local Waline (only when COMMENTS_STORAGE=LEANCLOUD and no external WALINE_SERVER_URL)
const commentsStorage = process.env.COMMENTS_STORAGE || ''
const walineServerUrl = process.env.WALINE_SERVER_URL || ''
const useLocalWaline = commentsStorage.toUpperCase() === 'LEANCLOUD' && !walineServerUrl

// Lazy load @waline/vercel only when needed to avoid SQLite3 dependency issues
let walineInstance: Handler | null = null
let walineLoadAttempted = false

async function getWalineHandler(): Promise<Handler | null> {
  if (!useLocalWaline) {
    return null
  }
  
  if (walineLoadAttempted) {
    return walineInstance
  }
  
  walineLoadAttempted = true
  
  try {
    // Dynamic import to avoid loading SQLite3 when not needed
    const { default: Waline } = await import('@waline/vercel')
    walineInstance = Waline({
      async postSave(_comment: Record<string, unknown>) {
        console.log('Comment saved')
      },
      async postDelete(_commentId: string) {
        console.log('Comment deleted')
      },
      async postUpdate() {},
    })
    return walineInstance
  } catch (error) {
    console.error('Failed to load @waline/vercel:', error)
    return null
  }
}

// Create a Hono app to handle Waline routes
const walineApp = new Hono()

// Handler that lazily loads Waline
export const walineHandler: Handler = async (c, next) => {
  const handler = await getWalineHandler()
  
  if (!handler) {
    return c.json({
      error: 'Waline is not available. Please configure WALINE_SERVER_URL for external Waline service.',
      hint: 'Local Waline requires SQLite3 which may not be available in all environments.'
    }, 503)
  }
  
  return handler(c, next)
}
