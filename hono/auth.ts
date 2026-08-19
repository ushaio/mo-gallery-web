import 'server-only'
import bcrypt from 'bcryptjs'
import { Hono } from 'hono'
import { signToken } from '~/server/lib/jwt'
import { db } from '~/server/lib/db'
import {
  getAdminGateVersion,
  verifyAdminLoginSlug,
} from '~/server/lib/admin-login-gate'
import { authMiddleware, AuthVariables } from './middleware/auth'
import {
  clearLoginFailures,
  getLoginLimit,
  recordLoginFailure,
} from '~/server/lib/login-rate-limit'
import { createOAuthState, verifyOAuthState } from '~/server/lib/oauth-state'

const auth = new Hono<{ Variables: AuthVariables }>()

// Linux DO OAuth configuration
const LINUXDO_CLIENT_ID = process.env.LINUXDO_CLIENT_ID || ''
const LINUXDO_CLIENT_SECRET = process.env.LINUXDO_CLIENT_SECRET || ''
const LINUXDO_REDIRECT_URI = process.env.LINUXDO_REDIRECT_URI || ''

// Linux DO OAuth endpoints (备用端点优先，解决网络问题)
const LINUXDO_AUTHORIZE_URL = 'https://connect.linux.do/oauth2/authorize'
const LINUXDO_TOKEN_URL = 'https://connect.linuxdo.org/oauth2/token'
const LINUXDO_USER_URL = 'https://connect.linuxdo.org/api/user'
const DUMMY_PASSWORD_HASH = '$2b$10$7EqJtq98hPqEX7fNZaFWoO5cZDr2ay0V5WwOOmySTAzgk1UFu/V7u'

auth.post('/login', async (c) => {
  const { username, password, loginSlug } = await c.req.json<{
    username?: string
    password?: string
    loginSlug?: string
  }>()

  if (!username || !password) {
    return c.json({
      code: 'LOGIN_FIELDS_REQUIRED',
      error: 'Username and password are required',
    }, 400)
  }

  if (!verifyAdminLoginSlug(loginSlug)) {
    return c.json({
      code: 'ADMIN_LOGIN_PATH_INVALID',
      error: 'Invalid administrator login URL',
    }, 403)
  }

  const clientIp = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    || c.req.header('x-real-ip')?.trim()
    || 'unknown'
  const limit = await getLoginLimit(clientIp, username)
  if (limit) {
    c.header('Retry-After', String(limit.retryAfterSeconds))
    return c.json({
      code: 'LOGIN_RATE_LIMITED',
      error: 'Too many login attempts. Try again later.',
    }, 429)
  }

  const configuredUsername = process.env.ADMIN_USERNAME?.trim()
  if (!configuredUsername) {
    console.error('Password login is unavailable: ADMIN_USERNAME is not configured')
    return c.json({ error: 'Password login is not configured' }, 503)
  }

  const admin = await db.user.findUnique({
    where: { username: configuredUsername },
    select: { id: true, username: true, password: true, isAdmin: true },
  })
  const passwordMatches = await bcrypt.compare(password, admin?.password || DUMMY_PASSWORD_HASH)

  if (username !== configuredUsername || !admin || !passwordMatches) {
    await recordLoginFailure(clientIp, username)
    return c.json({
      code: 'INVALID_CREDENTIALS',
      error: 'Invalid username or password',
    }, 401)
  }

  await clearLoginFailures(clientIp, username)

  if (!admin.isAdmin) {
    await db.user.update({ where: { id: admin.id }, data: { isAdmin: true } })
  }

  const token = signToken({
    sub: admin.id,
    username: admin.username,
    isAdmin: true,
    adminGateVersion: getAdminGateVersion(),
  })

  return c.json({
    success: true,
    token,
    user: { id: admin.id, username: admin.username, isAdmin: true },
  })
})

auth.get('/me', authMiddleware, (c) => {
  const user = c.get('user')
  return c.json({
    success: true,
    data: {
      id: user.sub,
      username: user.username,
      isAdmin: user.isAdmin === true,
      avatarUrl: user.avatarUrl ?? null,
    },
  })
})

