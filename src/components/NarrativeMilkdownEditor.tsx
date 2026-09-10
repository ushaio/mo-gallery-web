'use client'

import { forwardRef, useCallback, useMemo } from 'react'
import { MilkdownEditor } from '@mo-gallery/milkdown'
import type { MilkdownEditorHandle, MilkdownEditorProps } from '@mo-gallery/milkdown'
import { useLanguage } from '@/contexts/LanguageContext'
import { resolveAssetUrl } from '@/lib/api/core'
import { uploadPhoto } from '@/lib/api/photos'
import type { PhotoDto } from '@/lib/api/types'
import { createMilkdownAiProvider } from '@/lib/milkdown-ai'

export type NarrativeMilkdownEditorHandle = MilkdownEditorHandle

interface NarrativeMilkdownEditorProps extends MilkdownEditorProps {
  token?: string | null
  photos?: PhotoDto[]
  cdnDomain?: string
  documentId?: string
  documentTitle?: string
  onPhotoUploaded?: (photo: PhotoDto) => void | Promise<void>
}

/** The Web host supplies uploads and media URLs to the shared editor. */
const NarrativeMilkdownEditor = forwardRef<MilkdownEditorHandle, NarrativeMilkdownEditorProps>(function NarrativeMilkdownEditor({ token, photos, cdnDomain, documentId, documentTitle, onPhotoUploaded, ...props }, ref) {
  const { locale } = useLanguage()
  const aiProvider = useMemo(() => token && documentId ? createMilkdownAiProvider(token, documentId, documentTitle) : undefined, [documentId, documentTitle, token])
  const resolveMediaUrl = useCallback((src: string, photoId?: string) => {
    const photo = photoId ? photos?.find((entry) => entry.id === photoId) : undefined
    return resolveAssetUrl(photo?.url || src, cdnDomain)
  }, [cdnDomain, photos])
  const onUpload = useCallback(async (file: File) => {
    if (!token) throw new Error(locale === 'zh' ? '请先登录，再上传图片。' : 'Sign in before uploading images.')
    const photo = await uploadPhoto({ token, file, title: file.name, category: [], origin_flag: 'web' })
    if (!photo.url) throw new Error(locale === 'zh' ? '图片地址不可用。' : 'The image URL is unavailable.')
    await onPhotoUploaded?.(photo)
    return photo.url
  }, [locale, onPhotoUploaded, token])

  return <MilkdownEditor aiProvider={aiProvider} {...props} ref={ref} language={locale} resolveMediaUrl={resolveMediaUrl} onUpload={onUpload} />
})

export default NarrativeMilkdownEditor
