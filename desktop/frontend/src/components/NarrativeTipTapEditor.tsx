/**
 * 共享 TipTap 编辑器的 desktop 端包装层。
 *
 * 编辑器实现位于 packages/tiptap-editor（与 web 端共用同一份源码）；
 * 本文件只负责注入 desktop 应用自身的 i18n、主题与后端接口，对调用方
 * 保持原有的 props / 导出形态不变。web 端有对应的包装层。
 */

import { forwardRef, useMemo } from 'react'
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

const editorAi: NarrativeEditorRuntime['ai'] = editorAiLocal

// Agent 模式端点：本地 Go 代理（密钥在 Go 侧注入）
const getAgentEndpoint: NarrativeEditorRuntime['getAgentEndpoint'] = async () => await getLocalEndpoint()

type WithoutRuntime<T> = T extends unknown ? Omit<T, 'runtime'> : never

export type NarrativeTipTapEditorProps = WithoutRuntime<CoreEditorProps>
export type { NarrativeTipTapEditorHandle }

export const NarrativeTipTapEditor = forwardRef<NarrativeTipTapEditorHandle, NarrativeTipTapEditorProps>(
  (props, ref) => {
    const { t } = useLanguage()
    const { resolvedTheme } = useTheme()

    const runtime = useMemo<NarrativeEditorRuntime>(
      () => ({ t, resolvedTheme, getAdminStory, ai: editorAi, getAgentEndpoint }),
      [t, resolvedTheme],
    )

    if (props.aiOptions?.enabled === true) {
      return <NarrativeTipTapEditorCore {...props} runtime={runtime} ref={ref} />
    }

    return <NarrativeTipTapEditorCore {...props} runtime={runtime} ref={ref} />
  },
)

NarrativeTipTapEditor.displayName = 'NarrativeTipTapEditor'

export default NarrativeTipTapEditor
