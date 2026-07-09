/**
 * 编辑器 Agent：模型 + 工具 + 循环。
 *
 * Agent 不直接改文档——通过 read_document 读取全文、propose_edit 提交
 * 修改提案（原文片段 → 新文本），全部提案由宿主 UI 以 diff 预览的形式
 * 逐条让用户接受/跳过后才落到编辑器里。
 *
 * 与 stream.ts 一样跑在两种环境：desktop（webview + 本地 Go 代理）、
 * web（服务端或经 Hono 代理路由）。
 */

import { streamText, tool, stepCountIs } from 'ai'
import { z } from 'zod'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { EditorAiEndpoint } from './types'

export interface EditorAgentDocument {
  /**
   * 当前文档的线性化纯文本。段落之间必须用单个 '\n' 分隔，
   * 且提案应用方（宿主）要用同一套线性化规则做原文定位。
   */
  getText(): string
}

export interface EditorAgentEditProposal {
  /** 文档中被替换的原文片段（agent 逐字复制，宿主按精确匹配定位） */
  originalText: string
  /** 替换后的新文本；空字符串表示删除该片段 */
  newText: string
  /** 修改理由（展示给用户） */
  reason?: string
}

export interface RunEditorAgentOptions {
  endpoint: EditorAiEndpoint
  model: string
  /** 用户给 agent 的任务指令 */
  instruction: string
  document: EditorAgentDocument
  title?: string
  signal?: AbortSignal
  /** agent 的说明性文字流（工具调用之间的思路陈述与最终总结） */
  onProgress?: (text: string) => void
  /** 工具循环步数上限，默认 8 */
  maxSteps?: number
}

export interface EditorAgentResult {
  /** agent 的最终文字说明 */
  summary: string
  proposals: EditorAgentEditProposal[]
}

const AGENT_SYSTEM_PROMPT = [
  '你是一名中文摄影叙事文档编辑 agent，通过工具协作修改用户的故事文档。',
  '工作流程：先用 read_document 通读全文，再针对任务用 propose_edit 逐条提交修改提案。',
  'propose_edit 的 originalText 必须逐字复制文档中的连续原文片段（包括标点和空格），否则会被拒绝。',
  '每个提案只覆盖一处修改，保持片段尽量短小、聚焦；不要把整篇文档作为一个提案。',
  '所有提案提交完后，用一小段中文总结你做了什么以及为什么。不要在总结里重复修改内容本身。',
].join('\n')

export async function runEditorAgent(options: RunEditorAgentOptions): Promise<EditorAgentResult> {
  const proposals: EditorAgentEditProposal[] = []

  const provider = createOpenAICompatible({
    name: 'mo-gallery',
    baseURL: options.endpoint.baseURL.replace(/\/+$/, ''),
    apiKey: options.endpoint.apiKey,
    headers: options.endpoint.headers,
  })

  const result = streamText({
    model: provider.chatModel(options.model),
    abortSignal: options.signal,
    stopWhen: stepCountIs(options.maxSteps ?? 8),
    system: AGENT_SYSTEM_PROMPT,
    prompt: [
      options.title ? `文档标题：${options.title}` : '',
      `任务：${options.instruction}`,
    ].filter(Boolean).join('\n\n'),
    tools: {
      read_document: tool({
        description: '读取当前文档的全文纯文本（段落以换行分隔）',
        inputSchema: z.object({}),
        execute: async () => ({ text: options.document.getText() }),
      }),
      propose_edit: tool({
        description: '提交一处修改提案。originalText 必须逐字复制文档中的连续原文片段；newText 为替换后的文本，留空表示删除。',
        inputSchema: z.object({
          originalText: z.string().min(1).describe('文档中被替换的原文片段，逐字复制'),
          newText: z.string().describe('替换后的新文本，空字符串表示删除'),
          reason: z.string().optional().describe('一句话说明修改理由'),
        }),
        execute: async ({ originalText, newText, reason }) => {
          const text = options.document.getText()
          if (!text.includes(originalText)) {
            return { ok: false, error: '原文片段未在文档中找到，请逐字复制文档原文后重试' }
          }
          if (originalText === newText) {
            return { ok: false, error: '新文本与原文相同，无需提案' }
          }
          proposals.push({ originalText, newText, reason })
          return { ok: true, index: proposals.length }
        },
      }),
    },
  })

  for await (const delta of result.textStream) {
    if (delta) options.onProgress?.(delta)
  }

  return {
    summary: (await result.text).trim(),
    proposals,
  }
}
