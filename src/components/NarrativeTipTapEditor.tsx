'use client'

/**
 * 共享 TipTap 编辑器的 web 端包装层。
 *
 * 编辑器实现位于 packages/tiptap-editor（与 desktop 端共用同一份源码）；
 * 本文件只负责注入 web 应用自身的 i18n、主题与后端接口，对调用方保持
 * 原有的 props / 导出形态不变。desktop 端有对应的包装层。
 */

import { forwardRef, useCallback, useMemo } from 'react'
import NarrativeTipTapEditorCore from '@mo-gallery/tiptap-editor'
import type {
  NarrativeTipTapEditorHandle,
  NarrativeTipTapEditorProps as CoreEditorProps,
  NarrativeEditorRuntime,
} from '@mo-gallery/tiptap-editor'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSettings } from '@/contexts/SettingsContext'
import { useTheme } from '@/contexts/ThemeContext'
import { buildApiUrl } from '@/lib/api/core'
import { getAdminStory } from '@/lib/api/stories'
import { copyStoryAsWechatArticle } from '@/lib/wechat-article'
import {
  appendEditorAiMessage,
  clearEditorAiConversation,
  createEditorAiConversation,
  deleteEditorAiConversation,
  getEditorAiConversation,
  getEditorAiConversations,
  getStoryAiModels,
  finishEditorAiMessage,
  polishStoryAiPrompt,
  streamStoryAiGenerate,
  updateEditorAiTaskState,
} from '@/lib/api/story-ai'

const editorAi: NarrativeEditorRuntime['ai'] = {
  getStoryAiModels,
  getEditorAiConversations,
  createEditorAiConversation,
  getEditorAiConversation,
  deleteEditorAiConversation,
  clearEditorAiConversation,
  appendEditorAiMessage,
  finishEditorAiMessage,
  updateEditorAiTaskState,
  polishStoryAiPrompt,
  streamStoryAiGenerate,
}

type WithoutRuntime<T> = T extends unknown ? Omit<T, 'runtime'> : never

export type NarrativeTipTapEditorProps = WithoutRuntime<CoreEditorProps>
export type { NarrativeTipTapEditorHandle }

export const NarrativeTipTapEditor = forwardRef<NarrativeTipTapEditorHandle, NarrativeTipTapEditorProps>(
  (props, ref) => {
    const { t } = useLanguage()
    const { settings } = useSettings()
    const { resolvedTheme } = useTheme()

    // Agent 模式端点：走服务端 Hono 代理，上游密钥不出服务器
    const getAgentEndpoint = useCallback(async (token: string) => ({
      // OpenAI JS SDK requires an absolute base URL, even for same-origin proxies.
      baseURL: new URL(
        buildApiUrl('/api/admin/editor-ai/proxy'),
        window.location.origin,
      ).toString(),
      headers: { Authorization: `Bearer ${token}` },
    }), [])

    const copyToWechat = useCallback<NonNullable<NarrativeEditorRuntime['copyToWechat']>>(async (input) => {
      let photos: Awaited<ReturnType<typeof getAdminStory>>['photos'] = []

      if (input.documentKind === 'story' && input.documentId && input.token) {
        try {
          photos = (await getAdminStory(input.token, input.documentId)).photos
        } catch {
          // Current editor HTML remains copyable even if the saved story cannot be refreshed.
        }
      }

      await copyStoryAsWechatArticle({
        title: input.title || '',
        content: input.html,
        photos,
      }, settings?.cdn_domain)
    }, [settings?.cdn_domain])

    const runtime = useMemo<NarrativeEditorRuntime>(
      () => ({ t, resolvedTheme, getAdminStory, ai: editorAi, getAgentEndpoint, copyToWechat }),
      [t, resolvedTheme, getAgentEndpoint, copyToWechat],
    )

    if (props.aiOptions?.enabled === true) {
      return <NarrativeTipTapEditorCore {...props} runtime={runtime} ref={ref} />
    }

    return <NarrativeTipTapEditorCore {...props} runtime={runtime} ref={ref} />
  },
)

NarrativeTipTapEditor.displayName = 'NarrativeTipTapEditor'

export default NarrativeTipTapEditor
