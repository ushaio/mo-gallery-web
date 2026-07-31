import { create } from 'zustand'

export type UploadIntent =
  | { source: 'paths'; paths: string[]; albumId?: string }
  | { source: 'local-assets'; assetIds: string[]; albumId?: string }

interface UploadIntentState {
  pending?: UploadIntent
  enqueue: (intent: UploadIntent) => void
  consume: () => UploadIntent | undefined
}

function cloneIntent(intent: UploadIntent): UploadIntent {
  if (intent.source === 'local-assets') {
    return { source: intent.source, assetIds: [...intent.assetIds], albumId: intent.albumId }
  }
  return { source: intent.source, paths: [...intent.paths], albumId: intent.albumId }
}

export const useUploadIntentStore = create<UploadIntentState>((set, get) => ({
  pending: undefined,
  enqueue: (intent) => set({ pending: cloneIntent(intent) }),
  consume: () => {
    const intent = get().pending
    if (intent) set({ pending: undefined })
    return intent
  },
}))
