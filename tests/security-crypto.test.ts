import assert from 'node:assert/strict'

const oauthState = await import('../server/lib/oauth-state')
const storedSecrets = await import('../server/lib/stored-secrets')

process.env.JWT_SECRET = 'security-test-secret-that-is-at-least-32-bytes'

const now = Date.now()
const state = oauthState.createOAuthState(now)
assert.equal(oauthState.verifyOAuthState(state, now), true)
assert.equal(oauthState.verifyOAuthState(`${state}x`, now), false)
assert.equal(oauthState.verifyOAuthState(state, now + 10 * 60 * 1000 + 1), false)

const encrypted = storedSecrets.encryptStoredSecret('storage-secret-value')
assert.ok(encrypted)
assert.equal(storedSecrets.isStoredSecretEncrypted(encrypted), true)
assert.notEqual(encrypted, 'storage-secret-value')
assert.equal(storedSecrets.decryptStoredSecret(encrypted), 'storage-secret-value')
assert.equal(storedSecrets.redactStoredSecret(encrypted), '********')
assert.equal(storedSecrets.decryptStoredSecret('legacy-plaintext'), 'legacy-plaintext')

const tampered = `${encrypted!.slice(0, -1)}${encrypted!.endsWith('a') ? 'b' : 'a'}`
assert.throws(() => storedSecrets.decryptStoredSecret(tampered))

console.log('Security crypto tests passed')
