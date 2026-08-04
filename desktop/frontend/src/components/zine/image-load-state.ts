export interface ImageLoadState {
  status: 'ready' | 'failed'
  retryKey: number
}

export type ImageLoadAction = { type: 'source-changed' } | { type: 'failed' } | { type: 'retry' }

export const initialImageLoadState: ImageLoadState = { status: 'ready', retryKey: 0 }

export function imageLoadReducer(state: ImageLoadState, action: ImageLoadAction): ImageLoadState {
  switch (action.type) {
    case 'source-changed':
      return initialImageLoadState
    case 'failed':
      return { ...state, status: 'failed' }
    case 'retry':
      return { status: 'ready', retryKey: state.retryKey + 1 }
  }
}
