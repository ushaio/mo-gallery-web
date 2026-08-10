import { useState } from 'react'
import { toast } from 'sonner'
import { SaveMessageImageToAlbum } from '../../../../wailsjs/go/main/App'
import { localLibraryApi } from '@/features/local-library/api'
import type { RecentLibrary } from '@/features/local-library/types'
import { downloadMessageImageToLocal, formatAiLibraryError } from '@/lib/ai-assistant/images'
import type { MessageImageRef } from '@/lib/ai-assistant/types'
import { ImageContextMenu, useImageContextMenu } from './ImageContextMenu'
import { LocalLibrarySaveDialog } from './LibrarySaveDialog'

export function MessageImage({
  messageId,
  image,
  t,
}: {
  messageId: string
  image: MessageImageRef
  t: (key: string) => string
}) {
  const [libraryDialogOpen, setLibraryDialogOpen] = useState(false)
  const saveState = useImageContextMenu(
    Boolean(image.photoId),
    async () => {
      try {
        await SaveMessageImageToAlbum(messageId, image.url)
        toast.success(t('admin.ai_saved_to_album'))
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('admin.ai_save_to_album_failed'))
        throw error
      }
    },
    () => downloadMessageImageToLocal(image.url, t),
  )
  const selectLibrary = async (library: RecentLibrary) => {
    try {
      await localLibraryApi.open(library.path)
      setLibraryDialogOpen(true)
    } catch (cause) {
      toast.error(formatAiLibraryError(cause))
    }
  }

  return (
    <div className="relative max-w-[200px] rounded-md overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
      <img
        src={image.url}
        alt=""
        className="max-h-[200px] object-contain"
        loading="lazy"
        onContextMenu={saveState.handleContextMenu}
      />
      <ImageContextMenu
        position={saveState.contextMenu}
        saving={saveState.saving}
        downloading={saveState.downloading}
        saved={saveState.saved}
        onSave={saveState.handleSave}
        onDownload={saveState.handleDownload}
        onSelectLibrary={selectLibrary}
        t={t}
      />
      {libraryDialogOpen && <LocalLibrarySaveDialog imageUrl={image.url} t={t} onClose={() => setLibraryDialogOpen(false)} onSaved={() => setLibraryDialogOpen(false)} />}
    </div>
  )
}
