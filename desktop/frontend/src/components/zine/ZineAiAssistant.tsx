import { useEffect, useRef, useState } from 'react'
import { Bot, Loader2, Send, Square, X } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  createEditorAgentTaskId,
  editorAiMessageMetadataSchema,
  readEditorAiTaskMessageMetadata,
  runDirectEditAgent,
  type DirectEditAgentEvent,
  type RunDirectEditAgentOptions,
  type ZineDocumentSnapshot,
} from '@mo-gallery/ai-agent'

import {
  appendLocalEditorAiMessage,
  editorAiLocal,
  finishLocalEditorAiMessage,
  getLocalEditorAiConversation,
  getLocalEndpoint,
  getLocalStoryAiModels,
  updateLocalEditorAiTaskState,
} from '@/lib/api/editor-ai-local'
import type {
  EditorAiMessageDto,
  StoryAiModelOption,
} from '@/lib/api/types'
import { t } from '@/lib/i18n'
import {
  createZineDirectEditHost,
  type ZineDirectEditHost,
} from '@/lib/zine/zine-direct-edit-host'
import { usePreferences } from '@/store/preferences'
import { useZineStore } from '@/store/zine'

import { ZineAiChangeSetCard } from './ZineAiChangeSetCard'

interface ZineAiAssistantProps {
  onClose: () => void
}

const conversationIdPromiseByScope = new Map<string, Promise<string>>()

function ensureConversationId(
  scopeId: string,
  title: string,
): Promise<string> {
  const existing = conversationIdPromiseByScope.get(scopeId)
  if (existing) return existing

  const promise = (async () => {
    const conversations = await editorAiLocal.getEditorAiConversations('', scopeId)
    const conversation = conversations[0] ?? await editorAiLocal.createEditorAiConversation('', {
      scopeId,
      title,
    })
    return conversation.id
  })().catch((error) => {
    conversationIdPromiseByScope.delete(scopeId)
    throw error
  })

  conversationIdPromiseByScope.set(scopeId, promise)
  return promise
}

function replaceMessage(messages: EditorAiMessageDto[], message: EditorAiMessageDto) {
  return messages.map((candidate) => candidate.id === message.id ? message : candidate)
}

function isChatModel(model: StoryAiModelOption) {
  return model.capabilities?.includes('chat') !== false
}

function supportsDirectEdit(model: StoryAiModelOption) {
  return model.tools && model.structuredOutput
}

function completedContent(result: Awaited<ReturnType<typeof runDirectEditAgent>>) {
  if (result.mode === 'suggestion_only') return result.suggestion
  return result.metadata.summary.join('\n')
}

function eventLabel(event: DirectEditAgentEvent<ZineDocumentSnapshot>) {
  return event.type.replaceAll('_', ' ')
}

function taskOptions(
  model: StoryAiModelOption,
  targetSpreadId: string,
  projectAssetIds: string[],
): Pick<RunDirectEditAgentOptions<'zine'>, 'modelCapabilities' | 'authorization' | 'taskType'> {
  return {
    modelCapabilities: {
      vision: model.vision,
      structuredOutput: model.structuredOutput,
      toolCalling: model.tools,
      maxInputTokens: model.contextWindow,
    },
    authorization: {
      allowDelete: false,
      deleteTargetIds: [],
      targetSpreadId,
      projectAssetIds,
    },
    taskType: 'instruction',
  }
}

