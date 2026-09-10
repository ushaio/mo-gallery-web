'use client'

import { memo } from 'react'
import { MilkdownContent } from '@mo-gallery/milkdown/content'
import { resolveAssetUrl } from '@/lib/api/core'
import type { EditorType, PhotoDto } from '@/lib/api/types'

interface StoryRichContentProps {
  editorType: EditorType
  tiptapContent: string
  milkContent?: string | null
  photos?: PhotoDto[]
  cdnDomain?: string
  className?: string
}

export const StoryRichContent = memo(function StoryRichContent({
  editorType,
  tiptapContent,
  milkContent,
  photos,
  cdnDomain,
  className,
}: StoryRichContentProps) {
  if (editorType === 'milkdown') return <MilkdownContent content={milkContent ?? ''} className={className} resolveMediaUrl={(src, photoId) => resolveAssetUrl(photos?.find((photo) => photo.id === photoId)?.url || src, cdnDomain)} />
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: tiptapContent }}
    />
  )
})
