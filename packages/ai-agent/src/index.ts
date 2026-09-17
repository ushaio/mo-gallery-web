/**
 * @mo-gallery/ai-agent 公共入口。
 *
 * 这里只暴露 MO Gallery 自己的领域协议；Vercel AI SDK 类型被限制在
 * src/runtime/** 适配层，不会贯穿 Web、Desktop 或 TipTap。
 */

export * from './types'
export * from './prompt'
export * from './direct-edit-prompt'
export * from './stream'
export * from './domain/agent'
export * from './domain/approvals'
export * from './domain/changes'
export {
  applyEditorAiContextBudget,
  estimateEditorAiContextTokens,
  resolveEditorAiCapabilities,
  type EditorAiContextBudget,
  type EditorAiContextBudgetResult,
  type EditorAiDegradation,
  type EditorAiDegradationCode,
  type EditorAiExecutionMode,
  type EditorAiModelCapabilities,
  type EditorAiVisualMode,
  type ResolvedEditorAiCapabilities,
} from './domain/capabilities'
export * from './domain/document'
export * from './domain/execution'
export * from './domain/json'
export {
  MAX_EDITOR_AI_MESSAGE_METADATA_BYTES,
  editorAiMessageMetadataSchema,
  editorAiTaskMessageMetadataSchema,
  editorAiTaskStateUpdateSchema,
  readEditorAiTaskMessageMetadata,
  type EditorAiMessageMetadata,
  type EditorAiTaskMessageMetadata,
  type EditorAiTaskStateUpdate,
} from './domain/message-metadata'
export * from './domain/operations'
export * from './domain/proposals'
export * from './domain/revision'
export {
  runDirectEditAgent,
  runDirectEditAgentWithRuntime,
  runEditorAgent,
  runEditorAgentWithRuntime,
  type RunDirectEditAgentOptions,
  type RunDirectEditAgentResult,
  type RunEditorAgentOptions,
} from './agent'
