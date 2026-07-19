import { useEffect, useRef, useState } from 'react'
import {
  Bot,
  Check,
  ChevronDown,
  History,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Send,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  createEditorAgentTaskId,
  EditorAiExecutionError,
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
  updateLocalEditorAiConversation,
  updateLocalEditorAiTaskState,
} from '@/lib/api/editor-ai-local'
import type {
  EditorAiConversationDto,
  EditorAiMessageDto,
  StoryAiModelOption,
} from '@/lib/api/types'
import { t } from '@/lib/i18n'
import {
  createZineDirectEditHost,
  type ZineDirectEditHost,
} from '@/lib/zine/zine-direct-edit-host'
import { hasExplicitZineEditIntent } from '@/lib/zine/zine-ai-intent'
import { usePreferences } from '@/store/preferences'
import { useZineStore } from '@/store/zine'

import { ZineAiChangeSetCard } from './ZineAiChangeSetCard'

interface ZineAiAssistantProps {
  onClose: () => void
}

function replaceMessage(messages: EditorAiMessageDto[], message: EditorAiMessageDto) {
  return messages.map((candidate) => candidate.id === message.id ? message : candidate)
}

const CONVERSATION_DATE_FORMATTERS = {
  zh: new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }),
  en: new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }),
}

function formatConversationDate(value: string, language: 'zh' | 'en') {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return CONVERSATION_DATE_FORMATTERS[language].format(date)
}