export function ZineAiAssistant({ onClose }: ZineAiAssistantProps) {
  const { language } = usePreferences()
  const project = useZineStore((state) => state.project)
  const activeSpreadId = useZineStore((state) => state.activeSpreadId)
  const aiTaskId = useZineStore((state) => state.aiTaskId)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<EditorAiMessageDto[]>([])
  const [models, setModels] = useState<StoryAiModelOption[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [instruction, setInstruction] = useState('')
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [activity, setActivity] = useState('')
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const hostByTaskIdRef = useRef(new Map<string, ZineDirectEditHost>())
  const taskIdByMessageIdRef = useRef(new Map<string, string>())
  const projectId = project?.id
  const projectTitle = project?.title

  useEffect(() => {
    if (!projectId || !projectTitle) return
    let cancelled = false
    setLoading(true)
    setError('')

    const scopeId = `zine:${projectId}`
    void Promise.all([
      ensureConversationId(scopeId, projectTitle),
      getLocalStoryAiModels(),
    ]).then(async ([conversationId, response]) => {
      const conversation = await getLocalEditorAiConversation(conversationId)
      if (cancelled) return
      const availableModels = response.models
        .filter(isChatModel)
        .toSorted((left, right) => Number(supportsDirectEdit(right)) - Number(supportsDirectEdit(left)))
      const preferredModel = availableModels.some((model) => model.id === conversation.lastModel)
        ? conversation.lastModel ?? ''
        : availableModels.some((model) => model.id === response.defaultModel)
          ? response.defaultModel
          : availableModels[0]?.id ?? ''
      setConversationId(conversation.id)
      setMessages(conversation.messages)
      setModels(availableModels)
      setSelectedModel(preferredModel)
    }).catch((loadError: unknown) => {
      if (!cancelled) {
        setError(loadError instanceof Error ? loadError.message : t('admin.zine_ai_failed', language))
      }
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [language, projectId, projectTitle])

  useEffect(() => () => abortRef.current?.abort(), [])

  if (!project) return null

  const activeModel = models.find((model) => model.id === selectedModel)
  const canRun = Boolean(
    conversationId
    && activeSpreadId
    && activeModel
    && instruction.trim()
    && !running
    && !aiTaskId,
  )

  async function runEdit() {
    if (!conversationId || !activeSpreadId || !activeModel || !projectId) return
    const prompt = instruction.trim()
    if (!prompt) return

    const controller = new AbortController()
    const taskId = createEditorAgentTaskId()
    const host = createZineDirectEditHost(projectId, activeSpreadId)
    hostByTaskIdRef.current.set(taskId, host)
    abortRef.current = controller
    setInstruction('')
    setRunning(true)
    setActivity('preparing context')
    setError('')

    let assistantMessage: EditorAiMessageDto | null = null
    let executionCompleted = false
    try {
      const [endpoint, userMessage] = await Promise.all([
        getLocalEndpoint(),
        appendLocalEditorAiMessage(conversationId, {
          role: 'user',
          content: prompt,
          status: 'completed',
          model: activeModel.id,
          action: 'custom',
        }),
      ])
      assistantMessage = await appendLocalEditorAiMessage(conversationId, {
        role: 'assistant',
        content: '',
        status: 'streaming',
        model: activeModel.id,
        action: 'custom',
      })
      taskIdByMessageIdRef.current.set(assistantMessage.id, taskId)
      setMessages((current) => [...current, userMessage, assistantMessage as EditorAiMessageDto])

      const result = await runDirectEditAgent({
        endpoint,
        model: activeModel.id,
        instruction: prompt,
        host,
        taskId,
        signal: controller.signal,
        ...taskOptions(
          activeModel,
          activeSpreadId,
          project.assets.map((asset) => asset.id),
        ),
        onEvent: (event) => setActivity(eventLabel(event)),
      })
      const content = completedContent(result)
      const metadata = result.mode === 'direct_edit'
        ? editorAiMessageMetadataSchema.parse({
            type: 'editor_ai_task',
            task: result.metadata,
          })
        : undefined
      const localCompleted: EditorAiMessageDto = {
        ...assistantMessage,
        status: 'completed',
        content,
        model: activeModel.id,
        ...(metadata === undefined ? {} : { metadata }),
      }
      executionCompleted = true
      setMessages((current) => replaceMessage(current, localCompleted))
      const completed = await finishLocalEditorAiMessage(assistantMessage.id, {
        status: 'completed',
        content,
        model: activeModel.id,
        ...(metadata === undefined ? {} : { metadata }),
      })
      setMessages((current) => replaceMessage(current, completed))
    } catch (runError: unknown) {
      const stopped = runError instanceof Error && runError.name === 'AbortError'
      const message = runError instanceof Error
        ? runError.message
        : t('admin.zine_ai_failed', language)
      if (executionCompleted) {
        setError(message)
        return
      }
      if (assistantMessage) {
        const terminal = await finishLocalEditorAiMessage(assistantMessage.id, {
          status: stopped ? 'stopped' : 'failed',
          content: '',
          model: activeModel.id,
          error: message,
        }).catch(() => null)
        if (terminal) setMessages((current) => replaceMessage(current, terminal))
      }
      if (!stopped) setError(message)
    } finally {
      abortRef.current = null
      setRunning(false)
      setActivity('')
    }
  }

  async function changeTaskState(message: EditorAiMessageDto, state: 'undone' | 'redone') {
    const taskId = taskIdByMessageIdRef.current.get(message.id)
    const host = taskId ? hostByTaskIdRef.current.get(taskId) : undefined
    if (!taskId || !host) return
    const changed = state === 'undone' ? host.undoTask(taskId) : host.redoTask(taskId)
    if (!changed) return

    try {
      const updated = await updateLocalEditorAiTaskState(message.id, state)
      setMessages((current) => replaceMessage(current, updated))
    } catch (stateError: unknown) {
      setError(stateError instanceof Error ? stateError.message : t('admin.zine_ai_failed', language))
    }
  }

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l bg-card" style={{ borderColor: 'var(--border)' }}>
      <div className="flex min-h-14 items-center gap-3 border-b px-4" style={{ borderColor: 'var(--border)' }}>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Bot size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{t('admin.zine_ai_title', language)}</h2>
          <p className="truncate text-[11px] text-muted-foreground">{t('admin.zine_ai_subtitle', language)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
          aria-label={t('common.close', language)}
        >
          <X size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {loading ? (
          <div className="flex h-32 items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={15} className="animate-spin" />
            {t('admin.zine_ai_loading', language)}
          </div>
        ) : messages.length === 0 ? (
          <div className="rounded-xl border border-dashed p-4 text-xs leading-5 text-muted-foreground" style={{ borderColor: 'var(--border)' }}>
            {t('admin.zine_ai_empty', language)}
          </div>
        ) : (
          messages.map((message) => {
            const taskId = taskIdByMessageIdRef.current.get(message.id)
            const history = taskId ? hostByTaskIdRef.current.get(taskId)?.getTaskHistoryState(taskId) : null
            const taskMetadata = readEditorAiTaskMessageMetadata(message.metadata)
            const task = taskMetadata?.task.status === 'completed' ? taskMetadata.task : null
            return (
              <div
                key={message.id}
                className={message.role === 'user'
                  ? 'ml-7 cursor-text select-text rounded-xl bg-primary px-3 py-2 text-xs leading-5 text-primary-foreground selection:bg-primary-foreground/30 selection:text-primary-foreground'
                  : 'mr-3 cursor-text select-text rounded-xl border bg-background px-3 py-2 text-xs leading-5 text-foreground'}
                style={message.role === 'assistant' ? { borderColor: 'var(--border)' } : undefined}
              >
                {message.status === 'streaming' && !message.content ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 size={13} className="animate-spin" />
                    {activity || t('admin.zine_ai_running', language)}
                  </div>
                ) : message.role === 'assistant' && message.content ? (
                  <div className="ai-markdown min-w-0 break-words">
                    <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{message.content || message.error}</p>
                )}
                {task ? (
                  <ZineAiChangeSetCard
                    task={task}
                    history={history ?? null}
                    language={language}
                    onUndo={() => void changeTaskState(message, 'undone')}
                    onRedo={() => void changeTaskState(message, 'redone')}
                  />
                ) : null}
              </div>
            )
          })
        )}
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}
      </div>

      <div className="space-y-2 border-t p-3" style={{ borderColor: 'var(--border)' }}>
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{t('admin.zine_ai_model', language)}</span>
          <select
            value={selectedModel}
            onChange={(event) => setSelectedModel(event.target.value)}
            disabled={running || models.length === 0}
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
            style={{ borderColor: 'var(--border)' }}
          >
            {models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
          </select>
        </label>
        {models.length === 0 && !loading ? (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">{t('admin.zine_ai_unavailable', language)}</p>
        ) : null}
        {aiTaskId ? (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">{t('admin.zine_ai_locked', language)}</p>
        ) : null}
        <textarea
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              if (canRun) void runEdit()
            }
          }}
          disabled={running}
          rows={3}
          placeholder={t('admin.zine_ai_placeholder', language)}
          className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-xs leading-5 text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring disabled:opacity-60"
          style={{ borderColor: 'var(--border)' }}
        />
        {running ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border text-xs font-medium text-foreground transition hover:bg-accent"
            style={{ borderColor: 'var(--border)' }}
          >
            <Square size={12} />
            {t('admin.zine_ai_stop', language)}
          </button>
        ) : (
          <button
            type="button"
            disabled={!canRun}
            onClick={() => void runEdit()}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
          >
            <Send size={13} />
            {t('admin.zine_ai_run', language)}
          </button>
        )}
      </div>
    </aside>
  )
}
