import { isStepCount, tool, ToolLoopAgent } from 'ai'
import type { LanguageModel } from 'ai'
import { z } from 'zod'

import type {
  EditorAgentEvent,
  EditorAgentRuntime,
  EditorAgentRuntimeRunOptions,
  EditorAgentTask,
} from '../../domain/agent'
import { toJsonValue } from '../../domain/json'
import type { JsonValue } from '../../domain/json'
import type { EditorProposal } from '../../domain/proposals'
import type { EditorAiEndpoint } from '../../types'
import { createAbortError, normalizeAiError } from './errors'
import { createVercelAiLanguageModel } from './provider'

const AGENT_INSTRUCTIONS = [
  '你是一名中文摄影叙事文档编辑 agent，通过工具协作分析和修改用户的故事文档。',
  '工作流程：先用 read_document 通读全文，再针对任务用 propose_edit 逐条提交修改提案。',
  'propose_edit 的 originalText 必须逐字复制文档中的连续原文片段（包括标点和空格），否则工具会拒绝。',
  '每个提案只覆盖一处修改，保持片段尽量短小、聚焦；不要把整篇文档作为一个提案。',
  '所有提案提交完后，用一小段中文总结你做了什么以及为什么。不要在总结里重复修改内容本身。',
].join('\n')

const proposeEditInputSchema = z.object({
  originalText: z.string().min(1).describe('文档中被替换的原文片段，必须逐字复制'),
  newText: z.string().describe('替换后的新文本，空字符串表示删除'),
  reason: z.string().optional().describe('一句话说明修改理由'),
  confidence: z.number().min(0).max(1).optional().describe('对修改合理性的置信度，0 到 1'),
}).strict()

type ProposalToolErrorCode =
  | 'text_not_found'
  | 'text_not_unique'
  | 'unchanged'
  | 'overlapping_edit'

interface ProposalToolFailure {
  ok: false
  error: {
    code: ProposalToolErrorCode
    message: string
  }
}

interface ProposalToolSuccess {
  ok: true
  proposal: EditorProposal
}

type ProposalToolOutput = ProposalToolFailure | ProposalToolSuccess

interface TextRange {
  from: number
  to: number
}

export interface VercelAiEditorAgentRuntimeOptions {
  endpoint: EditorAiEndpoint
  model: string
  temperature?: number
  maxSteps?: number
  /** 仅供包内测试和自定义运行环境注入，不从公共入口导出。 */
  languageModel?: LanguageModel
}

function failProposal(code: ProposalToolErrorCode, message: string): ProposalToolFailure {
  return { ok: false, error: { code, message } }
}

function rangesOverlap(left: TextRange, right: TextRange): boolean {
  return left.from < right.to && right.from < left.to
}

function isProposalToolSuccess(value: unknown): value is ProposalToolSuccess {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return record.ok === true && Boolean(record.proposal)
}

function createTaskPrompt(task: EditorAgentTask): string {
  return [
    task.document.title ? `文档标题：${task.document.title}` : '',
    `任务：${task.instruction}`,
    `文档版本：${task.document.revision}`,
  ].filter(Boolean).join('\n\n')
}

function createTools(task: EditorAgentTask) {
  const acceptedRanges: TextRange[] = []
  let proposalCount = 0

  return {
    read_document: tool({
      description: '读取任务开始时的不可变文档快照，包括标题、全文和版本。',
      inputSchema: z.object({}).strict(),
      execute: async () => ({
        ok: true as const,
        document: task.document,
      }),
    }),
    propose_edit: tool({
      description: [
        '提交一处可由用户审阅的文本修改提案。',
        'originalText 必须逐字复制文档中的连续原文片段并且只能出现一次；',
        'newText 为替换后的文本，留空表示删除。',
      ].join(''),
      inputSchema: proposeEditInputSchema,
      execute: async ({ originalText, newText, reason, confidence }): Promise<ProposalToolOutput> => {
        const firstIndex = task.document.text.indexOf(originalText)
        if (firstIndex === -1) {
          return failProposal(
            'text_not_found',
            '原文片段未在文档中找到，请逐字复制文档原文后重试。',
          )
        }
        if (task.document.text.indexOf(originalText, firstIndex + 1) !== -1) {
          return failProposal(
            'text_not_unique',
            '原文片段在文档中出现多次，请扩大引用范围直到可以唯一定位。',
          )
        }
        if (originalText === newText) {
          return failProposal('unchanged', '新文本与原文相同，无需创建提案。')
        }

        const range = { from: firstIndex, to: firstIndex + originalText.length }
        if (acceptedRanges.some((accepted) => rangesOverlap(accepted, range))) {
          return failProposal(
            'overlapping_edit',
            '该修改与本次任务中已有提案重叠，请合并修改或选择不重叠的原文片段。',
          )
        }

        acceptedRanges.push(range)
        proposalCount += 1
        const proposal: EditorProposal = {
          id: `${task.id}:proposal:${proposalCount}`,
          taskId: task.id,
          kind: 'content_edit',
          baseRevision: task.document.revision,
          ...(reason?.trim() ? { reason: reason.trim() } : {}),
          risk: 'low',
          ...(confidence === undefined ? {} : { confidence }),
          operations: [{
            type: 'replace_text',
            match: {
              kind: 'exact_text',
              text: originalText,
              occurrence: 'unique',
            },
            replacement: newText,
          }],
        }

        return { ok: true, proposal }
      },
    }),
  }
}

