'use client'

import { forwardRef, useCallback } from 'react'
import { MilkdownEditor } from '@mo-gallery/milkdown'
import type { MilkdownEditorHandle, MilkdownEditorProps } from '@mo-gallery/milkdown'
import { uploadPhoto } from '@/lib/api/photos'
import { resolveAssetUrl } from '@/lib/api/core'
import type { PhotoDto } from '@/lib/api/types'
import { usePreferences } from '@/store/preferences'

export type NarrativeMilkdownEditorHandle = MilkdownEditorHandle

interface NarrativeMilkdownEditorProps extends MilkdownEditorProps {
  token?: string | null
  photos?: PhotoDto[]
  cdnDomain?: string
  onPhotoUploaded?: (photo: PhotoDto) => void
}

/** Desktop supplies storage and photo URLs; all editing belongs to Milkdown. */
const NarrativeMilkdownEditor = forwardRef<MilkdownEditorHandle, NarrativeMilkdownEditorProps>(function NarrativeMilkdownEditor({ token, photos, cdnDomain, onPhotoUploaded, ...props }, ref) {
  const language = usePreferences((state) => state.language)
  const resolveMediaUrl = useCallback((src: string, photoId?: string) => {
    const photo = photoId ? photos?.find((entry) => entry.id === photoId) : undefined
    return resolveAssetUrl(photo?.url || src, cdnDomain)
  }, [cdnDomain, photos])
  const onUpload = useCallback(async (file: File) => {
    if (!token) throw new Error(language === 'zh' ? '请先连接站点，再上传图片。' : 'Connect to your site before uploading images.')
    const photo = await uploadPhoto({ token, file, title: file.name, category: [], origin_flag: 'desktop' })
    if (!photo.url) throw new Error(language === 'zh' ? '图片地址不可用。' : 'The image URL is unavailable.')
    onPhotoUploaded?.(photo)
    return photo.url
  }, [language, onPhotoUploaded, token])

  return <MilkdownEditor {...props} ref={ref} language={language} resolveMediaUrl={resolveMediaUrl} onUpload={onUpload} />
})

export default NarrativeMilkdownEditor
