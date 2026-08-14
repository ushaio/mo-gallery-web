import {
  ApiUnauthorizedError,
  configureApiRuntime,
} from '@mo-gallery/api-client/core'
import { reportAuthFailure } from '@/lib/auth-failure'

configureApiRuntime({
  onUnauthorized: (error) => reportAuthFailure({ code: error.code, message: error.message }),
})

export * from '@mo-gallery/api-client/core'

export { ApiUnauthorizedError }
