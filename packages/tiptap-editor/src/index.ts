/**
 * @mo-gallery/tiptap-editor 公共入口。
 * web / desktop 通过各自的薄包装层（src/components/NarrativeTipTapEditor.tsx）
 * 注入 NarrativeEditorRuntime 后使用。
 */

export { NarrativeTipTapEditor, default } from './NarrativeTipTapEditor'
export type { NarrativeTipTapEditorProps, NarrativeTipTapEditorHandle } from './NarrativeTipTapEditor'

export * from './runtime'

// 工具函数（阅读态渲染、粘贴上传占位等也会用到）
export * from './lib/media-embed'
export * from './lib/story-link-card'
export * from './lib/wechat-article'
export * from './tiptap-editor/editor-constants'
export * from './tiptap-editor/ai-task-mutation-guard'
export * from './tiptap-editor/markdown-converter'
export * from './tiptap-editor/typora-input-rules'
export * from './tiptap-editor/typora-keymap'
export * from './tiptap-editor/story-paste-upload-placeholder'
export * from './tiptap-editor/WechatIcon'