// Get Linux DO OAuth authorization URL
auth.get('/linuxdo', (c) => {
  if (!LINUXDO_CLIENT_ID) {
    return c.json({ error: 'Linux DO OAuth is not configured' }, 400)
  }

  const loginSlug = c.req.query('loginSlug')
  if (loginSlug !== undefined && !verifyAdminLoginSlug(loginSlug)) {
    return c.json({ error: 'Invalid administrator login path' }, 403)
  }

  const state = createOAuthState()
  const authUrl = new URL(LINUXDO_AUTHORIZE_URL)
  authUrl.searchParams.set('client_id', LINUXDO_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', LINUXDO_REDIRECT_URI)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('state', state)

  return c.json({ url: authUrl.toString(), state })
})

// Handle Linux DO OAuth callback
auth.post('/linuxdo/callback', async (c) => {
  const { code, state, loginSlug } = await c.req.json<{
    code?: string
    state?: string
    loginSlug?: string
  }>()

  if (!code) {
    return c.json({ error: 'Authorization code is required' }, 400)
  }
  if (!verifyOAuthState(state)) {
    return c.json({ error: 'Invalid or expired OAuth state' }, 400)
  }

  // Exchange code for access token
  let tokenResponse: Response
  try {
    tokenResponse = await fetch(LINUXDO_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: LINUXDO_REDIRECT_URI,
        client_id: LINUXDO_CLIENT_ID,
        client_secret: LINUXDO_CLIENT_SECRET,
      }),
    })
  } catch (err) {
    console.error('Linux DO token exchange network error:', err)
    return c.json({ error: 'Network error during token exchange' }, 500)
  }

  if (!tokenResponse.ok) {
    console.error('Linux DO token exchange failed:', tokenResponse.status)
    return c.json({ error: 'Failed to exchange authorization code' }, 400)
  }

  const tokenData = await tokenResponse.json() as { access_token?: string }
  const access_token = tokenData.access_token
  if (!access_token) {
    console.error('Linux DO token response missing access_token')
    return c.json({ error: 'No access token received' }, 400)
  }

  // Get user info from Linux DO
  let userResponse: Response
  try {
    userResponse = await fetch(LINUXDO_USER_URL, {
      headers: { Authorization: `Bearer ${access_token}` },
    })
  } catch (err) {
    console.error('Linux DO user info network error:', err)
    return c.json({ error: 'Network error fetching user info' }, 500)
  }

  if (!userResponse.ok) {
    console.error('Linux DO user info failed:', userResponse.status)
    return c.json({ error: 'Failed to get user info' }, 400)
  }

  const userData = await userResponse.json() as {
    id: number
    username: string
    avatar_url: string
    trust_level: number
    active: boolean
    silenced: boolean
  }

  if (!userData.active || userData.silenced) {
    return c.json({ error: 'Your Linux DO account is not active or has been silenced' }, 403)
  }

  // Find or create user in database
  const user = await db.user.upsert({
    where: {
      oauthProvider_oauthId: {
        oauthProvider: 'linuxdo',
        oauthId: String(userData.id),
      },
    },
    update: {
      oauthUsername: userData.username,
      avatarUrl: userData.avatar_url,
      trustLevel: userData.trust_level,
      // Don't update isAdmin here - preserve existing value
    },
    create: {
      username: `linuxdo_${userData.id}`,
      oauthProvider: 'linuxdo',
      oauthId: String(userData.id),
      oauthUsername: userData.username,
      avatarUrl: userData.avatar_url,
      trustLevel: userData.trust_level,
      isAdmin: false, // New users are never admin
    },
  })

  if (user.isAdmin && !verifyAdminLoginSlug(loginSlug)) {
    return c.json({ error: 'Invalid administrator login path' }, 403)
  }

  const token = signToken({
    sub: user.id,
    username: userData.username,
    isAdmin: user.isAdmin,
    oauthProvider: 'linuxdo',
    avatarUrl: userData.avatar_url,
    adminGateVersion: user.isAdmin ? getAdminGateVersion() : undefined,
  })

  return c.json({
    success: true,
    token,
    user: {
      id: user.id,
      username: userData.username,
      avatarUrl: userData.avatar_url,
      trustLevel: userData.trust_level,
      isAdmin: user.isAdmin,
      oauthProvider: 'linuxdo',
    },
  })
})

// Check if Linux DO OAuth is enabled
auth.get('/linuxdo/enabled', (c) => {
  return c.json({ enabled: Boolean(LINUXDO_CLIENT_ID && LINUXDO_CLIENT_SECRET && LINUXDO_REDIRECT_URI) })
})

