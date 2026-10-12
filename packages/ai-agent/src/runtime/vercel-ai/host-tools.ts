import { jsonSchema, tool } from 'ai'
import type { ToolSet } from 'ai'

import type { EditorAiRuntimeTool } from '../../stream'

/**
 * 把宿主风格的运行时工具（description + JSON Schema + execute）转成 AI SDK 的
 * ToolSet，供编辑器直改 Agent 在同一轮里调用。
 *
 * 为什么需要转换：宿主侧的工具（Agent Skills 读取、MCP 工具）是用 JSON Schema 描述
 * 入参的普通对象，而直改 Agent 跑在 AI SDK 的工具循环里，需要的是 `tool(...)` 包装的
 * 定义。这里只做形状适配，不改变任何工具语义——参数校验仍由它们自己的 JSON Schema
 * 表达，执行体原样透传（含 signal 与 toolCallId）。
 */
export function createDirectEditToolSet(
  tools: Record<string, EditorAiRuntimeTool> | undefined,
): ToolSet | undefined {
  if (!tools) return undefined
  const entries = Object.entries(tools)
  if (entries.length === 0) return undefined
  const converted: ToolSet = {}
  for (const [name, definition] of entries) {
    converted[name] = tool({
      description: definition.description,
      inputSchema: jsonSchema(definition.inputSchema as Parameters<typeof jsonSchema>[0]),
      execute: async (input: unknown, options?: { abortSignal?: AbortSignal; toolCallId?: string }) => (
        await definition.execute(input, {
          ...(options?.abortSignal ? { signal: options.abortSignal } : {}),
          ...(options?.toolCallId ? { toolCallId: options.toolCallId } : {}),
        })
      ),
    }) as ToolSet[string]
  }
  return converted
}
