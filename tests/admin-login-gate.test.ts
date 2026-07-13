import assert from 'node:assert/strict'
import { Hono } from 'hono'

function resolveWrappedExport<T>(
  namespace: unknown,
  isTarget: (value: Record<string, unknown>) => boolean,
): T {
  const queue = [namespace]
  const visited = new Set<object>()

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || typeof current !== 'object' || visited.has(current)) {
      continue
    }

    visited.add(current)
    const record = current as Record<string, unknown>
    if (isTarget(record)) {
      return current as T
    }

    queue.push(record.default, record['module.exports'])
  }

  throw new Error('Unable to resolve wrapped module export')
}

async function runTest(name: string, callback: () => Promise<void>) {
  try {
    await callback()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

async function main() {
  const [authNamespace, middlewareNamespace, gateNamespace, jwtNamespace] = await Promise.all([
    import('../hono/auth'),
    import('../hono/middleware/auth'),
    import('../server/lib/admin-login-gate'),
    import('../server/lib/jwt-core'),
  ])
  const authRoute = resolveWrappedExport<typeof import('../hono/auth').default>(
    authNamespace,
    (value) => Array.isArray(value.routes) && typeof value.request === 'function',
  )
  const middlewareModule = resolveWrappedExport<typeof import('../hono/middleware/auth')>(
    middlewareNamespace,
    (value) => typeof value.authMiddleware === 'function',
  )
  const gateModule = resolveWrappedExport<typeof import('../server/lib/admin-login-gate')>(
    gateNamespace,
    (value) => typeof value.getAdminGateVersion === 'function',
  )
  const jwtModule = resolveWrappedExport<typeof import('../server/lib/jwt-core')>(
    jwtNamespace,
    (value) => typeof value.signToken === 'function' && typeof value.verifyToken === 'function',
  )

  const originalEnv = {
    jwtSecret: process.env.JWT_SECRET,
    adminLoginUrl: process.env.ADMIN_LOGIN_URL,
    publicAdminLoginUrl: process.env.NEXT_PUBLIC_ADMIN_LOGIN_URL,
    adminUsername: process.env.ADMIN_USERNAME,
    adminPassword: process.env.ADMIN_PASSWORD,
  }

  const authApp = new Hono().route('/auth', authRoute)
  const protectedApp = new Hono()
  protectedApp.get('/admin', middlewareModule.authMiddleware, (c) => c.json({ success: true }))

  try {
    process.env.JWT_SECRET = 'gate-test-secret'
    process.env.ADMIN_USERNAME = 'admin'
    process.env.ADMIN_PASSWORD = 'password'

    await runTest('allows legacy login when the administrator gate is disabled', async () => {
      process.env.ADMIN_LOGIN_URL = ''
      process.env.NEXT_PUBLIC_ADMIN_LOGIN_URL = ''

      const response = await authApp.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'password' }),
      })

      assert.equal(response.status, 200)
      const body = await response.json() as { token: string }
      assert.equal(jwtModule.verifyToken(body.token).adminGateVersion, undefined)
    })

    await runTest('rejects direct administrator login without the configured slug', async () => {
      process.env.ADMIN_LOGIN_URL = 'shai'

      const response = await authApp.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'password' }),
      })

      assert.equal(response.status, 403)
    })

    await runTest('binds the current gate version to administrator tokens', async () => {
      process.env.ADMIN_LOGIN_URL = 'shai'

      const response = await authApp.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin',
          password: 'password',
          loginSlug: 'shai',
        }),
      })

      assert.equal(response.status, 200)
      const body = await response.json() as { token: string }
      assert.equal(
        jwtModule.verifyToken(body.token).adminGateVersion,
        gateModule.getAdminGateVersion(),
      )
    })

    await runTest('rejects non-admin and stale administrator tokens', async () => {
      process.env.ADMIN_LOGIN_URL = 'shai'
      const currentAdminToken = jwtModule.signToken({
        sub: 'admin',
        username: 'admin',
        isAdmin: true,
        adminGateVersion: gateModule.getAdminGateVersion(),
      })
      const nonAdminToken = jwtModule.signToken({
        sub: 'user',
        username: 'user',
        isAdmin: false,
      })

      const nonAdminResponse = await protectedApp.request('/admin', {
        headers: { Authorization: `Bearer ${nonAdminToken}` },
      })
      assert.equal(nonAdminResponse.status, 401)

      process.env.ADMIN_LOGIN_URL = 'rotated'
      const staleResponse = await protectedApp.request('/admin', {
        headers: { Authorization: `Bearer ${currentAdminToken}` },
      })
      assert.equal(staleResponse.status, 401)
      assert.deepEqual(await staleResponse.json(), {
        code: 'ADMIN_LOGIN_GATE_CHANGED',
        error: 'Administrator login URL has changed; sign in again using the new URL',
      })
    })
  } finally {
    for (const [key, value] of Object.entries({
      JWT_SECRET: originalEnv.jwtSecret,
      ADMIN_LOGIN_URL: originalEnv.adminLoginUrl,
      NEXT_PUBLIC_ADMIN_LOGIN_URL: originalEnv.publicAdminLoginUrl,
      ADMIN_USERNAME: originalEnv.adminUsername,
      ADMIN_PASSWORD: originalEnv.adminPassword,
    })) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

void main()
