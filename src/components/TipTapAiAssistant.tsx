'use client'

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Loader2, Plus, RotateCcw, Sparkles, Trash2, Wand2, X } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'
import {
  createEditorAiConversation,
  deleteEditorAiConversation,
  getEditorAiConversation,
  getEditorAiConversations,
  getStoryAiModels,
  polishStoryAiPrompt,
  streamStoryAiGenerate,
  type EditorAiConversationDto,
  type EditorAiMessageDto,
  type StoryAiAction,
  type StoryAiModelOption,
} from '@/lib/api'

export interface TipTapAiAssistantOptions {
  enabled: boolean
  token?: string | null
  scopeId?: string
  title?: string
}

export interface TipTapAiAssistantContext {
  selectionRange: { from: number; to: number } | null
  hasSelection: boolean
  selectedText: string
  currentParagraph: string
  contextBefore: string
  contextAfter: string
}

export type TipTapAiApplyMode = 'replace' | 'insert' | 'append'

interface TipTapAiAssistantProps {
  options?: TipTapAiAssistantOptions
  context: TipTapAiAssistantContext
  onApplyResult: (
    mode: TipTapAiApplyMode,
    preview: string,
    selectionRange: TipTapAiAssistantContext['selectionRange'],
  ) => void
  onSyncContext?: () => void
}

type AssistantMessageStatus = 'streaming' | 'done' | 'error'

interface AiSessionMessage {
  id: string
  role: 'user' | 'assistant'
  action: StoryAiAction
  prompt: string
  content: string
  hasSelection: boolean
  selectionPreview: string
  paragraphPreview: string
  selectionRange: TipTapAiAssistantContext['selectionRange']
  status?: AssistantMessageStatus
  error?: string
  appliedModes?: TipTapAiApplyMode[]
}

const VALID_STORY_AI_ACTIONS: StoryAiAction[] = ['rewrite', 'expand', 'shorten', 'continue', 'summarize', 'custom']

const AI_SELECTION_PREVIEW_LIMIT = 28
const AI_PARAGRAPH_PREVIEW_LIMIT = 72
const AI_MODELS_STORAGE_KEY = 'tiptap-editor-ai-models'
const AI_SELECTED_MODEL_STORAGE_KEY = 'tiptap-editor-ai-selected-model'
const DESKTOP_MEDIA_QUERY = '(min-width: 768px)'
const AI_FLOATING_BUTTON_INSET = 20

const AI_PRESET_ACTIONS: Array<{ action: StoryAiAction; key: string }> = [
  { action: 'rewrite', key: 'rewrite' },
  { action: 'expand', key: 'expand' },
  { action: 'shorten', key: 'shorten' },
  { action: 'continue', key: 'continue' },
  { action: 'summarize', key: 'summarize' },
]

function compactTextPreview(input: string, limit: number) {
  const normalized = input.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return normalized
  const headLength = Math.ceil((limit - 3) / 2)
  const tailLength = Math.floor((limit - 3) / 2)
  return `${normalized.slice(0, headLength)}...${normalized.slice(normalized.length - tailLength)}`
}

function buildMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function resolveActionLabel(action: StoryAiAction, t: (key: string) => string) {
  if (action === 'custom') return t('editor.ai_action_custom')
  const preset = AI_PRESET_ACTIONS.find((item) => item.action === action)
  return preset ? t(`editor.ai_action_${preset.key}`) : action
}

function getViewportMetrics() {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0, offsetLeft: 0, offsetTop: 0 }
  }

  const viewport = window.visualViewport
  if (!viewport) {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      offsetLeft: 0,
      offsetTop: 0,
    }
  }

  return {
    width: viewport.width,
    height: viewport.height,
    offsetLeft: viewport.offsetLeft,
    offsetTop: viewport.offsetTop,
  }
}

function getZoomSignature() {
  if (typeof window === 'undefined') return '0:1'
  return `${window.devicePixelRatio}:${window.visualViewport?.scale ?? 1}`
}

function isStoryAiAction(value: unknown): value is StoryAiAction {
  return typeof value === 'string' && VALID_STORY_AI_ACTIONS.includes(value as StoryAiAction)
}

function toSessionMessage(
  message: EditorAiMessageDto,
  t: (key: string) => string,
): AiSessionMessage | null {
  if (message.role !== 'user' && message.role !== 'assistant') return null

  const metadata = message.metadata && typeof message.metadata === 'object'
    ? message.metadata as Record<string, unknown>
    : {}
  const action = isStoryAiAction(message.action) ? message.action : 'custom'
  const selectedText = typeof metadata.selectedText === 'string' ? metadata.selectedText : ''
  const currentParagraph = typeof metadata.currentParagraph === 'string' ? metadata.currentParagraph : ''
  const prompt = typeof metadata.prompt === 'string'
    ? metadata.prompt
    : (message.role === 'user' ? message.content : '')
  const selectionPreview = selectedText ? compactTextPreview(selectedText, AI_SELECTION_PREVIEW_LIMIT) : ''
  const paragraphPreview = currentParagraph ? compactTextPreview(currentParagraph, AI_PARAGRAPH_PREVIEW_LIMIT) : ''
  const hasSelection = Boolean(selectedText)

  return {
    id: message.id,
    role: message.role,
    action,
    prompt,
    content: message.role === 'user'
      ? (prompt || message.content || t('editor.ai_prompt_empty'))
      : message.content,
    hasSelection,
    selectionPreview,
    paragraphPreview,
    selectionRange: null,
    status: message.status === 'streaming'
      ? 'streaming'
      : message.status === 'failed'
        ? 'error'
        : 'done',
    error: message.error,
    appliedModes: [],
  }
}

