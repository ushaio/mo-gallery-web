'use client'

/**
 * StoryRichContent — 简化版，直接渲染 HTML 内容（TipTap 输出）。
 * web 端用 react-markdown + remark-gfm 渲染 Markdown，
 * desktop 端 content 已是 HTML，直接用 dangerouslySetInnerHTML 渲染。
 * 图片按 data-photo-id 回填 src（由 hydrateStoryContentImages 处理）。
 */
import { memo } from 'react'
import type { PhotoDto } from '@/lib/api/types'

interface StoryRichContentProps {
  content: string
  photos?: PhotoDto[]
  cdnDomain?: string
  className?: string
  components?: any
}

export const StoryRichContent = memo(function StoryRichContent({
  content,
  className,
}: StoryRichContentProps) {
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  )
})
