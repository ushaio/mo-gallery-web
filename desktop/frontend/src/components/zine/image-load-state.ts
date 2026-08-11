export interface ImageLoadState {
  status: 'ready' | 'failed'
  retryKey: number
}

export type ImageLoadAction = { type: 'failed' } | { type: 'retry' }

export const initialImageLoadState: ImageLoadState = { status: 'ready', retryKey: 0 }

export function getImageLoadInstanceKey(assetId: string | undefined, src: string) {
  return `${assetId ?? ''}:${src}`
}

export function imageLoadReducer(state: ImageLoadState, action: ImageLoadAction): ImageLoadState {
  switch (action.type) {
    case 'failed':
      return { ...state, status: 'failed' }
    case 'retry':
      return { status: 'ready', retryKey: state.retryKey + 1 }
  }
}
