'use client'

import { forwardRef, useCallback, useMemo } from 'react'
import { MilkdownEditor } from '@mo-gallery/milkdown'
import type { ImageEditOptions, MilkdownEditorHandle, MilkdownEditorProps } from '@mo-gallery/milkdown'
import type { MediaDialogSelectProps } from '@mo-gallery/milkdown'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { useLanguage } from '@/contexts/LanguageContext'
import { resolveAssetUrl } from '@/lib/api/core'
import { uploadPhoto } from '@/lib/api/photos'
import { editEditorImage } from '@/lib/api/story-ai'
import type { PhotoDto } from '@/lib/api/types'
import { createLinkPreviewResolver } from '@/lib/api/link-preview'
import { createMilkdownAiProvider } from '@/lib/milkdown-ai'

export type NarrativeMilkdownEditorHandle = MilkdownEditorHandle

function renderMediaDialogSelect(props: MediaDialogSelectProps) {
  return <CustomSelect {...props} uiVariant="admin" />
}

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
    const photo = await uploadPhoto({ token, file, title: file.name, tags: [], origin_flag: 'web' })
    if (!photo.url) throw new Error(locale === 'zh' ? '图片地址不可用。' : 'The image URL is unavailable.')
    await onPhotoUploaded?.(photo)
    return photo.url
  }, [locale, onPhotoUploaded, token])

  const resolveLinkPreview = useMemo(() => token ? createLinkPreviewResolver(token) : undefined, [token])

  /**
   * 单图 AI 改图：把「调模型」接到宿主自己的接口上。
   *
   * 共享编辑器只管问用户要什么、把结果交回来，不知道后端长什么样。参考图直接给
   * photoId —— 服务端拿它换出存储键、从存储原文件读，比把图片地址再走一遍 HTTP 稳
   * （私有桶、签名 URL、本机 /uploads 都能过）。没有 photoId 的老卡片退回地址。
   */
  const imageEdit = useMemo<ImageEditOptions | undefined>(() => {
    if (!token) return undefined
    return {
      run: async ({ prompt, reference, size, model }) => {
        const absolute = reference?.src ? resolveAssetUrl(reference.src, cdnDomain) : ''
        const result = await editEditorImage(token, {
          prompt,
          // id 与地址一起给：id 让服务端直接读存储，地址是取不到时的退路。
          ...(reference?.photoId ? { referencePhotoId: reference.photoId } : {}),
          ...(absolute ? { referenceUrl: absolute } : {}),
          ...(size ? { imageSize: size } : {}),
          ...(model ? { imageModel: model } : {}),
        })
        if (!result.url) throw new Error(locale === 'zh' ? '生成成功但图片地址不可用。' : 'Generated, but the image URL is unavailable.')
        return {
          url: result.url,
          photoId: result.photoId,
          ...(result.width && result.height ? { width: result.width, height: result.height } : {}),
        }
      },
    }
  }, [cdnDomain, locale, token])

  return <MilkdownEditor aiProvider={aiProvider} {...props} imageEdit={imageEdit} renderMediaDialogSelect={renderMediaDialogSelect} ref={ref} language={locale} resolveMediaUrl={resolveMediaUrl} resolveLinkPreview={resolveLinkPreview} onUpload={onUpload} />
})

export default NarrativeMilkdownEditor
