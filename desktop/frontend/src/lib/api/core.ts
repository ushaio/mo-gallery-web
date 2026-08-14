import { configureApiRuntime } from '@mo-gallery/api-client/core'
import { reportAuthFailure } from '@/lib/auth-errors'
import { invalidateDesktopCacheForApiRequest } from '@/lib/app-cache'

configureApiRuntime({
  onUnauthorized: reportAuthFailure,
  onRequestCompleted: invalidateDesktopCacheForApiRequest,
})

export * from '@mo-gallery/api-client/core'