function deriveConversationTitle(instruction: string) {
  return instruction.replace(/\s+/g, ' ').trim().slice(0, 36)
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
  directEdit: boolean,
): Pick<RunDirectEditAgentOptions<'zine'>, 'modelCapabilities' | 'authorization' | 'taskType'> {
  return {
    modelCapabilities: {
      vision: model.vision,
      structuredOutput: directEdit && model.structuredOutput,
      toolCalling: directEdit && model.tools,
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

function executionErrorMessage(error: unknown): string | null {
  if (!(error instanceof EditorAiExecutionError)) return null
  const issues = error.issues?.filter((issue) => issue.severity === 'error') ?? []
  if (issues.length === 0) return error.message
  return `${error.message}: ${issues.map((issue) => `${issue.code} - ${issue.message}`).join('; ')}`
}

export function ZineAiAssistant({ onClose }: ZineAiAssistantProps) {
  const { language } = usePreferences()
  const project = useZineStore((state) => state.project)
  const activeSpreadId = useZineStore((state) => state.activeSpreadId)
  const aiTaskId = useZineStore((state) => state.aiTaskId)
  const [conversations, setConversations] = useState<EditorAiConversationDto[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<EditorAiMessageDto[]>([])
  const [models, setModels] = useState<StoryAiModelOption[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [instruction, setInstruction] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingConversation, setLoadingConversation] = useState(false)
  const [creatingConversation, setCreatingConversation] = useState(false)
  const [running, setRunning] = useState(false)
  const [activity, setActivity] = useState('')
  const [error, setError] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [conversationSearch, setConversationSearch] = useState('')
  const [renamingConversationId, setRenamingConversationId] = useState<string | null>(null)
  const [conversationTitleDraft, setConversationTitleDraft] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const [showContextDetails, setShowContextDetails] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const conversationLoadIdRef = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const modelMenuRef = useRef<HTMLDivElement>(null)
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
      editorAiLocal.getEditorAiConversations('', scopeId),
      getLocalStoryAiModels(),
    ]).then(async ([storedConversations, response]) => {
      const activeConversation = storedConversations[0] ?? await editorAiLocal.createEditorAiConversation('', {
        scopeId,
        title: t('admin.ai_new_chat', language),
      })
      const availableConversations = storedConversations.length > 0
        ? storedConversations
        : [activeConversation]
      const conversation = await getLocalEditorAiConversation(activeConversation.id)
      if (cancelled) return
      const availableModels = response.models
        .filter(isChatModel)
        .toSorted((left, right) => Number(supportsDirectEdit(right)) - Number(supportsDirectEdit(left)))
      const preferredModel = availableModels.some((model) => model.id === conversation.lastModel)
        ? conversation.lastModel ?? ''
        : availableModels.some((model) => model.id === response.defaultModel)
          ? response.defaultModel
          : availableModels[0]?.id ?? ''
      setConversations(availableConversations)
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!showModelMenu) return
    const closeModelMenu = (event: PointerEvent) => {
      if (!modelMenuRef.current?.contains(event.target as Node)) {
        setShowModelMenu(false)
      }
    }
    window.addEventListener('pointerdown', closeModelMenu)
    return () => window.removeEventListener('pointerdown', closeModelMenu)
  }, [showModelMenu])

  if (!project) return null

  const activeModel = models.find((model) => model.id === selectedModel)
  const normalizedModelSearch = modelSearch.trim().toLocaleLowerCase()
  const filteredModels = normalizedModelSearch
    ? models.filter((model) => (
        `${model.label} ${model.id}`.toLocaleLowerCase().includes(normalizedModelSearch)
      ))
    : models
  const activeConversation = conversations.find((conversation) => conversation.id === conversationId)
  const normalizedSearch = conversationSearch.trim().toLocaleLowerCase()
  const filteredConversations = normalizedSearch
    ? conversations.filter((conversation) => (
        (conversation.title || t('admin.ai_new_chat', language))
          .toLocaleLowerCase()
          .includes(normalizedSearch)
      ))
    : conversations
  const canRun = Boolean(
    conversationId
    && activeSpreadId
    && activeModel
    && instruction.trim()
    && !running
    && !aiTaskId,
  )

  async function selectConversation(id: string) {
    if (id === conversationId || running || loadingConversation) {
      if (id === conversationId) setShowHistory(false)
      return
    }

    const loadId = ++conversationLoadIdRef.current
    setConversationId(id)
    setMessages([])
    setInstruction('')
    setLoadingConversation(true)
    setPendingDeleteId(null)
    setRenamingConversationId(null)
    setError('')
    setShowHistory(false)
    try {
      const conversation = await getLocalEditorAiConversation(id)
      if (conversationLoadIdRef.current !== loadId) return
      setMessages(conversation.messages)
      if (models.some((model) => model.id === conversation.lastModel)) {
        setSelectedModel(conversation.lastModel ?? selectedModel)
      }
    } catch (loadError: unknown) {
      if (conversationLoadIdRef.current === loadId) {
        setError(loadError instanceof Error ? loadError.message : t('admin.zine_ai_failed', language))
      }
    } finally {
      if (conversationLoadIdRef.current === loadId) setLoadingConversation(false)
    }
  }

  async function createConversation() {
    if (!projectId || running || creatingConversation) return
    setCreatingConversation(true)
    setError('')
    try {
      const conversation = await editorAiLocal.createEditorAiConversation('', {
        scopeId: `zine:${projectId}`,
        title: t('admin.ai_new_chat', language),
      })
      setConversations((current) => [conversation, ...current])
      setConversationId(conversation.id)
      setMessages([])
      setInstruction('')
      setConversationSearch('')
      setPendingDeleteId(null)
      setRenamingConversationId(null)
      setShowHistory(false)
    } catch (createError: unknown) {
      setError(createError instanceof Error ? createError.message : t('admin.zine_ai_failed', language))
    } finally {
      setCreatingConversation(false)
    }
  }

  function beginRename(conversation: EditorAiConversationDto) {
    setPendingDeleteId(null)
    setConversationTitleDraft(conversation.title || t('admin.ai_new_chat', language))
    setRenamingConversationId(conversation.id)
  }

  async function commitRename(id: string) {
    if (renamingConversationId !== id) return
    const currentConversation = conversations.find((conversation) => conversation.id === id)
    const title = conversationTitleDraft.replace(/\s+/g, ' ').trim()
    setRenamingConversationId(null)
    if (!currentConversation || !title || title === currentConversation.title) return

    setConversations((current) => current.map((conversation) => (
      conversation.id === id ? { ...conversation, title } : conversation
    )))
    try {
      const updated = await updateLocalEditorAiConversation(id, { title })
      setConversations((current) => current.map((conversation) => (
        conversation.id === id ? updated : conversation
      )))
    } catch (renameError: unknown) {
      setConversations((current) => current.map((conversation) => (
        conversation.id === id ? currentConversation : conversation
      )))
      setError(renameError instanceof Error ? renameError.message : t('admin.ai_rename_failed', language))
    }
  }

  async function deleteConversation(id: string) {
    if (running) return
    if (pendingDeleteId !== id) {
      setPendingDeleteId(id)
      return
    }

    setPendingDeleteId(null)
    try {
      await editorAiLocal.deleteEditorAiConversation('', id)
      const remaining = conversations.filter((conversation) => conversation.id !== id)
      setConversations(remaining)
      if (conversationId !== id) return
      if (remaining[0]) {
        const fallback = await getLocalEditorAiConversation(remaining[0].id)
        setConversationId(fallback.id)
        setMessages(fallback.messages)
        if (models.some((model) => model.id === fallback.lastModel)) {
          setSelectedModel(fallback.lastModel ?? selectedModel)
        }
      } else {
        if (!projectId) return
        const replacement = await editorAiLocal.createEditorAiConversation('', {
          scopeId: `zine:${projectId}`,
          title: t('admin.ai_new_chat', language),
        })
        setConversations([replacement])
        setConversationId(replacement.id)
        setMessages([])
      }
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : t('admin.zine_ai_failed', language))
    }
  }

  async function runEdit() {
    if (!conversationId || !activeSpreadId || !activeModel || !projectId) return
    const prompt = instruction.trim()
    if (!prompt) return
    const directEdit = hasExplicitZineEditIntent(prompt)

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
      const generatedTitle = messages.length === 0
        && (!activeConversation?.title || activeConversation.title === t('admin.ai_new_chat', language))
        ? deriveConversationTitle(prompt)
        : null
      setConversations((current) => {
        const updated = current.find((conversation) => conversation.id === conversationId)
        if (!updated) return current
        return [
          {
            ...updated,
            ...(generatedTitle ? { title: generatedTitle } : {}),
            updatedAt: new Date().toISOString(),
          },
          ...current.filter((conversation) => conversation.id !== conversationId),
        ]
      })
      if (generatedTitle) {
        void updateLocalEditorAiConversation(conversationId, { title: generatedTitle }).catch(() => {})
      }

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
          directEdit,
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
      const message = executionErrorMessage(runError) ?? (runError instanceof Error
        ? runError.message
        : t('admin.zine_ai_failed', language))
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
      <div className="flex min-h-14 items-center gap-2 border-b px-3" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          onClick={() => setShowHistory((current) => !current)}
          disabled={running}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left transition hover:bg-accent disabled:cursor-default disabled:opacity-60"
          aria-expanded={showHistory}
          aria-label={t('admin.zine_ai_history', language)}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Bot size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-semibold">
                {activeConversation?.title || t('admin.ai_new_chat', language)}
              </span>
              <ChevronDown size={12} className={`shrink-0 text-muted-foreground transition-transform ${showHistory ? 'rotate-180' : ''}`} />
            </div>
            <p className="truncate text-[10px] text-muted-foreground">{t('admin.zine_ai_subtitle', language)}</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => void createConversation()}
          disabled={running || creatingConversation}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-40"
          aria-label={t('admin.zine_ai_new_conversation', language)}
          title={t('admin.zine_ai_new_conversation', language)}
        >
          {creatingConversation ? <Loader2 size={15} className="animate-spin" /> : <Plus size={16} />}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
          aria-label={t('common.close', language)}
        >
          <X size={16} />
        </button>
      </div>

      {showHistory ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-3 border-b p-3" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold">{t('admin.zine_ai_history', language)}</h3>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {t('admin.zine_ai_conversation_count', language).replace('{count}', String(conversations.length))}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void createConversation()}
                disabled={creatingConversation}
                className="flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium text-foreground transition hover:bg-accent disabled:opacity-40"
                style={{ borderColor: 'var(--border)' }}
              >
                {creatingConversation ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                {t('admin.ai_new_chat', language)}
              </button>
            </div>
            <label className="relative block">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={conversationSearch}
                onChange={(event) => setConversationSearch(event.target.value)}
                placeholder={t('admin.zine_ai_search_conversations', language)}
                className="h-8 w-full rounded-md border bg-background pl-8 pr-8 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
                style={{ borderColor: 'var(--border)' }}
              />
              {conversationSearch ? (
                <button
                  type="button"
                  onClick={() => setConversationSearch('')}
                  className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label={t('admin.zine_ai_clear_search', language)}
                >
                  <X size={12} />
                </button>
              ) : null}
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {filteredConversations.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center px-6 text-center text-muted-foreground">
                <MessageSquare size={24} className="mb-2 opacity-30" />
                <p className="text-xs">{t('admin.zine_ai_no_matching_conversations', language)}</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {filteredConversations.map((conversation) => {
                  const isActive = conversation.id === conversationId
                  const isRenaming = renamingConversationId === conversation.id
                  const isDeletePending = pendingDeleteId === conversation.id
                  return (
                    <div
                      key={conversation.id}
                      className={`group flex items-center gap-2 rounded-md px-2 py-2 transition ${isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}`}
                    >
                      <div
                        role="button"
                        tabIndex={isRenaming || loadingConversation ? -1 : 0}
                        onClick={() => {
                          if (!isRenaming && !loadingConversation) void selectConversation(conversation.id)
                        }}
                        onKeyDown={(event) => {
                          if (!isRenaming && !loadingConversation && (event.key === 'Enter' || event.key === ' ')) {
                            event.preventDefault()
                            void selectConversation(conversation.id)
                          }
                        }}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${isActive ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-background/50'}`}>
                          {isActive ? <Check size={13} /> : <MessageSquare size={13} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          {isRenaming ? (
                            <input
                              autoFocus
                              value={conversationTitleDraft}
                              onChange={(event) => setConversationTitleDraft(event.target.value)}
                              onClick={(event) => event.stopPropagation()}
                              onBlur={() => void commitRename(conversation.id)}
                              onKeyDown={(event) => {
                                event.stopPropagation()
                                if (event.key === 'Enter') event.currentTarget.blur()
                                if (event.key === 'Escape') setRenamingConversationId(null)
                              }}
                              maxLength={200}
                              className="h-6 w-full rounded border bg-background px-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
                              style={{ borderColor: 'var(--border)' }}
                            />
                          ) : (
                            <span className="block truncate text-xs font-medium">
                              {conversation.title || t('admin.ai_new_chat', language)}
                            </span>
                          )}
                          <span className="mt-0.5 block truncate text-[10px] opacity-60">
                            {formatConversationDate(conversation.updatedAt, language)}
                          </span>
                        </span>
                      </div>
                      {!isRenaming ? (
                        <div className={`flex shrink-0 items-center ${isDeletePending ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}>
                          <button
                            type="button"
                            onClick={() => beginRename(conversation)}
                            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
                            aria-label={t('admin.ai_rename_conversation', language)}
                            title={t('admin.ai_rename_conversation', language)}
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteConversation(conversation.id)}
                            className={`flex h-7 w-7 items-center justify-center rounded hover:bg-destructive/10 ${isDeletePending ? 'text-destructive' : 'text-muted-foreground hover:text-destructive'}`}
                            aria-label={isDeletePending ? t('admin.ai_delete_confirm_again', language) : t('common.delete', language)}
                            title={isDeletePending ? t('admin.ai_delete_confirm_again', language) : t('common.delete', language)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          {error ? (
            <div className="mx-3 mb-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-[11px] text-destructive">
              {error}
            </div>
          ) : null}
          <div className="flex items-center gap-2 border-t px-3 py-2 text-[10px] text-muted-foreground" style={{ borderColor: 'var(--border)' }}>
            <History size={12} />
            <span>{t('admin.zine_ai_history_hint', language)}</span>
          </div>
        </div>
      ) : (
      <>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {loading ? (
          <div className="flex h-32 items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={15} className="animate-spin" />
            {t('admin.zine_ai_loading', language)}
          </div>
        ) : loadingConversation ? (
          <div className="flex h-32 items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={15} className="animate-spin" />
            {t('admin.zine_ai_loading_conversation', language)}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center" style={{ borderColor: 'var(--border)' }}>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Bot size={19} />
            </div>
            <h3 className="text-xs font-semibold text-foreground">{t('admin.zine_ai_empty_title', language)}</h3>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{t('admin.zine_ai_empty', language)}</p>
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
        <div ref={messagesEndRef} />
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}
      </div>

      <div className="border-t p-3" style={{ borderColor: 'var(--border)' }}>
        {models.length === 0 && !loading ? (
          <p className="mb-2 text-[11px] text-amber-600 dark:text-amber-400">{t('admin.zine_ai_unavailable', language)}</p>
        ) : null}
        {aiTaskId ? (
          <p className="mb-2 text-[11px] text-amber-600 dark:text-amber-400">{t('admin.zine_ai_locked', language)}</p>
        ) : null}

        <div className="rounded-2xl border bg-background shadow-[0_10px_32px_rgba(0,0,0,0.08)] transition-shadow focus-within:shadow-[0_12px_36px_rgba(0,0,0,0.13)]" style={{ borderColor: 'var(--border)' }}>
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
            rows={4}
            placeholder={t('admin.zine_ai_composer_placeholder', language)}
            className="min-h-24 w-full resize-none bg-transparent px-4 pb-2 pt-3.5 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground/70 disabled:opacity-60"
          />

          {showContextDetails ? (
            <div className="mx-3 mb-2 rounded-lg border bg-muted/30 px-3 py-2 text-[10px] leading-4 text-muted-foreground" style={{ borderColor: 'var(--border)' }}>
              <p className="font-medium text-foreground">{t('admin.zine_ai_current_context', language)}</p>
              <p>{t('admin.zine_ai_context_spread', language)}</p>
              <p>{activeModel?.vision ? t('admin.zine_ai_vision_ready', language) : t('admin.zine_ai_vision_disabled', language)}</p>
            </div>
          ) : null}

          <div className="flex min-h-11 items-center gap-1.5 px-2.5 pb-2.5">
            <button
              type="button"
              onClick={() => setShowContextDetails((current) => !current)}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${showContextDetails ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
              aria-label={t('admin.zine_ai_toggle_context', language)}
              title={t('admin.zine_ai_toggle_context', language)}
            >
              <Plus size={17} className={`transition-transform ${showContextDetails ? 'rotate-45' : ''}`} />
            </button>

            <div ref={modelMenuRef} className="relative min-w-0 flex-1">
              {showModelMenu ? (
                <div className="absolute bottom-full left-0 z-50 mb-2 w-[280px] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-2 border-b px-3" style={{ borderColor: 'var(--border)' }}>
                    <Search size={14} className="shrink-0 text-muted-foreground" />
                    <input
                      autoFocus
                      value={modelSearch}
                      onChange={(event) => setModelSearch(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setShowModelMenu(false)
                      }}
                      placeholder={t('admin.zine_ai_search_models', language)}
                      className="h-10 min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    {modelSearch ? (
                      <button
                        type="button"
                        onClick={() => setModelSearch('')}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label={t('admin.zine_ai_clear_search', language)}
                      >
                        <X size={13} />
                      </button>
                    ) : null}
                  </div>
                  <div className="max-h-60 overflow-y-auto p-1.5">
                    {filteredModels.length > 0 ? filteredModels.map((model) => {
                      const selected = model.id === selectedModel
                      return (
                        <button
                          key={model.id}
                          type="button"
                          onClick={() => {
                            setSelectedModel(model.id)
                            setShowModelMenu(false)
                            setModelSearch('')
                          }}
                          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/70'}`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{model.label}</span>
                            <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{model.id}</span>
                          </span>
                          {supportsDirectEdit(model) ? (
                            <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">Agent</span>
                          ) : null}
                          {selected ? <Check size={14} className="shrink-0" /> : null}
                        </button>
                      )
                    }) : (
                      <p className="px-3 py-5 text-center text-xs text-muted-foreground">{t('admin.zine_ai_no_matching_models', language)}</p>
                    )}
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  if (!running && models.length > 0) setShowModelMenu((current) => !current)
                }}
                disabled={running || models.length === 0}
                className="flex h-8 max-w-full items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-50"
                aria-expanded={showModelMenu}
                aria-label={t('admin.zine_ai_model', language)}
              >
                <span className="truncate">{activeModel?.label || t('admin.zine_ai_model', language)}</span>
                {activeModel && !supportsDirectEdit(activeModel) ? (
                  <span className="shrink-0 text-[9px] font-normal opacity-70">{t('admin.zine_ai_suggestion_only', language)}</span>
                ) : null}
                <ChevronDown size={13} className={`shrink-0 transition-transform ${showModelMenu ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {running ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background shadow-sm transition hover:opacity-85"
                aria-label={t('admin.zine_ai_stop', language)}
                title={t('admin.zine_ai_stop', language)}
              >
                <Square size={13} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                disabled={!canRun}
                onClick={() => void runEdit()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background shadow-sm transition hover:opacity-85 disabled:pointer-events-none disabled:opacity-25"
                aria-label={t('admin.zine_ai_run', language)}
                title={t('admin.zine_ai_run', language)}
              >
                <Send size={15} />
              </button>
            )}
          </div>
        </div>
        <p className="mt-1.5 px-1 text-center text-[9px] text-muted-foreground/70">{t('admin.zine_ai_composer_hint', language)}</p>
      </div>
      </>
      )}
    </aside>
  )
}
