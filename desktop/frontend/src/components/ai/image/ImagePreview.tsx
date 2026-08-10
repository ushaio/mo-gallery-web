import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { GetAiImageDataURL, SaveMessageImageToAlbum } from '../../../../wailsjs/go/main/App'
import { useCachedPageEffect } from '@/hooks/useCachedPageEffect'
import { localLibraryApi } from '@/features/local-library/api'
import type { RecentLibrary } from '@/features/local-library/types'
import type { AiImageMetadata, EditorAiMessageDto } from '@/lib/api/types'
import { downloadMessageImageToLocal, formatAiLibraryError } from '@/lib/ai-assistant/images'
import { ImageContextMenu, useImageContextMenu } from './ImageContextMenu'
import { LocalLibrarySaveDialog } from './LibrarySaveDialog'

export function ImagePreview({ message, messageId, metadata, t }: {
  message: EditorAiMessageDto
  messageId: string
  metadata: AiImageMetadata
  t: (key: string) => string
}) {
  const [libraryDialogOpen, setLibraryDialogOpen] = useState(false)
  const [imageSrc, setImageSrc] = useState(metadata.uploadedUrl || '')
  const [loadingImage, setLoadingImage] = useState(!metadata.uploadedUrl)
  const [loadError, setLoadError] = useState('')
  const saveState = useImageContextMenu(
    Boolean(metadata.photoId),
    async () => {
      try {
        await SaveMessageImageToAlbum(messageId, imageSrc)
        toast.success(t('admin.ai_saved_to_album'))
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('admin.ai_save_to_album_failed'))
        throw error
      }
    },
    () => downloadMessageImageToLocal(imageSrc, t),
  )
  const selectLibrary = async (library: RecentLibrary) => {
    try {
      await localLibraryApi.open(library.path)
      setLibraryDialogOpen(true)
    } catch (cause) {
      toast.error(formatAiLibraryError(cause))
    }
  }

  useCachedPageEffect(() => {
    async function loadImage() {
      setLoadError('')
      if (metadata.uploadedUrl) {
        setImageSrc(metadata.uploadedUrl)
        setLoadingImage(false)
        return
      }
      setLoadingImage(true)
      try {
        const dataUrl = await GetAiImageDataURL(messageId)
        setImageSrc(dataUrl)
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : '图片加载失败')
      } finally {
        setLoadingImage(false)
      }
    }
    void loadImage()
  }, [messageId, metadata.uploadedUrl])

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: 'var(--foreground)' }}>{message.content || '已生成图片'}</p>
      <div className="rounded-lg border overflow-hidden max-w-md" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)/10' }}>
        {loadingImage ? (
          <div className="h-56 flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
            <Loader2 size={16} className="animate-spin" /> 加载中...
          </div>
        ) : loadError ? (
          <div className="h-32 flex items-center justify-center px-4 text-xs text-center" style={{ color: 'var(--destructive)' }}>{loadError}</div>
        ) : (
          <img
            src={imageSrc}
            alt="AI generated image"
            className="w-full max-h-[420px] object-contain"
            loading="lazy"
            onContextMenu={saveState.handleContextMenu}
          />
        )}
      </div>
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
      {libraryDialogOpen && <LocalLibrarySaveDialog imageUrl={imageSrc} t={t} onClose={() => setLibraryDialogOpen(false)} onSaved={() => setLibraryDialogOpen(false)} />}
      <details className="text-[10px] leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
        <summary className="cursor-pointer select-none py-1">生成信息</summary>
        <div className="space-y-1.5 pt-1">
          <p className="whitespace-pre-wrap break-words">提示词: {metadata.prompt}</p>
          {metadata.revisedPrompt && <p className="whitespace-pre-wrap break-words">优化后: {metadata.revisedPrompt}</p>}
          {(metadata.provider || metadata.model || metadata.size) && <p>{[metadata.provider, metadata.model, metadata.size].filter(Boolean).join(' · ')}</p>}
        </div>
      </details>
    </div>
  )
}