export function TipTapAiAssistant({
  options,
  context,
  onApplyResult,
  onSyncContext,
}: TipTapAiAssistantProps) {
  const aiButtonRef = useRef<HTMLButtonElement | null>(null)
  const aiPanelRef = useRef<HTMLDivElement | null>(null)
  const aiModelButtonRef = useRef<HTMLDivElement | null>(null)
  const aiModelMenuRef = useRef<HTMLDivElement | null>(null)
  const aiModelListRef = useRef<HTMLDivElement | null>(null)
  const conversationMenuButtonRef = useRef<HTMLDivElement | null>(null)
  const conversationMenuRef = useRef<HTMLDivElement | null>(null)
  const conversationViewportRef = useRef<HTMLDivElement | null>(null)
  const aiButtonPositionRef = useRef({ top: 0, left: 0 })
  const aiButtonDockedRef = useRef(true)
  const aiDragStateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originLeft: number
    originTop: number
  } | null>(null)
  const aiSuppressClickRef = useRef(false)
  const aiZoomSignatureRef = useRef<string | null>(null)

  const [showAiPanel, setShowAiPanel] = useState(false)
  const [showAiModelMenu, setShowAiModelMenu] = useState(false)
  const [showConversationMenu, setShowConversationMenu] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiError, setAiError] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPromptPolishing, setAiPromptPolishing] = useState(false)
  const [conversationLoading, setConversationLoading] = useState(false)
  const [conversationSaving, setConversationSaving] = useState(false)
  const [conversationDeleting, setConversationDeleting] = useState(false)
  const [aiMode, setAiMode] = useState<StoryAiAction>('rewrite')
  const [aiModelsLoading, setAiModelsLoading] = useState(false)
  const [aiModelOptions, setAiModelOptions] = useState<StoryAiModelOption[]>([])
  const [aiSelectedModel, setAiSelectedModel] = useState('')
  const [aiModelQuery, setAiModelQuery] = useState('')
  const [conversations, setConversations] = useState<EditorAiConversationDto[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [aiButtonPosition, setAiButtonPosition] = useState({ top: 0, left: 0 })
  const [aiPanelPosition, setAiPanelPosition] = useState({ top: 0, left: 0 })
  const [sessionMessages, setSessionMessages] = useState<AiSessionMessage[]>([])
  const [isDesktopViewport, setIsDesktopViewport] = useState(true)

  const { t } = useLanguage()
  const aiModelMenuId = useId()
  const conversationMenuId = useId()
  const isEnabled = options?.enabled === true

  const aiSelectionPreview = useMemo(() => {
    if (!context.hasSelection || !context.selectedText) return ''
    return compactTextPreview(context.selectedText, AI_SELECTION_PREVIEW_LIMIT)
  }, [context.hasSelection, context.selectedText])

  const paragraphPreview = useMemo(() => {
    if (!context.currentParagraph) return ''
    return compactTextPreview(context.currentParagraph, AI_PARAGRAPH_PREVIEW_LIMIT)
  }, [context.currentParagraph])

  const selectedAiModelLabel = useMemo(
    () => aiModelOptions.find((option) => option.id === aiSelectedModel)?.label ?? t('editor.ai_model_current_default'),
    [aiModelOptions, aiSelectedModel, t],
  )

  const filteredAiModelOptions = useMemo(() => {
    const query = aiModelQuery.trim().toLowerCase()
    if (!query) return aiModelOptions
    return aiModelOptions.filter((option) => option.label.toLowerCase().includes(query))
  }, [aiModelOptions, aiModelQuery])

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, conversations],
  )

  const activeConversationLabel = useMemo(() => {
    if (!activeConversation) return t('editor.ai_conversation_new')
    return activeConversation.title?.trim()
      || activeConversation.summary?.trim()
      || `${t('editor.ai_conversation_label')} ${activeConversation.createdAt.slice(0, 10)}`
  }, [activeConversation, t])

  const updateSessionMessage = useCallback((id: string, updater: (message: AiSessionMessage) => AiSessionMessage) => {
    setSessionMessages((current) => current.map((message) => (message.id === id ? updater(message) : message)))
  }, [])

  const loadConversationDetail = useCallback(async (conversationId: string) => {
    if (!options?.token) return

    setConversationLoading(true)
    setAiError('')

    try {
      const conversation = await getEditorAiConversation(options.token, conversationId)
      setActiveConversationId(conversation.id)
      setConversations((current) => {
        const next = current.some((item) => item.id === conversation.id)
          ? current.map((item) => (item.id === conversation.id ? conversation : item))
          : [conversation, ...current]
        return next.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      })
      setSessionMessages(
        conversation.messages
          .map((message) => toSessionMessage(message, t))
          .filter((message): message is AiSessionMessage => Boolean(message)),
      )
    } catch (error) {
      setAiError(error instanceof Error ? error.message : t('editor.ai_failed'))
    } finally {
      setConversationLoading(false)
    }
  }, [options?.token, t])

  const refreshConversations = useCallback(async () => {
    if (!isEnabled || !options?.token || !options?.scopeId) return

    setConversationLoading(true)
    setAiError('')

    try {
      const items = await getEditorAiConversations(options.token, options.scopeId)
      setConversations(items)

      if (items.length === 0) {
        setActiveConversationId(null)
        setSessionMessages([])
        return
      }

      setConversations(items)
      const nextConversationId = items.some((item) => item.id === activeConversationId)
        ? activeConversationId
        : items[0]?.id

      if (!nextConversationId) {
        setActiveConversationId(null)
        setSessionMessages([])
        return
      }

      if (nextConversationId !== activeConversationId) {
        await loadConversationDetail(nextConversationId)
      }
    } catch (error) {
      setAiError(error instanceof Error ? error.message : t('editor.ai_failed'))
    } finally {
      setConversationLoading(false)
    }
  }, [activeConversationId, isEnabled, loadConversationDetail, options?.scopeId, options?.token, t])

  const handleCreateConversation = useCallback(async () => {
    if (!options?.token || !options?.scopeId) {
      setAiError(t('editor.ai_missing_scope'))
      return
    }

    setConversationSaving(true)
    setAiError('')

    try {
      const conversation = await createEditorAiConversation(options.token, {
        scopeId: options.scopeId,
        title: options.title,
      })
      setConversations((current) => [conversation, ...current])
      setActiveConversationId(conversation.id)
      setSessionMessages([])
      setAiPrompt('')
      setShowConversationMenu(false)
    } catch (error) {
      setAiError(error instanceof Error ? error.message : t('editor.ai_failed'))
    } finally {
      setConversationSaving(false)
    }
  }, [options?.scopeId, options?.title, options?.token, t])

  const handleDeleteConversation = useCallback(async (conversationId?: string) => {
    const targetConversationId = conversationId ?? activeConversationId
    if (!options?.token || !targetConversationId) return

    setConversationDeleting(true)
    setAiError('')

    try {
      await deleteEditorAiConversation(options.token, targetConversationId)
      const remaining = conversations.filter((item) => item.id !== targetConversationId)
      setConversations(remaining)
      setShowConversationMenu(false)

      if (activeConversationId === targetConversationId) {
        const nextConversation = remaining[0]
        if (nextConversation) {
          await loadConversationDetail(nextConversation.id)
        } else {
          setActiveConversationId(null)
          setSessionMessages([])
        }
      }
    } catch (error) {
      setAiError(error instanceof Error ? error.message : t('editor.ai_failed'))
    } finally {
      setConversationDeleting(false)
    }
  }, [activeConversationId, conversations, loadConversationDetail, options?.token, t])

  const refreshAiModels = useCallback(async () => {
    if (!isEnabled || !options?.token) {
      setAiError(t('editor.ai_missing_token'))
      return
    }

    setAiModelsLoading(true)
    setAiError('')

    try {
      const response = await getStoryAiModels(options.token)
      setAiModelOptions(response.models)
      setAiSelectedModel((current) => {
        const nextModel = current || response.defaultModel
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(AI_SELECTED_MODEL_STORAGE_KEY, nextModel)
          window.localStorage.setItem(AI_MODELS_STORAGE_KEY, JSON.stringify(response.models))
        }
        return nextModel
      })
    } catch (error) {
      setAiError(error instanceof Error ? error.message : t('editor.ai_failed'))
    } finally {
      setAiModelsLoading(false)
    }
  }, [isEnabled, options?.token, t])

  const updateAiPanelPosition = useCallback(() => {
    if (typeof window === 'undefined' || !aiButtonRef.current) return

    const viewport = getViewportMetrics()
    const rect = aiButtonRef.current.getBoundingClientRect()
    const panelWidth = Math.min(420, viewport.width - 24)
    const panelHeight = Math.min(620, viewport.height - 24)
    const padding = 12
    const preferredLeft = rect.right - panelWidth
    const minLeft = viewport.offsetLeft + padding
    const maxLeft = Math.max(minLeft, viewport.offsetLeft + viewport.width - panelWidth - padding)
    const left = Math.max(minLeft, Math.min(preferredLeft + viewport.offsetLeft, maxLeft))
    const minTop = viewport.offsetTop + padding
    const maxTop = Math.max(minTop, viewport.offsetTop + viewport.height - panelHeight - padding)
    const belowTop = Math.min(rect.bottom + viewport.offsetTop + 12, maxTop)
    const aboveTop = Math.max(minTop, rect.top + viewport.offsetTop - panelHeight - 12)
    const top = viewport.height - rect.bottom > panelHeight * 0.5 ? belowTop : aboveTop

    if (aiPanelRef.current) {
      aiPanelRef.current.style.top = `${top}px`
      aiPanelRef.current.style.left = `${left}px`
    }

    setAiPanelPosition({ top, left })
  }, [])

  const applyAiButtonPosition = useCallback((position: { top: number; left: number }) => {
    aiButtonPositionRef.current = position
    if (!aiButtonRef.current) return
    aiButtonRef.current.style.top = `${position.top}px`
    aiButtonRef.current.style.left = `${position.left}px`
    aiButtonRef.current.style.right = 'auto'
    aiButtonRef.current.style.bottom = 'auto'
  }, [])

  const resetAiButtonToDock = useCallback(() => {
    const dockedPosition = { top: 0, left: 0 }
    aiButtonDockedRef.current = true
    aiButtonPositionRef.current = dockedPosition
    if (aiButtonRef.current) {
      aiButtonRef.current.style.top = ''
      aiButtonRef.current.style.left = ''
      aiButtonRef.current.style.right = `${AI_FLOATING_BUTTON_INSET}px`
      aiButtonRef.current.style.bottom = `${AI_FLOATING_BUTTON_INSET}px`
    }
    setAiButtonPosition((current) => (
      current.top === dockedPosition.top && current.left === dockedPosition.left ? current : dockedPosition
    ))
  }, [])

  const clampAiButtonPosition = useCallback((left: number, top: number) => {
    const viewport = getViewportMetrics()
    const width = aiButtonRef.current?.offsetWidth || 168
    const height = aiButtonRef.current?.offsetHeight || 52
    const padding = 16
    return {
      left: Math.min(
        Math.max(viewport.offsetLeft + padding, left),
        Math.max(viewport.offsetLeft + padding, viewport.offsetLeft + viewport.width - width - padding),
      ),
      top: Math.min(
        Math.max(viewport.offsetTop + padding, top),
        Math.max(viewport.offsetTop + padding, viewport.offsetTop + viewport.height - height - padding),
      ),
    }
  }, [])

  const handleAiButtonPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDesktopViewport || !aiButtonRef.current) return
    event.preventDefault()
    onSyncContext?.()

    const rect = aiButtonRef.current.getBoundingClientRect()
    aiDragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: rect.left,
      originTop: rect.top,
    }

    aiButtonRef.current.setPointerCapture(event.pointerId)
  }, [isDesktopViewport, onSyncContext])

  const handleAiButtonPointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDesktopViewport) return
    const dragState = aiDragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return

    const nextLeft = dragState.originLeft + (event.clientX - dragState.startX)
    const nextTop = dragState.originTop + (event.clientY - dragState.startY)
    const clamped = clampAiButtonPosition(nextLeft, nextTop)
    if (Math.abs(event.clientX - dragState.startX) > 4 || Math.abs(event.clientY - dragState.startY) > 4) {
      aiSuppressClickRef.current = true
      aiButtonDockedRef.current = false
    }
    applyAiButtonPosition(clamped)
    if (showAiPanel) updateAiPanelPosition()
  }, [applyAiButtonPosition, clampAiButtonPosition, isDesktopViewport, showAiPanel, updateAiPanelPosition])

  const handleAiButtonPointerUp = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDesktopViewport) return
    const dragState = aiDragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return
    if (aiButtonRef.current?.hasPointerCapture(event.pointerId)) {
      aiButtonRef.current.releasePointerCapture(event.pointerId)
    }
    setAiButtonPosition(aiButtonPositionRef.current)
    aiDragStateRef.current = null
    window.setTimeout(() => {
      aiSuppressClickRef.current = false
    }, 0)
  }, [isDesktopViewport])

  const handleAiButtonClick = useCallback(() => {
    if (aiSuppressClickRef.current) return
    onSyncContext?.()
    setShowAiPanel((current) => !current)
  }, [onSyncContext])

  const handleAiModelInputFocus = useCallback(() => {
    setAiModelQuery('')
    setShowAiModelMenu(true)
  }, [])

  const handleApplyResult = useCallback((message: AiSessionMessage, mode: TipTapAiApplyMode) => {
    if (!message.content.trim()) return

    onApplyResult(mode, message.content, message.selectionRange)
    setAiError('')
    updateSessionMessage(message.id, (currentMessage) => {
      const appliedModes = currentMessage.appliedModes ?? []
      return {
        ...currentMessage,
        appliedModes: appliedModes.includes(mode) ? appliedModes : [...appliedModes, mode],
      }
    })
  }, [onApplyResult, updateSessionMessage])

  const clearConversation = useCallback(() => {
    setAiPrompt('')
    void handleCreateConversation()
  }, [handleCreateConversation])

  const closeAssistant = useCallback(() => {
    setShowAiPanel(false)
    setShowAiModelMenu(false)
    setShowConversationMenu(false)
  }, [])

  const runAiAction = useCallback(async (action: StoryAiAction, promptOverride?: string) => {
    if (!isEnabled) return
    if (!options?.token) {
      setAiError(t('editor.ai_missing_token'))
      return
    }
    if (!options?.scopeId) {
      setAiError(t('editor.ai_missing_scope'))
      return
    }

    const prompt = (promptOverride ?? aiPrompt).trim()
    const effectiveAction: StoryAiAction = prompt ? 'custom' : action
    const hasSelection = context.hasSelection && Boolean(context.selectedText.trim())

    let conversationId = activeConversationId
    if (!conversationId) {
      setConversationSaving(true)
      try {
        const conversation = await createEditorAiConversation(options.token, {
          scopeId: options.scopeId,
          title: options.title,
        })
        setConversations((current) => [conversation, ...current])
        setActiveConversationId(conversation.id)
        conversationId = conversation.id
      } catch (error) {
        setAiError(error instanceof Error ? error.message : t('editor.ai_failed'))
        setConversationSaving(false)
        return
      } finally {
        setConversationSaving(false)
      }
    }

    const userMessageId = buildMessageId('user')
    const assistantMessageId = buildMessageId('assistant')
    const userMessage: AiSessionMessage = {
      id: userMessageId,
      role: 'user',
      action: effectiveAction,
      prompt,
      content: prompt || resolveActionLabel(action, t),
      hasSelection,
      selectionPreview: aiSelectionPreview,
      paragraphPreview,
      selectionRange: context.selectionRange,
    }
    const assistantMessage: AiSessionMessage = {
      id: assistantMessageId,
      role: 'assistant',
      action: effectiveAction,
      prompt,
      content: '',
      hasSelection,
      selectionPreview: aiSelectionPreview,
      paragraphPreview,
      selectionRange: context.selectionRange,
      status: 'streaming',
      appliedModes: [],
    }

    setAiLoading(true)
    setAiError('')
    setSessionMessages((current) => [...current, userMessage, assistantMessage])

    try {
      await streamStoryAiGenerate(options.token, {
        conversationId,
        action: effectiveAction,
        model: aiSelectedModel || undefined,
        prompt: prompt || undefined,
        title: options.title,
        selectedText: context.selectedText || undefined,
        currentParagraph: context.currentParagraph || undefined,
        contextBefore: context.contextBefore || undefined,
        contextAfter: context.contextAfter || undefined,
      }, {
        onChunk: (chunk) => {
          updateSessionMessage(assistantMessageId, (message) => ({
            ...message,
            content: message.content + chunk,
          }))
        },
        onDone: () => {
          void loadConversationDetail(conversationId)
        },
      })

      setAiPrompt('')
    } catch (error) {
      const message = error instanceof Error ? error.message : t('editor.ai_failed')
      setAiError(message)
      updateSessionMessage(assistantMessageId, (currentMessage) => ({
        ...currentMessage,
        status: 'error',
        error: message,
      }))
      await loadConversationDetail(conversationId)
    } finally {
      setAiLoading(false)
    }
  }, [
    activeConversationId,
    aiPrompt,
    aiSelectedModel,
    aiSelectionPreview,
    context.contextAfter,
    context.contextBefore,
    context.currentParagraph,
    context.hasSelection,
    context.selectedText,
    context.selectionRange,
    isEnabled,
    loadConversationDetail,
    options?.scopeId,
    options?.title,
    options?.token,
    paragraphPreview,
    t,
    updateSessionMessage,
  ])

  const handlePolishPrompt = useCallback(async () => {
    const prompt = aiPrompt.trim()
    if (!prompt) return
    if (!options?.token) {
      setAiError(t('editor.ai_missing_token'))
      return
    }

    setAiPromptPolishing(true)
    setAiError('')

    try {
      const response = await polishStoryAiPrompt(options.token, {
        text: prompt,
        action: aiMode,
        hasSelection: context.hasSelection,
        model: aiSelectedModel || undefined,
      })
      setAiPrompt(response.text)
    } catch (error) {
      setAiError(error instanceof Error ? error.message : t('editor.ai_failed'))
    } finally {
      setAiPromptPolishing(false)
    }
  }, [aiMode, aiPrompt, aiSelectedModel, context.hasSelection, options?.token, t])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY)
    const syncViewport = () => setIsDesktopViewport(mediaQuery.matches)
    syncViewport()
    mediaQuery.addEventListener('change', syncViewport)
    return () => {
      mediaQuery.removeEventListener('change', syncViewport)
    }
  }, [])

  useEffect(() => {
    if (!isDesktopViewport) {
      resetAiButtonToDock()
    }
  }, [isDesktopViewport, resetAiButtonToDock])

  useEffect(() => {
    if (!isEnabled || typeof window === 'undefined') return

    try {
      const cachedModels = window.localStorage.getItem(AI_MODELS_STORAGE_KEY)
      const cachedSelectedModel = window.localStorage.getItem(AI_SELECTED_MODEL_STORAGE_KEY)
      const parsed = cachedModels ? JSON.parse(cachedModels) as StoryAiModelOption[] : []
      setAiModelOptions(Array.isArray(parsed) ? parsed : [])
      setAiSelectedModel(cachedSelectedModel || '')
    } catch {
      setAiModelOptions([])
      setAiSelectedModel('')
    }
  }, [isEnabled])

  useEffect(() => {
    if (!aiSelectedModel || typeof window === 'undefined') return
    window.localStorage.setItem(AI_SELECTED_MODEL_STORAGE_KEY, aiSelectedModel)
  }, [aiSelectedModel])

  useEffect(() => {
    if (!isEnabled || !options?.token || !options?.scopeId) return
    void refreshConversations()
  }, [isEnabled, options?.scopeId, options?.token, refreshConversations])

  useEffect(() => {
    if (!showAiPanel || typeof window === 'undefined') return

    updateAiPanelPosition()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (showAiModelMenu) {
        setShowAiModelMenu(false)
        return
      }
      closeAssistant()
    }

    const handleViewportChange = () => {
      updateAiPanelPosition()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [closeAssistant, showAiModelMenu, showAiPanel, updateAiPanelPosition])

  useEffect(() => {
    if (!isEnabled || typeof window === 'undefined' || !isDesktopViewport || !aiButtonRef.current) return

    const syncFloatingButtonPosition = () => {
      if (!aiButtonRef.current) return

      const zoomSignature = getZoomSignature()
      const hasZoomChanged = aiZoomSignatureRef.current !== null && aiZoomSignatureRef.current !== zoomSignature
      aiZoomSignatureRef.current = zoomSignature

      if (hasZoomChanged) {
        resetAiButtonToDock()
        if (showAiPanel) {
          requestAnimationFrame(() => {
            updateAiPanelPosition()
          })
        }
        return
      }

      if (aiButtonDockedRef.current) {
        if (showAiPanel) {
          updateAiPanelPosition()
        }
        return
      }

      const viewport = getViewportMetrics()
      const rect = aiButtonRef.current.getBoundingClientRect()
      const basePosition = {
        top: aiButtonPositionRef.current.top || rect.top + viewport.offsetTop,
        left: aiButtonPositionRef.current.left || rect.left + viewport.offsetLeft,
      }
      const clamped = clampAiButtonPosition(basePosition.left, basePosition.top)

      aiButtonPositionRef.current = clamped
      applyAiButtonPosition(clamped)
      setAiButtonPosition((current) => (
        current.top === clamped.top && current.left === clamped.left ? current : clamped
      ))

      if (showAiPanel) {
        updateAiPanelPosition()
      }
    }

    syncFloatingButtonPosition()

    const handleViewportChange = () => {
      syncFloatingButtonPosition()
    }

    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    window.visualViewport?.addEventListener('resize', handleViewportChange)
    window.visualViewport?.addEventListener('scroll', handleViewportChange)

    return () => {
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
      window.visualViewport?.removeEventListener('resize', handleViewportChange)
      window.visualViewport?.removeEventListener('scroll', handleViewportChange)
    }
  }, [applyAiButtonPosition, clampAiButtonPosition, isDesktopViewport, isEnabled, resetAiButtonToDock, showAiPanel, updateAiPanelPosition])

  useEffect(() => {
    if (!showAiModelMenu) {
      setAiModelQuery('')
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (aiModelMenuRef.current?.contains(target) || aiModelButtonRef.current?.contains(target)) return
      setShowAiModelMenu(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowAiModelMenu(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [showAiModelMenu])

  useEffect(() => {
    if (!showAiModelMenu || aiModelQuery.trim()) return
    requestAnimationFrame(() => {
      const selectedOption = aiModelListRef.current?.querySelector<HTMLElement>('[data-ai-model-selected="true"]')
      selectedOption?.scrollIntoView({ block: 'nearest' })
    })
  }, [aiModelQuery, aiSelectedModel, showAiModelMenu])

  useEffect(() => {
    if (!showConversationMenu) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (conversationMenuRef.current?.contains(target) || conversationMenuButtonRef.current?.contains(target)) return
      setShowConversationMenu(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowConversationMenu(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [showConversationMenu])

  useEffect(() => {
    setShowConversationMenu(false)
  }, [activeConversationId])

  useEffect(() => {
    if (!conversationViewportRef.current) return
    conversationViewportRef.current.scrollTop = conversationViewportRef.current.scrollHeight
  }, [sessionMessages])

  if (!isEnabled || typeof document === 'undefined') {
    return null
  }

  const aiPanel = showAiPanel
    ? createPortal(
        <div
          ref={aiPanelRef}
          className="fixed z-[140] flex h-[min(620px,calc(100vh-24px))] w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-[28px] border border-border/70 bg-background/96 shadow-[0_30px_80px_rgba(15,23,42,0.22)] backdrop-blur-xl"
          style={{
            top: aiPanelPosition.top,
            left: aiPanelPosition.left,
          }}
        >
          <div className="border-b border-border/60 px-4 pb-4 pt-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Wand2 className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <div className="text-sm font-medium text-foreground">{t('editor.ai_panel_title')}</div>
                      <div className="mt-0.5 text-xs font-normal text-muted-foreground">
                        {t('editor.ai_chat_subtitle')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative min-w-0 flex-1">
                        <div
                          ref={conversationMenuButtonRef}
                          className={`flex h-10 min-w-0 items-center justify-between gap-2 rounded-full border px-3 text-left text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[border-color,box-shadow,background-color] ${
                            showConversationMenu
                              ? 'border-primary/50 bg-background shadow-[0_0_0_4px_rgba(59,130,246,0.08)]'
                              : 'border-border/80 bg-background/90 hover:border-primary/30'
                          } ${conversationSaving || conversationLoading ? 'cursor-not-allowed opacity-60' : ''}`}
                          role="button"
                          tabIndex={0}
                          aria-expanded={showConversationMenu}
                          aria-haspopup="listbox"
                          aria-controls={conversationMenuId}
                          onClick={() => {
                            if (conversationSaving || conversationLoading) return
                            setShowConversationMenu((current) => !current)
                          }}
                          onKeyDown={(event) => {
                            if (conversationSaving || conversationLoading) return
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              setShowConversationMenu((current) => !current)
                            }
                          }}
                        >
                          <span className="min-w-0 truncate font-medium text-foreground">
                            {conversationLoading ? t('editor.ai_conversation_loading') : activeConversationLabel}
                          </span>
                          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${showConversationMenu ? 'rotate-180' : ''}`} />
                        </div>
                        {showConversationMenu ? (
                          <div
                            ref={conversationMenuRef}
                            id={conversationMenuId}
                            className="absolute left-0 top-[calc(100%+8px)] z-30 w-full overflow-hidden rounded-2xl border border-border/80 bg-background/98 shadow-[0_20px_40px_rgba(15,23,42,0.16)] backdrop-blur"
                            role="listbox"
                          >
                            <div className="border-b border-border/60 p-2">
                              <button
                                type="button"
                                onClick={() => void handleCreateConversation()}
                                disabled={conversationSaving}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Plus className="h-4 w-4" />
                                {t('editor.ai_conversation_new')}
                              </button>
                            </div>
                            <div className="max-h-64 overflow-y-auto p-2">
                              {conversations.length === 0 ? (
                                <div className="rounded-xl px-3 py-2 text-sm text-muted-foreground">
                                  {t('editor.ai_conversation_empty')}
                                </div>
                              ) : (
                                conversations.map((conversation) => {
                                  const isSelected = conversation.id === activeConversationId
                                  const label = conversation.title?.trim()
                                    || conversation.summary?.trim()
                                    || `${t('editor.ai_conversation_label')} ${conversation.createdAt.slice(0, 10)}`
                                  return (
                                    <div
                                      key={conversation.id}
                                      className={`flex items-center gap-2 rounded-xl px-3 py-2 transition-colors ${
                                        isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/70'
                                      }`}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => {
                                          void loadConversationDetail(conversation.id)
                                          setShowConversationMenu(false)
                                        }}
                                        className="min-w-0 flex-1 text-left"
                                      >
                                        <div className="truncate text-sm font-medium">{label}</div>
                                        <div className="truncate text-xs text-muted-foreground">{new Date(conversation.updatedAt).toLocaleString()}</div>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void handleDeleteConversation(conversation.id)}
                                        disabled={conversationDeleting}
                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                                        title={t('editor.ai_conversation_delete')}
                                        aria-label={t('editor.ai_conversation_delete')}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  )
                                })
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCreateConversation()}
                        disabled={conversationSaving}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/80 bg-background text-foreground transition-[border-color,background-color,color,transform] hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                        title={t('editor.ai_conversation_new')}
                        aria-label={t('editor.ai_conversation_new')}
                      >
                        {conversationSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteConversation()}
                        disabled={!activeConversationId || conversationDeleting}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/80 bg-background text-foreground transition-[border-color,background-color,color,transform] hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60"
                        title={t('editor.ai_conversation_delete')}
                        aria-label={t('editor.ai_conversation_delete')}
                      >
                        {conversationDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-border/70 bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="truncate">
                    {context.hasSelection && aiSelectionPreview
                      ? `${t('editor.ai_context_selection')}: ${aiSelectionPreview}`
                      : `${t('editor.ai_context_paragraph')}: ${paragraphPreview || t('editor.ai_scope_paragraph')}`}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeAssistant}
                  className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title={t('common.cancel')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div ref={conversationViewportRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {conversationLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('editor.ai_conversation_loading')}
              </div>
            ) : sessionMessages.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-border/70 bg-muted/15 px-4 py-6 text-sm text-muted-foreground">
                <div className="font-medium text-foreground">{t('editor.ai_chat_empty_title')}</div>
                <div className="mt-2 leading-6">{t('editor.ai_chat_empty_description')}</div>
              </div>
            ) : (
              sessionMessages.map((message) => {
                const actionLabel = resolveActionLabel(message.action, t)
                const appliedModes = message.appliedModes ?? []
                const canReplace = Boolean(message.content.trim()) && Boolean(message.selectionRange)
                const canApply = Boolean(message.content.trim())

                if (message.role === 'user') {
                  return (
                    <div key={message.id} className="ml-8 rounded-[24px] border border-border/60 bg-muted/25 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                          {t('editor.ai_chat_you')}
                        </div>
                        <div className="rounded-full bg-background px-2.5 py-1 text-[11px] font-medium text-foreground">
                          {actionLabel}
                        </div>
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                        {message.prompt || t('editor.ai_prompt_empty')}
                      </div>
                      <div className="mt-3 text-xs text-muted-foreground">
                        {message.hasSelection && message.selectionPreview
                          ? `${t('editor.ai_context_selection')}: ${message.selectionPreview}`
                          : `${t('editor.ai_context_paragraph')}: ${message.paragraphPreview || t('editor.ai_scope_paragraph')}`}
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={message.id} className="mr-8 rounded-[24px] border border-border/70 bg-background px-4 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        <span className="flex h-7 w-7 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                          {message.status === 'streaming'
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Sparkles className="h-3.5 w-3.5" />}
                        </span>
                        {t('editor.ai_panel_title')}
                      </div>
                      <div className="text-xs text-muted-foreground">{actionLabel}</div>
                    </div>

                    <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground">
                      {message.content || (message.status === 'streaming' ? t('editor.ai_generating') : t('editor.ai_preview_placeholder'))}
                    </div>

                    {message.status === 'error' && message.error ? (
                      <div className="mt-3 rounded-2xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                        {message.error}
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={!canReplace || message.status === 'streaming'}
                        onClick={() => handleApplyResult(message, 'replace')}
                        className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                          appliedModes.includes('replace')
                            ? 'border-primary/30 bg-primary/10 text-primary'
                            : 'border-border text-foreground hover:border-foreground/20'
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        {appliedModes.includes('replace') ? t('editor.ai_applied') : t('editor.ai_apply_replace')}
                      </button>
                      <button
                        type="button"
                        disabled={!canApply || message.status === 'streaming'}
                        onClick={() => handleApplyResult(message, 'insert')}
                        className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                          appliedModes.includes('insert')
                            ? 'border-primary/30 bg-primary/10 text-primary'
                            : 'border-border text-foreground hover:border-foreground/20'
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        {appliedModes.includes('insert') ? t('editor.ai_applied') : t('editor.ai_apply_insert')}
                      </button>
                      <button
                        type="button"
                        disabled={!canApply || message.status === 'streaming'}
                        onClick={() => handleApplyResult(message, 'append')}
                        className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                          appliedModes.includes('append')
                            ? 'border-primary/30 bg-primary/10 text-primary'
                            : 'border-border text-foreground hover:border-foreground/20'
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        {appliedModes.includes('append') ? t('editor.ai_applied') : t('editor.ai_apply_append')}
                      </button>
                      {message.status === 'error' ? (
                        <button
                          type="button"
                          disabled={aiLoading}
                          onClick={() => void runAiAction(message.action === 'custom' ? 'custom' : message.action, message.prompt)}
                          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:border-foreground/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          {t('common.retry')}
                        </button>
                      ) : null}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div className="border-t border-border/60 bg-background/90 px-4 pb-4 pt-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {AI_PRESET_ACTIONS.map((item) => (
                <button
                  key={item.action}
                  type="button"
                  onClick={() => setAiMode(item.action)}
                  disabled={aiLoading}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    aiMode === item.action
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {t(`editor.ai_action_${item.key}`)}
                </button>
              ))}
            </div>

            <div className="rounded-[24px] border border-border/70 bg-muted/15 p-3">
              <textarea
                value={aiPrompt}
                onChange={(event) => setAiPrompt(event.target.value)}
                placeholder={t('editor.ai_composer_placeholder')}
                className="h-24 w-full resize-none bg-transparent text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="relative min-w-0">
                    <div
                      ref={aiModelButtonRef}
                      className={`flex h-10 w-[156px] items-center justify-between gap-2 rounded-full border px-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition-[border-color,box-shadow,background-color] ${
                        showAiModelMenu
                          ? 'border-primary/50 bg-background shadow-[0_0_0_4px_rgba(59,130,246,0.08)]'
                          : 'border-border/80 bg-background/90 hover:border-primary/30'
                      } ${aiModelsLoading || aiLoading ? 'cursor-not-allowed opacity-60' : ''}`}
                      role="combobox"
                      aria-expanded={showAiModelMenu}
                      aria-haspopup="listbox"
                      aria-controls={aiModelMenuId}
                    >
                      <span className="min-w-0 flex-1">
                        <input
                          type="text"
                          value={showAiModelMenu ? aiModelQuery : selectedAiModelLabel}
                          onFocus={handleAiModelInputFocus}
                          onChange={(event) => {
                            setAiModelQuery(event.target.value)
                            setShowAiModelMenu(true)
                          }}
                          onClick={() => setShowAiModelMenu(true)}
                          disabled={aiModelsLoading || aiLoading}
                          placeholder={aiModelsLoading ? t('editor.ai_models_loading') : t('editor.ai_model_search_placeholder')}
                          className="block h-5 w-full truncate bg-transparent text-xs font-medium text-foreground outline-none placeholder:text-muted-foreground/70"
                        />
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAiModelMenu((current) => !current)}
                        disabled={aiModelsLoading || aiLoading}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed"
                        tabIndex={-1}
                      >
                        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showAiModelMenu ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    {showAiModelMenu ? (
                      <div
                        ref={aiModelMenuRef}
                        id={aiModelMenuId}
                        className="absolute bottom-[calc(100%+8px)] left-0 z-20 max-h-56 w-[208px] overflow-hidden rounded-2xl border border-border/80 bg-background/98 shadow-[0_20px_40px_rgba(15,23,42,0.16)] backdrop-blur"
                        role="listbox"
                      >
                        <div ref={aiModelListRef} className="max-h-56 overflow-y-auto p-2">
                          {filteredAiModelOptions.length === 0 ? (
                            <div className="rounded-xl px-3 py-2 text-sm text-muted-foreground">
                              {aiModelsLoading ? t('editor.ai_models_loading') : t('editor.ai_models_empty')}
                            </div>
                          ) : (
                            filteredAiModelOptions.map((option) => {
                              const isSelected = option.id === aiSelectedModel
                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  data-ai-model-selected={isSelected ? 'true' : undefined}
                                  onClick={() => {
                                    setAiSelectedModel(option.id)
                                    setShowAiModelMenu(false)
                                  }}
                                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                                    isSelected ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/70'
                                  }`}
                                  title={option.label}
                                >
                                  <span className="min-w-0 flex-1 truncate text-sm">{option.label}</span>
                                  {isSelected ? <Check className="h-4 w-4 shrink-0" /> : null}
                                </button>
                              )
                            })
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => void refreshAiModels()}
                    disabled={aiModelsLoading || aiLoading || conversationLoading}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/80 bg-background text-foreground transition-[border-color,background-color,color,transform] hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                    title={aiModelsLoading ? t('editor.ai_models_refreshing') : t('editor.ai_models_refresh')}
                    aria-label={aiModelsLoading ? t('editor.ai_models_refreshing') : t('editor.ai_models_refresh')}
                  >
                    <RotateCcw className={`h-4 w-4 ${aiModelsLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {sessionMessages.length > 0 ? (
                    <button
                      type="button"
                      onClick={clearConversation}
                      disabled={conversationSaving}
                      className="rounded-full border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
                    >
                      {t('editor.ai_conversation_new')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void handlePolishPrompt()}
                    disabled={!aiPrompt.trim() || aiLoading || aiPromptPolishing}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/80 bg-background text-foreground transition-[border-color,background-color,color,transform] hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                    title={t('editor.ai_polish_prompt')}
                    aria-label={t('editor.ai_polish_prompt')}
                  >
                    {aiPromptPolishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  </button>
                    <button
                      type="button"
                      onClick={() => void runAiAction(aiMode)}
                      disabled={aiLoading || aiPromptPolishing || conversationLoading || conversationDeleting}
                      className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                    {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {t('editor.ai_generate')}
                  </button>
                </div>
              </div>
              {aiError ? (
                <div className="mt-3 rounded-2xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {aiError}
                </div>
              ) : null}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null

  const aiFloatingButton = createPortal(
    <button
      ref={aiButtonRef}
      type="button"
      onPointerDown={handleAiButtonPointerDown}
      onPointerMove={handleAiButtonPointerMove}
      onPointerUp={handleAiButtonPointerUp}
      onPointerCancel={handleAiButtonPointerUp}
      onClick={handleAiButtonClick}
      className={`fixed z-[130] inline-flex h-12 items-center gap-2 rounded-full border px-4 text-sm font-medium backdrop-blur-md touch-none select-none transition-[background-color,border-color,color,box-shadow,transform] duration-200 active:scale-[0.98] ${
        showAiPanel
          ? 'border-primary/35 bg-primary/12 text-primary shadow-[0_20px_40px_rgba(37,99,235,0.18)]'
          : 'border-border/80 bg-background/90 text-foreground shadow-[0_18px_36px_rgba(15,23,42,0.12)] hover:border-primary/30 hover:text-primary'
      }`}
      aria-pressed={showAiPanel}
        style={{
          top: isDesktopViewport && (aiButtonPosition.top || aiButtonPosition.left) ? aiButtonPosition.top : undefined,
          left: isDesktopViewport && (aiButtonPosition.top || aiButtonPosition.left) ? aiButtonPosition.left : undefined,
          right: !isDesktopViewport || (!aiButtonPosition.top && !aiButtonPosition.left) ? AI_FLOATING_BUTTON_INSET : undefined,
          bottom: !isDesktopViewport || (!aiButtonPosition.top && !aiButtonPosition.left) ? AI_FLOATING_BUTTON_INSET : undefined,
        }}
      >
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full border transition-all duration-200 ${
          showAiPanel
            ? 'border-primary/30 bg-primary text-primary-foreground shadow-[0_0_18px_rgba(59,130,246,0.2)]'
            : 'border-primary/15 bg-primary/10 text-primary'
        }`}
      >
        <Sparkles className={`h-4 w-4 transition-transform duration-200 ${showAiPanel ? 'scale-110 rotate-12' : ''}`} />
      </span>
      <span className="tracking-[0.02em]">{t('editor.ai_button')}</span>
    </button>,
    document.body,
  )

  return (
    <>
      {aiFloatingButton}
      {aiPanel}
    </>
  )
}

export default TipTapAiAssistant
