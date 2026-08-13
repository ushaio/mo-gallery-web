import assert from 'node:assert/strict'
import test from 'node:test'
import { getErrorMessage, isAuthError } from './auth-errors'

test('preserves an object error message', () => {
  assert.equal(getErrorMessage({ message: 'Token signature is invalid' }), 'Token signature is invalid')
})

test('does not treat a Next.js HTML 404 as an authentication error', () => {
  const error = new Error(
    'API error (HTTP 404): <!doctype html><script>"unauthorized":"$undefined"</script>',
  )

  assert.equal(isAuthError(error), false)
})

test('recognizes explicit unauthorized errors', () => {
  assert.equal(isAuthError(new Error('Unauthorized: token missing')), true)
  assert.equal(isAuthError({ status: 401, message: 'request failed' }), true)
})
