export const ERROR_CODES = {
  INVALID_MANIFEST: 'invalid_manifest',
  UNSUPPORTED_PLATFORM: 'unsupported_platform',
  RUNTIME_MISSING: 'runtime_missing',
  CAPABILITY_MISSING: 'capability_missing',
  REQUEST_TIMEOUT: 'request_timeout',
  REQUEST_CANCELED: 'request_canceled',
  PLUGIN_CRASHED: 'plugin_crashed',
  CREDENTIAL_UNAVAILABLE: 'credential_unavailable',
  TRANSFER_FAILED: 'transfer_failed',
} as const

export type PluginErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES] | string

export class PluginError extends Error {
  readonly code: PluginErrorCode
  readonly data?: unknown

  constructor(code: PluginErrorCode, message: string, data?: unknown) {
    super(message)
    this.name = 'PluginError'
    this.code = code
    this.data = data
  }
}

export function toPluginError(error: unknown, fallbackCode = 'plugin_error'): PluginError {
  if (error instanceof PluginError) return error
  if (error instanceof Error) return new PluginError(fallbackCode, error.message)
  return new PluginError(fallbackCode, String(error))
}