export class VercelAiEditorAgentRuntime implements EditorAgentRuntime {
  private readonly options: VercelAiEditorAgentRuntimeOptions

  constructor(options: VercelAiEditorAgentRuntimeOptions) {
    this.options = options
  }

  async *run(
    task: EditorAgentTask,
    options: EditorAgentRuntimeRunOptions = {},
  ): AsyncIterable<EditorAgentEvent> {
    yield { type: 'status_changed', status: 'starting' }

    try {
      if (options.signal?.aborted) throw createAbortError(options.signal.reason)

      const tools = createTools(task)
      const agent = new ToolLoopAgent({
        model: this.options.languageModel
          ?? createVercelAiLanguageModel(this.options.endpoint, this.options.model),
        instructions: AGENT_INSTRUCTIONS,
        tools,
        temperature: this.options.temperature ?? 0.3,
        stopWhen: isStepCount(Math.max(1, Math.floor(this.options.maxSteps ?? 8))),
      })

      yield { type: 'status_changed', status: 'running' }
      const result = await agent.stream({
        prompt: createTaskPrompt(task),
        abortSignal: options.signal,
      })

      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            if (part.text) yield { type: 'text_delta', text: part.text }
            break
          case 'tool-call':
            yield {
              type: 'tool_started',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: toJsonValue(part.input),
            }
            break
          case 'tool-result': {
            const output = toJsonValue(part.output)
            yield {
              type: 'tool_completed',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              output,
            }
            if (part.toolName === 'propose_edit' && isProposalToolSuccess(part.output)) {
              const proposal = part.output.proposal
              yield { type: 'proposal_created', proposal }
              yield {
                type: 'approval_required',
                request: {
                  id: `${proposal.id}:approval`,
                  taskId: task.id,
                  proposal,
                  message: 'Review and approve this proposed edit before applying it.',
                },
              }
            }
            break
          }
          case 'tool-error':
            yield {
              type: 'tool_completed',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              output: {
                ok: false,
                error: {
                  code: 'tool_error',
                  message: normalizeAiError(part.error).message,
                },
              } satisfies JsonValue,
            }
            break
          case 'abort':
            throw createAbortError(part.reason ?? options.signal?.reason)
          case 'error':
            throw normalizeAiError(part.error)
          default:
            break
        }
      }

      const steps = await result.steps
      const generatedSummary = steps.at(-1)?.text.trim() || ''
      const proposalCount = steps.reduce(
        (count, step) => count + step.toolResults.filter((toolResult) => (
          toolResult.toolName === 'propose_edit'
          && isProposalToolSuccess(toolResult.output)
        )).length,
        0,
      )
      const summary = generatedSummary || (proposalCount > 0
        ? '已生成修改提案，请在预览中逐条确认。'
        : 'Agent 已结束，未生成可应用的修改提案。')

      yield { type: 'completed', summary }
      yield { type: 'status_changed', status: 'completed' }
    } catch (error) {
      if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        yield { type: 'status_changed', status: 'cancelled' }
        throw createAbortError(options.signal?.reason ?? error)
      }

      const normalized = normalizeAiError(error)
      yield { type: 'error', message: normalized.message }
      yield { type: 'status_changed', status: 'failed' }
      throw normalized
    }
  }
}
