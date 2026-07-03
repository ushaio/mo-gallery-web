import 'server-only'
import { Hono } from 'hono'
import { signToken } from '~/server/lib/jwt'
import { db } from '~/server/lib/db'
import { authMiddleware, AuthVariables } from './middleware/auth'

const auth = new Hono<{ Variables: AuthVariables }>()

// Linux DO OAuth configuration
const LINUXDO_CLIENT_ID = process.env.LINUXDO_CLIENT_ID || ''
const LINUXDO_CLIENT_SECRET = process.env.LINUXDO_CLIENT_SECRET || ''
const LINUXDO_REDIRECT_URI = process.env.LINUXDO_REDIRECT_URI || ''

// Linux DO OAuth endpoints (备用端点优先，解决网络问题)
const LINUXDO_AUTHORIZE_URL = 'https://connect.linux.do/oauth2/authorize'
const LINUXDO_TOKEN_URL = 'https://connect.linuxdo.org/oauth2/token'
const LINUXDO_USER_URL = 'https://connect.linuxdo.org/api/user'

auth.post('/login', async (c) => {
  const { username, password } = await c.req.json()

  if (!username || !password) {
    return c.json({ error: 'Username and password are required' }, 400)
  }

  const adminUsername = process.env.ADMIN_USERNAME || 'admin'
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'

  if (username !== adminUsername || password !== adminPassword) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const token = signToken({
    sub: 'admin',
    username: adminUsername,
    isAdmin: true,
  })

  return c.json({
    success: true,
    token,
    user: { username: adminUsername, isAdmin: true },
  })
})

// Get Linux DO OAuth authorization URL
auth.get('/linuxdo', (c) => {
  if (!LINUXDO_CLIENT_ID) {
    return c.json({ error: 'Linux DO OAuth is not configured' }, 400)
  }

  const state = Math.random().toString(36).substring(2, 15)
  const authUrl = new URL(LINUXDO_AUTHORIZE_URL)
  authUrl.searchParams.set('client_id', LINUXDO_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', LINUXDO_REDIRECT_URI)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('state', state)

  return c.json({ url: authUrl.toString(), state })
})

// Handle Linux DO OAuth callback
auth.post('/linuxdo/callback', async (c) => {
  const { code } = await c.req.json()

  if (!code) {
    return c.json({ error: 'Authorization code is required' }, 400)
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
    const errorText = await tokenResponse.text()
    console.error('Linux DO token exchange failed:', tokenResponse.status, errorText)
    return c.json({ error: 'Failed to exchange authorization code' }, 400)
  }

  const tokenData = await tokenResponse.json() as { access_token?: string }
  const access_token = tokenData.access_token
  if (!access_token) {
    console.error('Linux DO token response missing access_token:', tokenData)
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
    const errorText = await userResponse.text()
    console.error('Linux DO user info failed:', userResponse.status, errorText)
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

  // Check if this Linux DO account is already bound to an admin user
  const existingUser = await db.user.findFirst({
    where: {
      oauthProvider: 'linuxdo',
      oauthId: String(userData.id),
    },
  })

  // Only existing users with isAdmin=true can be admin via Linux DO login
  // New users are always non-admin (must bind via admin panel first)
  const isAdmin = existingUser?.isAdmin ?? false

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

  const token = signToken({
    sub: user.id,
    username: userData.username,
    isAdmin: user.isAdmin,
    oauthProvider: 'linuxdo',
    avatarUrl: userData.avatar_url,
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
    // Find admin user with Linux DO binding
    const boundUser = await db.user.findFirst({
      where: {
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
  const { code } = await c.req.json()

  if (!code) {
    return c.json({ error: 'Authorization code is required' }, 400)
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
    const errorText = await tokenResponse.text()
    console.error('Linux DO bind token exchange failed:', tokenResponse.status, errorText)
    return c.json({ error: 'Failed to exchange authorization code' }, 400)
  }

  const tokenData = await tokenResponse.json() as { access_token?: string }
  const access_token = tokenData.access_token
  if (!access_token) {
    console.error('Linux DO bind token response missing access_token:', tokenData)
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
    const errorText = await userResponse.text()
    console.error('Linux DO bind user info failed:', userResponse.status, errorText)
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

  if (existingBinding) {
    // If already bound, just update it to be admin
    await db.user.update({
      where: { id: existingBinding.id },
      data: {
        isAdmin: true,
        oauthUsername: userData.username,
        avatarUrl: userData.avatar_url,
        trustLevel: userData.trust_level,
      },
    })
  } else {
    // Create new binding as admin
    await db.user.create({
      data: {
        username: `linuxdo_${userData.id}`,
        oauthProvider: 'linuxdo',
        oauthId: String(userData.id),
        oauthUsername: userData.username,
        avatarUrl: userData.avatar_url,
        trustLevel: userData.trust_level,
        isAdmin: true,
      },
    })
  }

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
    // Find and remove admin binding
    const result = await db.user.updateMany({
      where: {
        isAdmin: true,
        oauthProvider: 'linuxdo',
      },
      data: {
        isAdmin: false,
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
