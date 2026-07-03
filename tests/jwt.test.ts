import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { signToken, verifyToken } from '../server/lib/jwt-core'

function runTest(name: string, callback: () => void) {
  try {
    callback()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

const originalJwtSecret = process.env.JWT_SECRET

try {
  runTest('requires JWT_SECRET before signing tokens', () => {
    delete process.env.JWT_SECRET

    assert.throws(
      () => signToken({ sub: 'user-1', username: 'admin', isAdmin: true }),
      /JWT_SECRET/,
    )
  })

  runTest('signs and verifies tokens with configured JWT_SECRET', () => {
    process.env.JWT_SECRET = 'expected-secret'

    const token = signToken({ sub: 'user-1', username: 'admin', isAdmin: true })
    const payload = verifyToken(token)

    assert.equal(payload.sub, 'user-1')
    assert.equal(payload.username, 'admin')
    assert.equal(payload.isAdmin, true)
  })

  runTest('rejects tokens signed with a different secret', () => {
    process.env.JWT_SECRET = 'expected-secret'
    const token = jwt.sign({ sub: 'user-1', username: 'admin', isAdmin: true }, 'wrong-secret')

    assert.throws(() => verifyToken(token))
  })
} finally {
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET
  } else {
    process.env.JWT_SECRET = originalJwtSecret
  }
}
