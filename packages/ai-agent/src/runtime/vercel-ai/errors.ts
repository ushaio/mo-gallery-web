export function createAbortError(reason?: unknown): Error {
  const message = typeof reason === 'string' && reason.trim()
    ? reason
    : 'AI generation was aborted'
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

export function normalizeAiError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
