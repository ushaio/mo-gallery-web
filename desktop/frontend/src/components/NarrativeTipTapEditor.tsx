/**
 * TipTap 编辑器的 desktop 端包装层。
 *
 * 编辑器实现位于 packages/tiptap-editor（与 web 端共用同一份源码）；
 * 本文件只负责注入 desktop 应用自身的 i18n、主题与后端接口，对调用方
 * 保持原有的 props / 导出形态不变。web 端有对应的包装层。
 */

import { forwardRef, useCallback, useEffect, useMemo, useState } from 'react'
import NarrativeTipTapEditorCore from '@mo-gallery/tiptap-editor'
import type {
  NarrativeTipTapEditorHandle,
  NarrativeTipTapEditorProps as CoreEditorProps,
  NarrativeEditorRuntime,
} from '@mo-gallery/tiptap-editor'
import { useLanguage } from '@/contexts/LanguageContext'
import { useTheme } from '@/contexts/ThemeContext'
import { getAdminStory } from '@/lib/api/stories'
// 编辑器 AI 走本地链路：共享 ai-agent 编排 + 本地 Go 代理 + 本地会话库，
// 不依赖远程 web 服务器（离线可用）
import { editorAiLocal, getLocalEndpoint } from '@/lib/api/editor-ai-local'
import { registerEditorAutomationTarget } from '@/lib/editor-automation'

const editorAi: NarrativeEditorRuntime['ai'] = editorAiLocal

async function getEditorStory(token: string, storyId: string): Promise<EditorStory> {
  const story = await getAdminStory(token, storyId)
  return {
    id: story.id,
    title: story.title,
    content: story.content,
    coverPhotoId: story.coverPhotoId,
    isPublished: story.isPublished,
    storyDate: story.storyDate,
    createdAt: story.createdAt,
    photos: story.photos.map((photo) => ({
      id: photo.id,
      url: photo.url ?? photo.path ?? '',
      thumbnailUrl: photo.thumbnailUrl ?? undefined,
    })),
  }
}

// Agent 模式端点：本地 Go 代理（密钥在 Go 侧注入）
const getAgentEndpoint: NarrativeEditorRuntime['getAgentEndpoint'] = async () => await getLocalEndpoint()
const copyToWechat: NonNullable<NarrativeEditorRuntime['copyToWechat']> = async (input) => {
  const text = input.title ? `${input.title}\n\n${input.html.replace(/<[^>]+>/g, '')}` : input.html.replace(/<[^>]+>/g, '')
  await navigator.clipboard?.writeText(text)
}

type WithoutRuntime<T> = T extends unknown ? Omit<T, 'runtime'> : never
type EditorStory = { id: string; title: string; content: string; coverPhotoId?: string; isPublished: boolean; storyDate: string; createdAt: string; photos: Array<{ id: string; url: string; thumbnailUrl?: string }> }

export type NarrativeTipTapEditorProps = WithoutRuntime<CoreEditorProps>
export type { NarrativeTipTapEditorHandle }

export const NarrativeTipTapEditor = forwardRef<NarrativeTipTapEditorHandle, NarrativeTipTapEditorProps>(
  (props, ref) => {
    const { t } = useLanguage()
    const { resolvedTheme } = useTheme()
    const [editorHandle, setEditorHandle] = useState<NarrativeTipTapEditorHandle | null>(null)

    const mergeEditorRef = useCallback((handle: NarrativeTipTapEditorHandle | null) => {
      setEditorHandle(handle)
      if (typeof ref === 'function') {
        ref(handle)
      } else if (ref) {
        ref.current = handle
      }
    }, [ref])

    useEffect(() => {
      if (!editorHandle || !props.documentId || (props.documentKind !== 'story' && props.documentKind !== 'blog')) return
      return registerEditorAutomationTarget(props.documentId, props.documentKind, editorHandle)
    }, [editorHandle, props.documentId, props.documentKind])

    const runtime = useMemo<NarrativeEditorRuntime>(
      () => ({ t, resolvedTheme, getAdminStory: getEditorStory, ai: editorAi, getAgentEndpoint, copyToWechat }),
      [t, resolvedTheme],
    )

    if (props.aiOptions?.enabled === true) {
      return <NarrativeTipTapEditorCore {...props} runtime={runtime} ref={mergeEditorRef} />
    }

    return <NarrativeTipTapEditorCore {...props} runtime={runtime} ref={mergeEditorRef} />
  },
)

NarrativeTipTapEditor.displayName = 'NarrativeTipTapEditor'

export default NarrativeTipTapEditor