// Get admin's bound Linux DO account info
auth.get('/linuxdo/binding', authMiddleware, async (c) => {
  try {
    const currentUser = c.get('user')
    const boundUser = await db.user.findFirst({
      where: {
        id: currentUser.sub,
        isAdmin: true,
        oauthProvider: 'linuxdo',
        oauthId: { not: null },
      },
      select: {
        id: true,
        oauthUsername: true,
        avatarUrl: true,
        trustLevel: true,
      },
    })

    return c.json({
      success: true,
      data: {
        binding: boundUser ? {
          username: boundUser.oauthUsername,
          avatarUrl: boundUser.avatarUrl,
          trustLevel: boundUser.trustLevel,
        } : null,
      },
    })
  } catch (error) {
    console.error('Get Linux DO binding error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Bind Linux DO account to admin (requires admin auth)
auth.post('/linuxdo/bind', authMiddleware, async (c) => {
  const { code, state } = await c.req.json<{ code?: string; state?: string }>()

  if (!code) {
    return c.json({ error: 'Authorization code is required' }, 400)
  }
  if (!verifyOAuthState(state)) {
    return c.json({ error: 'Invalid or expired OAuth state' }, 400)
  }

  // Exchange code for access token
  let tokenResponse: Response
  try {
    tokenResponse = await fetch(LINUXDO_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: LINUXDO_REDIRECT_URI,
        client_id: LINUXDO_CLIENT_ID,
        client_secret: LINUXDO_CLIENT_SECRET,
      }),
    })
  } catch (err) {
    console.error('Linux DO bind token exchange network error:', err)
    return c.json({ error: 'Network error during token exchange' }, 500)
  }

  if (!tokenResponse.ok) {
    console.error('Linux DO bind token exchange failed:', tokenResponse.status)
    return c.json({ error: 'Failed to exchange authorization code' }, 400)
  }

  const tokenData = await tokenResponse.json() as { access_token?: string }
  const access_token = tokenData.access_token
  if (!access_token) {
    console.error('Linux DO bind token response missing access_token')
    return c.json({ error: 'No access token received' }, 400)
  }

  // Get user info from Linux DO
  let userResponse: Response
  try {
    userResponse = await fetch(LINUXDO_USER_URL, {
      headers: { Authorization: `Bearer ${access_token}` },
    })
  } catch (err) {
    console.error('Linux DO bind user info network error:', err)
    return c.json({ error: 'Network error fetching user info' }, 500)
  }

  if (!userResponse.ok) {
    console.error('Linux DO bind user info failed:', userResponse.status)
    return c.json({ error: 'Failed to get user info' }, 400)
  }

  const userData = await userResponse.json() as {
    id: number
    username: string
    avatar_url: string
    trust_level: number
    active: boolean
    silenced: boolean
  }

  if (!userData.active || userData.silenced) {
    return c.json({ error: 'Your Linux DO account is not active or has been silenced' }, 403)
  }

  // Check if this Linux DO account is already bound to another user
  const existingBinding = await db.user.findFirst({
    where: {
      oauthProvider: 'linuxdo',
      oauthId: String(userData.id),
    },
  })

  const currentUser = c.get('user')
  if (existingBinding && existingBinding.id !== currentUser.sub) {
    return c.json({ error: 'This Linux DO account is already linked to another user' }, 409)
  }

  await db.user.update({
    where: { id: currentUser.sub },
    data: {
      oauthProvider: 'linuxdo',
      oauthId: String(userData.id),
      oauthUsername: userData.username,
      avatarUrl: userData.avatar_url,
      trustLevel: userData.trust_level,
    },
  })

  return c.json({
    success: true,
    binding: {
      username: userData.username,
      avatarUrl: userData.avatar_url,
      trustLevel: userData.trust_level,
    },
  })
})

// Unbind Linux DO account from admin (requires admin auth)
auth.delete('/linuxdo/bind', authMiddleware, async (c) => {
  try {
    const currentUser = c.get('user')
    const result = await db.user.updateMany({
      where: {
        id: currentUser.sub,
        isAdmin: true,
        oauthProvider: 'linuxdo',
      },
      data: {
        oauthProvider: null,
        oauthId: null,
        oauthUsername: null,
        avatarUrl: null,
        trustLevel: null,
      },
    })

    return c.json({
      success: true,
      unboundCount: result.count,
    })
  } catch (error) {
    console.error('Unbind Linux DO error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default auth
