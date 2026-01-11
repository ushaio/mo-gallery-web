import 'server-only'
import { Context, Next } from 'hono'

/**
 * Origin Check Middleware
 * 
 * Restricts API access to same-origin requests only.
 * This prevents external tools (Postman, curl, other websites) from accessing the API.
 * 
 * Controlled by environment variable: API_ORIGIN_CHECK
 * - "true" or "1": Enable origin check (default when not set)
 * - "false" or "0": Disable origin check
 * 
 * How it works:
 * 1. Checks `Sec-Fetch-Site` header (browser-added, cannot be forged by JS)
 *    - "same-origin": Request from same site ✅
 *    - "cross-site", "same-site", "none": External request ❌
 * 2. For SSR requests (no Sec-Fetch-Site header), checks if from localhost
 * 3. Also validates Referer header as additional check
 */

// Check if origin check is enabled via environment variable
function isOriginCheckEnabled(): boolean {
  const envValue = process.env.API_ORIGIN_CHECK?.toLowerCase()
  // Default to disabled if not set (for backward compatibility)
  if (!envValue) return false
  return envValue === 'true' || envValue === '1'
}

// Get allowed origins from SITE_URL
function getAllowedOrigins(): string[] {
  const origins: string[] = []
  
  const siteUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL
  if (siteUrl) {
    try {
      const url = new URL(siteUrl)
      origins.push(url.origin)
    } catch {
      // Invalid URL, ignore
    }
  }
  
  // Always allow localhost for development
  origins.push('http://localhost:3000')
  origins.push('http://localhost:3001')
  origins.push('http://127.0.0.1:3000')
  origins.push('http://127.0.0.1:3001')
  
  return origins
}

export async function originCheckMiddleware(c: Context, next: Next) {
  // Skip if origin check is disabled
  if (!isOriginCheckEnabled()) {
    return next()
  }

  const secFetchSite = c.req.header('Sec-Fetch-Site')
  const referer = c.req.header('Referer')
  const origin = c.req.header('Origin')

  // Case 1: Browser request with Sec-Fetch-Site header
  if (secFetchSite) {
    // Only allow same-origin requests
    if (secFetchSite === 'same-origin') {
      return next()
    }
    
    // Block cross-site, same-site (subdomain), and none (direct navigation)
    return c.json(
      { 
        error: 'Forbidden', 
        message: 'API access is restricted to same-origin requests only' 
      }, 
      403
    )
  }

  // Case 2: SSR request (no Sec-Fetch-Site header)
  // These come from Next.js server-side rendering
  // Check if it's from an allowed origin via Referer or Origin header
  
  const allowedOrigins = getAllowedOrigins()
  
  // If there's a Referer, validate it
  if (referer) {
    try {
      const refererUrl = new URL(referer)
      if (allowedOrigins.some(allowed => refererUrl.origin === allowed)) {
        return next()
      }
    } catch {
      // Invalid referer URL
    }
  }
  
  // If there's an Origin header, validate it
  if (origin) {
    if (allowedOrigins.some(allowed => origin === allowed)) {
      return next()
    }
  }
  
  // Case 3: No browser headers at all - likely SSR or internal request
  // Allow these as they're typically from the same server
  if (!referer && !origin && !secFetchSite) {
    return next()
  }

  // Block everything else
  return c.json(
    { 
      error: 'Forbidden', 
      message: 'API access is restricted to same-origin requests only' 
    }, 
    403
  )
}