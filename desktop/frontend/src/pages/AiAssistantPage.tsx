import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/LanguageContext'
import { useCachedPageEffect } from '@/hooks/useCachedPageEffect'
import type {
  EditorAiConversationDto,
  EditorAiMessageAppendInput,
  EditorAiMessageDto,
  EditorAiMessageStatus,
  StoryAiModelsResponse,
} from '@/lib/api/types'
import {
  editorAiMessageMetadataSchema,
  reduceEditorAiTrace,
  type EditorAiStreamEvent,
  type EditorAiTraceBlock,
} from '@mo-gallery/ai-agent'
// Text chat shares the editor AI pipeline (agent package, local proxy, and conversation database).
// Image generation continues to use the local /ai/generate endpoint.
import {
  appendLocalEditorAiMessage,
  generateEditorAiConversationTitle,
  getLocalStoryAiModels,
  mapEditorAiMessageDto,
  prepareDesktopImagePrompt,
  streamDesktopAgentGenerate,
} from '@/lib/api/editor-ai-local'
import { Skeleton } from '@/components/admin/Skeleton'
import { AgentMentionMenu } from '@/components/ai/AgentMentionMenu'
import { AgentToolApprovalBar } from '@/components/ai/AgentToolApprovalBar'
import { ConversationSidebar } from '@/components/ai/ConversationSidebar'
import { DesktopEmptyState } from '@/components/ai/EmptyState'
import { DesktopMessageBubble } from '@/components/ai/message/MessageBubble'
import { SelectDropdown } from '@/components/ui/SelectDropdown'
import {
  ClearEditorAiConversation,
  CreateEditorAiConversation,
  DeleteEditorAiConversation,
  GetEditorAiConversationMessagesPage,
  GetEditorAiConversationPage,
  UpdateEditorAiConversation,
} from '../../wailsjs/go/main/App'
import {
  Eraser,
  Image as ImageIcon,
  Loader2,
  PanelLeft,
  PanelLeftClose,
  Paperclip,
  Pencil,
  Quote,
  Send,
  Settings2,
  Sparkles,
  Square,
  X,
} from 'lucide-react'
import {
  buildAgentMentionCandidates,
  filterAgentMentionCandidates,
  findAgentMentionContext,
  removeAgentMentionQuery,
  resolveAgentMentionSelection,
  type AgentMentionCandidate,
  type AgentMentionContext,
} from '@/lib/agent-composer-mentions'
import { agentExtensions, type AgentExtensionSnapshot } from '@/lib/agent-extensions'
import {
  CONVERSATION_PAGE_SIZE,
  DELETE_ARM_TIMEOUT_MS,
  IMAGE_EDIT_MIME_TYPES,
  MAX_ATTACHED_IMAGES,
  MAX_IMAGE_SIZE,
  MESSAGE_PAGE_SIZE,
  SCOPE_ID,
} from '@/lib/ai-assistant/constants'
import type {
  AttachedImage,
  ConversationRenameTarget,
  ConversationRuntimeCache,
  SendOverrides,
} from '@/lib/ai-assistant/types'
import {
  createLocalMessageId,
  deriveConversationTitle,
  ensureAiPort,
  selectAvailableModel,
  supportsChat,
  supportsImageGeneration,
  withGenerationDuration,
} from '@/lib/ai-assistant/utils'
import { getMessageImages, readImageAsDataUrl } from '@/lib/ai-assistant/images'

export function AiAssistantPage() {
  const { t } = useLanguage()

  const [conversations, setConversations] = useState<EditorAiConversationDto[]>([])
  const [hasMoreConversations, setHasMoreConversations] = useState(false)
  const [loadingMoreConversations, setLoadingMoreConversations] = useState(false)
  const [activeConversation, setActiveConversation] = useState<string | null>(null)
  const [messages, setMessages] = useState<EditorAiMessageDto[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingConversation, setLoadingConversation] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [loadingEarlierMessages, setLoadingEarlierMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [models, setModels] = useState<StoryAiModelsResponse | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [imageMode, setImageMode] = useState(false)
  const [selectedImageModel, setSelectedImageModel] = useState<string>('')
  const [selectedImageSize, setSelectedImageSize] = useState('auto')
  const [showSidebar, setShowSidebar] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<ConversationRenameTarget | null>(null)
  const [conversationTitleDraft, setConversationTitleDraft] = useState('')
  const [generatingTitleId, setGeneratingTitleId] = useState<string | null>(null)
  const [branchingMessageId, setBranchingMessageId] = useState<string | null>(null)
  const [conversationMenu, setConversationMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [quotedMessage, setQuotedMessage] = useState<EditorAiMessageDto | null>(null)
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)
  const [systemPromptDraft, setSystemPromptDraft] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([])
  const [persistedMessageIds, setPersistedMessageIds] = useState<Record<string, string>>({})
  const [liveTrace, setLiveTrace] = useState<EditorAiTraceBlock[]>([])
  const [liveTraceMessageId, setLiveTraceMessageId] = useState<string | null>(null)
  const [agentExtensionSnapshot, setAgentExtensionSnapshot] = useState<AgentExtensionSnapshot | null>(null)
  const [agentMentionContext, setAgentMentionContext] = useState<AgentMentionContext | null>(null)
  const [agentMentionActiveIndex, setAgentMentionActiveIndex] = useState(0)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isSwitchingRef = useRef(false)
  const isNearBottomRef = useRef(true)
  const skipConversationLoadRef = useRef<string | null>(null)
  const conversationLoadIdRef = useRef(0)
  const activeConversationRef = useRef<string | null>(null)
  const conversationCacheRef = useRef(new Map<string, ConversationRuntimeCache>())
  const liveTraceRef = useRef<EditorAiTraceBlock[]>([])
  const deleteArmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const agentExtensionSnapshotRequestRef = useRef<Promise<AgentExtensionSnapshot> | null>(null)
  const sendInFlightRef = useRef(false)

  const loadingImages = attachedImages.some(image => image.status === 'loading')
  const readyImages = attachedImages.filter(image => image.status === 'ready' && image.url)
  const canSend = !sending && !loadingImages && (
    imageMode
      ? (input.trim().length > 0 || readyImages.length > 0) && Boolean(selectedImageModel)
      : input.trim().length > 0 || readyImages.length > 0
  )
  const agentMentionCandidates = useMemo(
    () => agentExtensionSnapshot ? buildAgentMentionCandidates(agentExtensionSnapshot) : [],
    [agentExtensionSnapshot],
  )
  const filteredAgentMentionCandidates = useMemo(
    () => filterAgentMentionCandidates(agentMentionCandidates, agentMentionContext),
    [agentMentionCandidates, agentMentionContext],
  )

  const loadAgentExtensionSnapshot = useCallback(async (): Promise<AgentExtensionSnapshot> => {
    if (agentExtensionSnapshot) return agentExtensionSnapshot
    if (!agentExtensionSnapshotRequestRef.current) {
      agentExtensionSnapshotRequestRef.current = agentExtensions.snapshot()
        .then(snapshot => {
          setAgentExtensionSnapshot(snapshot)
          return snapshot
        })
        .finally(() => { agentExtensionSnapshotRequestRef.current = null })
    }
    return await agentExtensionSnapshotRequestRef.current
  }, [agentExtensionSnapshot])

  useEffect(() => { activeConversationRef.current = activeConversation }, [activeConversation])

  const cacheActiveConversation = useCallback(() => {
    const id = activeConversationRef.current
    if (!id || loadingConversation) return
    conversationCacheRef.current.set(id, {
      messages,
      hasMoreMessages,
      systemPrompt: systemPromptDraft,
    })
  }, [hasMoreMessages, loadingConversation, messages, systemPromptDraft])

  useEffect(() => {
    cacheActiveConversation()
  }, [cacheActiveConversation])

  useEffect(() => () => {
    if (deleteArmTimeoutRef.current) clearTimeout(deleteArmTimeoutRef.current)
  }, [])

  useEffect(() => {
    if (!conversationMenu) return
    const closeMenu = () => setConversationMenu(null)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }
    window.addEventListener('pointerdown', closeMenu)
    window.addEventListener('blur', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', closeMenu)
      window.removeEventListener('blur', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [conversationMenu])

  const scrollToBottom = useCallback((instant?: boolean) => {
    messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'auto' : 'smooth' })
  }, [])

  const handleMessagesScroll = useCallback(() => {
    const element = messagesScrollRef.current
    if (!element) return
    isNearBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 96
  }, [])

  useCachedPageEffect(() => {
    if (isSwitchingRef.current) {
      scrollToBottom(true)
      isSwitchingRef.current = false
      isNearBottomRef.current = true
    } else if (isNearBottomRef.current) {
      scrollToBottom(sending)
    }
  }, [messages, sending, scrollToBottom])

  // Load conversations and models
  useCachedPageEffect(() => {
    const init = async () => {
      setLoading(true)
      try {
        const [conversationPage, modelsData] = await Promise.all([
          GetEditorAiConversationPage(SCOPE_ID, 0, CONVERSATION_PAGE_SIZE),
          getLocalStoryAiModels().catch(() => null),
        ])
        setConversations(conversationPage.items || [])
        setHasMoreConversations(conversationPage.hasMore)
        if (modelsData) {
          const chatModels = modelsData.models.filter(supportsChat)
          const imageModels = modelsData.models.filter(supportsImageGeneration)
          setModels(modelsData)
          setSelectedModel(selectAvailableModel(chatModels, modelsData.defaultModel))
          setSelectedImageModel(selectAvailableModel(imageModels, modelsData.defaultImageModel))
        }
      } catch (error) {
        console.error('[AI] Failed to load data:', error)
      } finally { setLoading(false) }
    }
    void init()
  }, [])

  const loadMoreConversations = async () => {
    if (loadingMoreConversations || !hasMoreConversations) return
    setLoadingMoreConversations(true)
    try {
      const page = await GetEditorAiConversationPage(SCOPE_ID, conversations.length, CONVERSATION_PAGE_SIZE)
      setConversations(current => [...current, ...(page.items || [])])
      setHasMoreConversations(page.hasMore)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'))
    } finally {
      setLoadingMoreConversations(false)
    }
  }

  // Switch the visible conversation immediately, then reconcile its messages asynchronously.
  // Locally-created conversations skip the first empty fetch so it cannot overwrite an optimistic message.
  useCachedPageEffect(() => {
    const loadId = ++conversationLoadIdRef.current
    if (!activeConversation) {
      setMessages([])
      setHasMoreMessages(false)
      setShowSystemPrompt(false)
      setLoadingConversation(false)
      return
    }
    if (skipConversationLoadRef.current === activeConversation) {
      skipConversationLoadRef.current = null
      setSystemPromptDraft('')
      setHasMoreMessages(false)
      setLoadingConversation(false)
      return
    }

    const cached = conversationCacheRef.current.get(activeConversation)
    if (cached) {
      isSwitchingRef.current = true
      setMessages(cached.messages)
      setHasMoreMessages(cached.hasMoreMessages)
      setSystemPromptDraft(cached.systemPrompt)
      setLoadingConversation(false)
      return
    }

    setLoadingConversation(true)
    const loadMessages = async () => {
      try {
        const convo = await GetEditorAiConversationMessagesPage(activeConversation, '', '', MESSAGE_PAGE_SIZE)
        if (conversationLoadIdRef.current !== loadId || activeConversationRef.current !== activeConversation) return
        isSwitchingRef.current = true
        const loadedMessages = (convo.messages || []).map(mapEditorAiMessageDto)
        setMessages(loadedMessages)
        setHasMoreMessages(convo.hasMoreMessages)
        setSystemPromptDraft(convo.systemPrompt || '')
        conversationCacheRef.current.set(activeConversation, {
          messages: loadedMessages,
          hasMoreMessages: convo.hasMoreMessages,
          systemPrompt: convo.systemPrompt || '',
        })
      } catch (error) {
        if (conversationLoadIdRef.current !== loadId || activeConversationRef.current !== activeConversation) return
        console.error('[AI] Failed to load messages:', error)
      } finally {
        if (conversationLoadIdRef.current === loadId && activeConversationRef.current === activeConversation) {
          setLoadingConversation(false)
        }
      }
    }
    void loadMessages()
  }, [activeConversation])

  const loadEarlierMessages = async () => {
    const firstMessage = messages[0]
    const conversationID = activeConversationRef.current
    if (!conversationID || !firstMessage || loadingEarlierMessages || !hasMoreMessages) return

    const scrollElement = messagesScrollRef.current
    const previousScrollHeight = scrollElement?.scrollHeight ?? 0
    setLoadingEarlierMessages(true)
    isNearBottomRef.current = false
    try {
      const page = await GetEditorAiConversationMessagesPage(
        conversationID,
        firstMessage.createdAt,
        firstMessage.id,
        MESSAGE_PAGE_SIZE,
      )
      if (activeConversationRef.current !== conversationID) return
      const earlierMessages = (page.messages || []).map(mapEditorAiMessageDto)
      setMessages(current => {
        const existingIDs = new Set(current.map(message => message.id))
        return [...earlierMessages.filter(message => !existingIDs.has(message.id)), ...current]
      })
      setHasMoreMessages(page.hasMoreMessages)
      requestAnimationFrame(() => {
        if (scrollElement) scrollElement.scrollTop += scrollElement.scrollHeight - previousScrollHeight
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'))
    } finally {
      setLoadingEarlierMessages(false)
    }
  }

  const handleNewConversation = async () => {
    clearDeleteArm()
    setConversationMenu(null)
    setRenameTarget(null)
    try {
      const convo = await CreateEditorAiConversation({ scopeId: SCOPE_ID, title: t('admin.ai_new_chat') })
      setConversations(prev => [convo, ...prev])
      skipConversationLoadRef.current = convo.id
      activeConversationRef.current = convo.id
      setActiveConversation(convo.id)
      setMessages([])
      setHasMoreMessages(false)
      setLoadingConversation(false)
      setInput('')
      textareaRef.current?.focus()
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error('[AI] Create conversation failed:', msg)
      toast.error(msg)
    }
  }

  const clearDeleteArm = () => {
    if (deleteArmTimeoutRef.current) {
      clearTimeout(deleteArmTimeoutRef.current)
      deleteArmTimeoutRef.current = null
    }
    setPendingDeleteId(null)
  }

  const switchConversation = (id: string) => {
    clearDeleteArm()
    setConversationMenu(null)
    setRenameTarget(null)
    if (id === activeConversationRef.current) return

    cacheActiveConversation()
    activeConversationRef.current = id
    isSwitchingRef.current = true
    setActiveConversation(id)
    const cached = conversationCacheRef.current.get(id)
    setMessages(cached?.messages ?? [])
    setHasMoreMessages(cached?.hasMoreMessages ?? false)
    setShowSystemPrompt(false)
    setSystemPromptDraft(cached?.systemPrompt ?? '')
    setQuotedMessage(null)
    setLoadingConversation(!cached)
  }

  const handleDeleteConversation = async (id: string) => {
    if (deletingConversationId) return
    setDeletingConversationId(id)
    try {
      await DeleteEditorAiConversation(id)
      conversationCacheRef.current.delete(id)
      setConversations(prev => prev.filter(c => c.id !== id))
      if (activeConversation === id) {
        activeConversationRef.current = null
        setActiveConversation(null)
        setMessages([])
        setHasMoreMessages(false)
        setLoadingConversation(false)
      }
      if (renameTarget?.id === id) setRenameTarget(null)
      clearDeleteArm()
      toast.success(t('admin.ai_conversation_deleted'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'))
    } finally {
      setDeletingConversationId(current => current === id ? null : current)
    }
  }

  const handleDeleteClick = (id: string) => {
    if (deletingConversationId) return
    if (pendingDeleteId === id) {
      clearDeleteArm()
      void handleDeleteConversation(id)
      return
    }
    clearDeleteArm()
    setPendingDeleteId(id)
    deleteArmTimeoutRef.current = setTimeout(() => {
      setPendingDeleteId(current => current === id ? null : current)
      deleteArmTimeoutRef.current = null
    }, DELETE_ARM_TIMEOUT_MS)
  }

  const startRenamingConversation = (id: string, surface: ConversationRenameTarget['surface']) => {
    const conversation = conversations.find(item => item.id === id)
    if (!conversation) return
    clearDeleteArm()
    setConversationMenu(null)
    setConversationTitleDraft(conversation.title || t('admin.ai_new_chat'))
    setRenameTarget({ id, surface })
  }

  const commitConversationTitle = async (id: string) => {
    if (renameTarget?.id !== id) return
    const conversation = conversations.find(item => item.id === id)
    const title = conversationTitleDraft.replace(/\s+/g, ' ').trim()
    setRenameTarget(null)
    if (!conversation || !title || title === conversation.title) return
    setConversations(previous => previous.map(item =>
      item.id === id ? { ...item, title, updatedAt: new Date().toISOString() } : item,
    ))
    try {
      await UpdateEditorAiConversation(id, { title })
    } catch (error) {
      setConversations(previous => previous.map(item =>
        item.id === id ? { ...item, title: conversation.title } : item,
      ))
      toast.error(error instanceof Error ? error.message : t('admin.ai_rename_failed'))
    }
  }

  const handleGenerateConversationTitle = async (id: string) => {
    if (generatingTitleId) return
    clearDeleteArm()
    setConversationMenu(null)
    setRenameTarget(null)
    setGeneratingTitleId(id)
    try {
      const updated = await generateEditorAiConversationTitle(id, selectedModel || undefined)
      setConversations(previous => previous.map(item => item.id === id ? updated : item))
      toast.success(t('admin.ai_generate_title_success'))
    } catch (error) {
      const message = error instanceof Error && error.message === 'AI_CONVERSATION_EMPTY'
        ? t('admin.ai_generate_title_empty')
        : error instanceof Error && error.message !== 'AI_TITLE_EMPTY'
          ? error.message
          : t('admin.ai_generate_title_failed')
      toast.error(message)
    } finally {
      setGeneratingTitleId(current => current === id ? null : current)
    }
  }

  const handleClearConversation = async () => {
    if (!activeConversation) return
    try {
      await ClearEditorAiConversation(activeConversation)
      conversationCacheRef.current.set(activeConversation, {
        messages: [],
        hasMoreMessages: false,
        systemPrompt: systemPromptDraft,
      })
      setMessages([])
      setHasMoreMessages(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'))
    }
  }

  const handleSaveSystemPrompt = async () => {
    if (!activeConversation || savingPrompt) return
    setSavingPrompt(true)
    try {
      const trimmed = systemPromptDraft.trim()
      const updated = await UpdateEditorAiConversation(activeConversation, { systemPrompt: trimmed })
      setConversations(prev => prev.map(c => c.id === activeConversation ? { ...c, systemPrompt: updated.systemPrompt } : c))
      setSystemPromptDraft(updated.systemPrompt || ''); setShowSystemPrompt(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'))
    } finally { setSavingPrompt(false) }
  }

  const handleSelectImages = () => { fileInputRef.current?.click() }

  const removeAttachedImage = useCallback((id: string) => {
    setAttachedImages(prev => prev.filter(image => image.id !== id))
  }, [])

  const addImageFiles = useCallback(async (files: File[]) => {
    if (sending || files.length === 0) return
    const remainingSlots = Math.max(0, MAX_ATTACHED_IMAGES - attachedImages.length)
    const accepted = files
      .filter(file => (
        file.type.startsWith('image/')
        && file.size <= MAX_IMAGE_SIZE
        && (!imageMode || IMAGE_EDIT_MIME_TYPES.has(file.type))
      ))
      .slice(0, remainingSlots)

    if (accepted.length === 0) {
      toast.error(t(imageMode ? 'admin.ai_image_reference_format' : 'admin.ai_upload_failed'))
      return
    }

    const pending = accepted.map(file => ({
      id: `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
    }))
    setAttachedImages(prev => [
      ...prev,
      ...pending.map(({ id }) => ({ id, url: '', status: 'loading' as const })),
    ])

    await Promise.all(pending.map(async ({ id, file }) => {
      try {
        const dataUrl = await readImageAsDataUrl(file)
        setAttachedImages(prev => prev.map(image =>
          image.id === id
            ? { ...image, url: dataUrl, status: 'ready' as const }
            : image,
        ))
      } catch (error) {
        removeAttachedImage(id)
        toast.error(error instanceof Error ? error.message : t('admin.ai_upload_failed'))
      }
    }))
  }, [attachedImages.length, imageMode, removeAttachedImage, sending, t])

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (fileInputRef.current) fileInputRef.current.value = ''
    void addImageFiles(files)
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items)
      .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((file): file is File => Boolean(file))
    if (files.length === 0) return
    event.preventDefault()
    void addImageFiles(files)
  }

  const activeConvoData = conversations.find(c => c.id === activeConversation)
  const hasCustomPrompt = Boolean(activeConvoData?.systemPrompt)
  const chatModels = models?.models.filter(supportsChat) ?? []
  const imageModels = models?.models.filter(supportsImageGeneration) ?? []
  const activeModelLabel = imageMode ? (selectedImageModel || 'image model') : (selectedModel || 'default')

  const handleSend = async (overrides?: SendOverrides) => {
    const sendableImages = overrides?.images
      ? overrides.images.map(url => ({ id: url, url, status: 'ready' as const }))
      : attachedImages.filter(image => image.status === 'ready' && image.url)
    const rawUserInput = (overrides?.input ?? input).trim()
    if (sendInFlightRef.current || sending || loadingImages || (
      !rawUserInput
      && sendableImages.length === 0
    )) return

    if (imageMode && !selectedImageModel) {
      toast.error(t('admin.ai_image_model_required'))
      return
    }

    sendInFlightRef.current = true

    let conversationId = activeConversation
    const userInput = rawUserInput
    let mentionSnapshot = agentExtensionSnapshot
    if (!mentionSnapshot && /(^|\s)(\/[A-Za-z0-9_:-]+|@mcp:[^\s]+)/u.test(rawUserInput)) {
      try {
        mentionSnapshot = await loadAgentExtensionSnapshot()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '无法读取 Agent 扩展')
        sendInFlightRef.current = false
        return
      }
    }
    const mentionSelection = mentionSnapshot
      ? resolveAgentMentionSelection(rawUserInput, mentionSnapshot, [])
      : { selectedSkillIds: [], selectedMcpServerIds: [], hasExplicitMcpMention: false }
    const selectedMentionPrefix = ''

    if (!conversationId) {
      try {
        const convo = await CreateEditorAiConversation({ scopeId: SCOPE_ID, title: userInput.slice(0, 50) })
        setConversations(prev => [convo, ...prev])
        skipConversationLoadRef.current = convo.id
        activeConversationRef.current = convo.id
        setActiveConversation(convo.id)
        setLoadingConversation(false)
        conversationId = convo.id
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('common.error'))
        sendInFlightRef.current = false
        return
      }
    }

    const currentConversation = conversations.find(conversation => conversation.id === conversationId)
    const conversationTitle = currentConversation && (
      !currentConversation.title || currentConversation.title === t('admin.ai_new_chat')
    ) ? deriveConversationTitle(rawUserInput || userInput) : undefined
    if (conversationTitle) {
      setConversations(previous => previous.map(conversation =>
        conversation.id === conversationId
          ? { ...conversation, title: conversationTitle, updatedAt: new Date().toISOString() }
          : conversation,
      ))
      void UpdateEditorAiConversation(conversationId, { title: conversationTitle }).catch(error => {
        console.warn('[AI] Failed to update conversation title:', error)
      })
    }

    const quoted = quotedMessage
    const images = sendableImages.map(image => image.url)
    const promptWithMentions = selectedMentionPrefix ? `${selectedMentionPrefix} ${userInput}` : userInput
    const prompt = quoted ? `> ${quoted.content.split('\n').join('\n> ')}\n\n${promptWithMentions}` : promptWithMentions
    const now = new Date().toISOString()
    const userMessageId = createLocalMessageId('user')
    const assistantMessageId = createLocalMessageId('assistant')
    const optimisticUserMessage: EditorAiMessageDto = {
      id: userMessageId,
      conversationId,
      role: 'user',
      content: prompt,
      status: 'completed',
      createdAt: now,
      ...(images.length > 0 ? { metadata: { images } } : {}),
    }
    const optimisticAssistantMessage: EditorAiMessageDto = {
      id: assistantMessageId,
      conversationId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      model: imageMode ? selectedImageModel : selectedModel || undefined,
      createdAt: now,
    }

    setInput('')
    setQuotedMessage(null)
    setAttachedImages([])
    setSending(true)
    isNearBottomRef.current = true
    setMessages(previous => {
      const next = [...previous, optimisticUserMessage, optimisticAssistantMessage]
      conversationCacheRef.current.set(conversationId, {
        messages: next,
        hasMoreMessages,
        systemPrompt: systemPromptDraft,
      })
      return next
    })
    setLiveTrace([])
    liveTraceRef.current = []
    setLiveTraceMessageId(assistantMessageId)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    const generationStartedAt = performance.now()

    const abortController = new AbortController()
    abortRef.current = abortController
    let accumulated = ''

    const updateAssistantMessage = (
      updater: (message: EditorAiMessageDto) => EditorAiMessageDto,
    ) => {
      const updateMessages = (items: EditorAiMessageDto[]) => items.map(message =>
        message.id === assistantMessageId ? updater(message) : message,
      )
      const cached = conversationCacheRef.current.get(conversationId)
      if (cached) {
        conversationCacheRef.current.set(conversationId, {
          ...cached,
          messages: updateMessages(cached.messages),
        })
      }
      if (activeConversationRef.current === conversationId) {
        setMessages(updateMessages)
      }
    }

    const updateAssistant = (content: string, status: EditorAiMessageStatus, error?: string) => {
      updateAssistantMessage(message =>
        message.id === assistantMessageId
          ? { ...message, content, status, error }
          : message,
      )
    }

    const commitTraceToAssistant = (blocks: EditorAiTraceBlock[]) => {
      const traceMetadata = editorAiMessageMetadataSchema.safeParse({
        type: 'assistant_trace',
        blocks,
        durationMs: Math.max(0, Math.round(performance.now() - generationStartedAt)),
      })
      if (!traceMetadata.success) return
      updateAssistantMessage(message => ({ ...message, metadata: traceMetadata.data }))
    }

    try {
      if (imageMode) {
        const port = await ensureAiPort()
        if (!port) throw new Error('AI 服务未启动')

        const imagePrompt = await prepareDesktopImagePrompt({
          prompt,
          model: selectedModel || undefined,
          images,
          selectedAgentSkillIds: mentionSelection.selectedSkillIds,
          signal: abortController.signal,
          onEvent: (event) => {
            liveTraceRef.current = reduceEditorAiTrace(liveTraceRef.current, event)
            setLiveTrace(liveTraceRef.current)
          },
        })

        const response = await fetch(`http://127.0.0.1:${port}/ai/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId,
            action: 'custom',
            prompt: imagePrompt,
            userPrompt: prompt,
            generateImage: true,
            imageModel: selectedImageModel || undefined,
            imageSize: selectedImageSize,
            title: conversationTitle,
            images: images.length > 0 ? images : undefined,
          }),
          signal: abortController.signal,
        })
        if (!response.ok) throw new Error(await response.text().catch(() => 'Unknown error'))
        if (!response.body) throw new Error('AI response stream is unavailable')

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let sseBuffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          sseBuffer += decoder.decode(value, { stream: true })
          const parts = sseBuffer.split('\n\n')
          sseBuffer = parts.pop() || ''
          for (const part of parts) {
            let eventName = 'message'
            let data = ''
            for (const line of part.split('\n')) {
              if (line.startsWith('event:')) eventName = line.slice(6).trim()
              else if (line.startsWith('data:')) data = line.slice(5).trim()
            }
            if (eventName === 'chunk' && data) {
              try { accumulated += JSON.parse(data) } catch { accumulated += data }
              updateAssistant(accumulated, 'streaming')
            } else if (eventName === 'status' && data) {
              try { accumulated = JSON.parse(data) } catch { accumulated = data }
              updateAssistant(accumulated, 'streaming')
            } else if (eventName === 'error' && data) {
              let message = data
              try { message = JSON.parse(data) } catch { /* ignore */ }
              throw new Error(message)
            }
          }
        }
        commitTraceToAssistant(liveTraceRef.current)

        const convo = await GetEditorAiConversationMessagesPage(conversationId, '', '', MESSAGE_PAGE_SIZE)
        if (activeConversationRef.current === conversationId) {
          const persistedMessages = (convo.messages || []).map(mapEditorAiMessageDto)
          setHasMoreMessages(convo.hasMoreMessages)
          const persistedUserMessage = persistedMessages.at(-2)
          const persistedAssistantMessage = persistedMessages.at(-1)
          const persistedAssistantWithDuration = persistedAssistantMessage?.role === 'assistant'
            ? { ...persistedAssistantMessage, metadata: withGenerationDuration(persistedAssistantMessage.metadata, Math.max(0, Math.round(performance.now() - generationStartedAt))) }
            : persistedAssistantMessage
          setPersistedMessageIds(previous => ({
            ...previous,
            ...(persistedUserMessage?.role === 'user' ? { [userMessageId]: persistedUserMessage.id } : {}),
            ...(persistedAssistantWithDuration?.role === 'assistant' ? { [assistantMessageId]: persistedAssistantWithDuration.id } : {}),
          }))
          setMessages(previous => previous.map(message => {
            if (message.id === userMessageId && persistedUserMessage?.role === 'user') {
              return { ...message, ...persistedUserMessage, id: userMessageId }
            }
            if (message.id === assistantMessageId && persistedAssistantWithDuration?.role === 'assistant') {
              return { ...message, ...persistedAssistantWithDuration, id: assistantMessageId }
            }
            return message
          }))
        }
        setConversations(prev => prev.map(c => c.id === conversationId
          ? { ...c, title: convo.title, updatedAt: convo.updatedAt }
          : c))
      } else {
        await streamDesktopAgentGenerate({
          conversationId,
          action: 'custom',
          prompt,
          model: selectedModel || undefined,
          title: conversationTitle,
          images: images.length > 0 ? images : undefined,
          useAgentExtensions: true,
          useAgentMcpTools: true,
          ...(mentionSelection.selectedSkillIds.length > 0
            ? { selectedAgentSkillIds: mentionSelection.selectedSkillIds }
            : {}),
          ...(mentionSelection.hasExplicitMcpMention
            ? { enabledAgentMcpServerIds: mentionSelection.selectedMcpServerIds }
            : {}),
        }, {
          onChunk: (chunk) => {
            accumulated += chunk
            updateAssistant(accumulated, 'streaming')
          },
          onEvent: (event: EditorAiStreamEvent) => {
            liveTraceRef.current = reduceEditorAiTrace(liveTraceRef.current, event)
            setLiveTrace(liveTraceRef.current)
          },
          onPersisted: (messageIds) => {
            setPersistedMessageIds(previous => ({
              ...previous,
              [userMessageId]: messageIds.userMessageId,
              [assistantMessageId]: messageIds.assistantMessageId,
            }))
          },
          signal: abortController.signal,
        })
        updateAssistant(accumulated, 'completed')
        commitTraceToAssistant(liveTraceRef.current)
        setConversations(prev => prev.map(c => c.id === conversationId
          ? { ...c, updatedAt: new Date().toISOString() }
          : c))
      }
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError'
      const errorMessage = aborted ? t('admin.ai_generation_stopped') : error instanceof Error ? error.message : t('common.error')
      updateAssistant(accumulated, aborted ? 'stopped' : 'failed', errorMessage)
      commitTraceToAssistant(liveTraceRef.current)
      if (!aborted) toast.error(errorMessage)
    } finally {
      abortRef.current = null
      sendInFlightRef.current = false
      setSending(false)
    }
  }

  const handleStop = () => { abortRef.current?.abort() }

  const handleRetry = (message: EditorAiMessageDto) => {
    if (sending || message.status === 'streaming') return
    const messageIndex = messages.findIndex(item => item.id === message.id)
    const sourceUser = messageIndex < 0 ? null : [...messages.slice(0, messageIndex)].reverse().find(item => item.role === 'user')
    if (!sourceUser) return
    setMessages(current => current.filter(item => item.id !== message.id))
    const images = getMessageImages(sourceUser.metadata).map(image => image.url)
    void handleSend({ input: sourceUser.content, images })
  }

  const handleBranch = async (message: EditorAiMessageDto) => {
    if (sending || branchingMessageId || !activeConversation) return
    setBranchingMessageId(message.id)
    try {
      const sourceConversation = conversations.find(item => item.id === activeConversation)
      const title = `${sourceConversation?.title || t('admin.ai_new_chat')} - ${t('admin.ai_branch')}`.slice(0, 200)
      let branchSourceMessages = messages
      let branchHasMoreMessages = hasMoreMessages
      while (branchHasMoreMessages && branchSourceMessages.length > 0) {
        const firstMessage = branchSourceMessages[0]!
        const page = await GetEditorAiConversationMessagesPage(activeConversation, firstMessage.createdAt, firstMessage.id, MESSAGE_PAGE_SIZE)
        const existingIds = new Set(branchSourceMessages.map(item => item.id))
        const earlierMessages = (page.messages || []).map(mapEditorAiMessageDto).filter(item => !existingIds.has(item.id))
        if (earlierMessages.length === 0) break
        branchSourceMessages = [...earlierMessages, ...branchSourceMessages]
        branchHasMoreMessages = page.hasMoreMessages
      }
      const messageIndex = branchSourceMessages.findIndex(item => item.id === message.id)
      if (messageIndex < 0) return
      const branch = await CreateEditorAiConversation({
        scopeId: SCOPE_ID,
        title,
        ...(sourceConversation?.systemPrompt ? { systemPrompt: sourceConversation.systemPrompt } : {}),
      })
      const copiedMessages: EditorAiMessageDto[] = []
      for (const source of branchSourceMessages.slice(0, messageIndex + 1)) {
        if (source.role !== 'user' && source.role !== 'assistant') continue
        const appendInput: EditorAiMessageAppendInput = {
          role: source.role,
          content: source.content,
          status: source.status === 'streaming' ? 'completed' : source.status,
          ...(source.model ? { model: source.model } : {}),
          ...(source.action ? { action: source.action } : {}),
          ...(source.metadata === undefined ? {} : { metadata: source.metadata }),
          ...(source.error ? { error: source.error } : {}),
        }
        copiedMessages.push(await appendLocalEditorAiMessage(branch.id, appendInput))
      }
      setConversations(previous => [branch, ...previous])
      conversationCacheRef.current.set(branch.id, { messages: copiedMessages, hasMoreMessages: false, systemPrompt: sourceConversation?.systemPrompt || '' })
      clearDeleteArm()
      setConversationMenu(null)
      setRenameTarget(null)
      activeConversationRef.current = branch.id
      setActiveConversation(branch.id)
      setMessages(copiedMessages)
      setHasMoreMessages(false)
      setLoadingConversation(false)
      toast.success(t('admin.ai_branch_created'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'))
    } finally {
      setBranchingMessageId(null)
    }
  }

  const handleCopy = async (content: string, id: string) => {
    try { await navigator.clipboard.writeText(content); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000) } catch { /* ignore */ }
  }

  const handleQuote = (msg: EditorAiMessageDto) => { setQuotedMessage(msg); textareaRef.current?.focus() }

  const selectAgentMention = useCallback((candidate: AgentMentionCandidate) => {
    if (!agentMentionContext) return
    const replacement = removeAgentMentionQuery(input, agentMentionContext)
    // Insert the full token (e.g., /ui-ux-pro-max or @mcp:server) into the text
    const before = replacement.text.slice(0, replacement.caret)
    const after = replacement.text.slice(replacement.caret)
    const newText = before + candidate.token + ' ' + after
    const newCaret = replacement.caret + candidate.token.length + 1

    setInput(newText)
    setAgentMentionContext(null)
    setAgentMentionActiveIndex(0)
    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.focus()
      textarea.setSelectionRange(newCaret, newCaret)
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    })
  }, [agentMentionContext, input])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    if (agentMentionContext) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setAgentMentionContext(null)
        return
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (filteredAgentMentionCandidates.length > 0) {
          const direction = e.key === 'ArrowDown' ? 1 : -1
          setAgentMentionActiveIndex(current => (
            (current + direction + filteredAgentMentionCandidates.length) % filteredAgentMentionCandidates.length
          ))
        }
        return
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && filteredAgentMentionCandidates.length > 0) {
        e.preventDefault()
        selectAgentMention(filteredAgentMentionCandidates[Math.min(agentMentionActiveIndex, filteredAgentMentionCandidates.length - 1)]!)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`

    let value = el.value
    const caret = el.selectionStart ?? el.value.length

    // Auto-add space after complete skill tokens (e.g., /ui-ux-pro-max)
    // Check if user just typed a character that completes a token
    const beforeCaret = value.slice(0, caret)
    const afterCaret = value.slice(caret)
    const match = beforeCaret.match(/(\s|^)(\/[A-Za-z0-9_:-]+)$/)

    if (match && !afterCaret.startsWith(' ') && afterCaret !== '') {
      // Complete token found at cursor, and next char is not a space
      // Check if this token is valid by seeing if it would trigger mention context
      const testContext = findAgentMentionContext(value, caret)
      if (!testContext) {
        // Token is complete and valid, add space
        value = beforeCaret + ' ' + afterCaret
        setInput(value)
        requestAnimationFrame(() => {
          el.setSelectionRange(caret + 1, caret + 1)
        })
      } else {
        setInput(value)
      }
    } else {
      setInput(value)
    }

    const context = findAgentMentionContext(value, caret)
    setAgentMentionContext(context)
    setAgentMentionActiveIndex(0)
    if (context) void loadAgentExtensionSnapshot().catch(error => console.warn('[Agent mentions] Failed to load extensions:', error))
  }

  const refreshAgentMentionContext = (event: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const element = event.currentTarget
    setAgentMentionContext(findAgentMentionContext(element.value, element.selectionStart ?? element.value.length))
    setAgentMentionActiveIndex(0)
  }

  if (loading) return (
    <div className="flex-1 flex overflow-hidden">
      <div className="w-64 border-r p-3 space-y-2 shrink-0" style={{ borderColor: 'var(--border)' }}>
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
      <div className="flex-1 p-6 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-3/4" />)}
      </div>
    </div>
  )

  return (
    <div className="flex-1 flex overflow-hidden">
      <input ref={fileInputRef} type="file" accept={imageMode ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,image/gif,image/avif"} multiple onChange={handleFilesSelected} className="hidden" />

      {/* ── Conversation Sidebar (desktop-style: fixed, scrollable, no animations) ── */}
      {showSidebar && (
        <ConversationSidebar
          conversations={conversations}
          hasMoreConversations={hasMoreConversations}
          loadingMoreConversations={loadingMoreConversations}
          activeConversation={activeConversation}
          deletingConversationId={deletingConversationId}
          pendingDeleteId={pendingDeleteId}
          renameTarget={renameTarget}
          conversationTitleDraft={conversationTitleDraft}
          generatingTitleId={generatingTitleId}
          activeModelLabel={activeModelLabel}
          t={t}
          onNew={handleNewConversation}
          onSwitch={switchConversation}
          onLoadMore={loadMoreConversations}
          onStartRename={startRenamingConversation}
          onCommitTitle={commitConversationTitle}
          onTitleDraftChange={setConversationTitleDraft}
          onCancelRename={() => setRenameTarget(null)}
          onDeleteClick={handleDeleteClick}
          onConversationMenu={setConversationMenu}
        />
      )}

      {/* ── Main Chat Area ── */}
      <div className="flex-1 flex flex-col min-w-0" style={{ backgroundColor: 'var(--background)' }}>
        {/* Chat header: compact toolbar */}
        <div className="flex items-center gap-2 px-3 h-11 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-accent"
            style={{ color: 'var(--muted-foreground)' }}
            aria-label={showSidebar ? t('admin.ai_hide_sidebar') : t('admin.ai_show_sidebar')}
          >
            {showSidebar ? <PanelLeftClose size={15} /> : <PanelLeft size={15} />}
          </button>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            {activeConversation && renameTarget?.id === activeConversation && renameTarget.surface === 'header' ? (
              <input
                autoFocus
                value={conversationTitleDraft}
                onChange={event => setConversationTitleDraft(event.target.value)}
                onFocus={event => event.currentTarget.select()}
                onBlur={() => void commitConversationTitle(activeConversation)}
                onKeyDown={event => {
                  if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
                  else if (event.key === 'Escape') { event.preventDefault(); setRenameTarget(null) }
                }}
                maxLength={200}
                className="h-7 min-w-0 flex-1 rounded border bg-transparent px-2 text-xs font-medium outline-none"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                aria-label={t('admin.ai_rename_conversation')}
              />
            ) : (
              <span
                className="min-w-0 truncate text-xs font-medium"
                style={{ color: 'var(--foreground)' }}
                onDoubleClick={() => { if (activeConversation) startRenamingConversation(activeConversation, 'header') }}
                title={activeConversation ? t('admin.ai_rename_conversation') : undefined}
              >
                {activeConvoData?.title || t('admin.ai_assistant')}
              </span>
            )}
            {hasCustomPrompt && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
          </div>

          <div className="flex items-center gap-1">
            {activeConversation && (
              <button
                onClick={() => { setShowSystemPrompt(!showSystemPrompt); if (!showSystemPrompt) setSystemPromptDraft(activeConvoData?.systemPrompt || '') }}
                className="flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-accent"
                style={{ color: showSystemPrompt || hasCustomPrompt ? '#f59e0b' : 'var(--muted-foreground)' }}
                title={t('admin.ai_system_prompt')}
              >
                <Settings2 size={13} />
              </button>
            )}
            {activeConversation && messages.length > 0 && (
              <button
                onClick={handleClearConversation}
                className="flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-accent"
                style={{ color: 'var(--muted-foreground)' }}
                title={t('admin.ai_clear')}
              >
                <Eraser size={13} />
              </button>
            )}
          </div>
        </div>

        {/* System prompt editor */}
        {showSystemPrompt && (
          <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)/10' }}>
            <div className="max-w-[44rem] mx-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>{t('admin.ai_system_prompt_title')}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSystemPromptDraft('')} className="text-[10px] px-2 py-1 rounded hover:bg-accent" style={{ color: 'var(--muted-foreground)' }}>{t('admin.ai_system_prompt_reset')}</button>
                  <button onClick={handleSaveSystemPrompt} disabled={savingPrompt}
                    className="text-[10px] font-semibold px-3 py-1 rounded disabled:opacity-30"
                    style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}>
                    {savingPrompt ? t('admin.ai_system_prompt_saving') : t('admin.ai_system_prompt_save')}
                  </button>
                </div>
              </div>
              <textarea value={systemPromptDraft} onChange={e => setSystemPromptDraft(e.target.value)} placeholder={t('admin.ai_system_prompt_placeholder')} rows={2}
                className="w-full resize-none border rounded px-3 py-2 text-xs outline-none leading-relaxed"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }} />
            </div>
          </div>
        )}

        <AgentToolApprovalBar conversationId={activeConversation} />

        {/* Messages area: clean, flat, minimal scrollbar */}
        <div ref={messagesScrollRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto custom-scrollbar">
          {loadingConversation && activeConversation ? (
            <div className="flex h-full items-center justify-center" style={{ color: 'var(--muted-foreground)' }}>
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : !activeConversation && messages.length === 0 && !sending ? (
            <DesktopEmptyState t={t} textareaRef={textareaRef} setInput={setInput} />
          ) : (
            <div className="max-w-[48rem] mx-auto px-4 py-4">
              {hasMoreMessages && (
                <button
                  type="button"
                  disabled={loadingEarlierMessages}
                  onClick={() => void loadEarlierMessages()}
                  className="flex h-7 w-full items-center justify-center gap-1.5 text-[11px] rounded hover:bg-accent disabled:opacity-50 mb-4"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  {loadingEarlierMessages && <Loader2 size={12} className="animate-spin" />}
                  {t('admin.ai_load_earlier_messages')}
                </button>
              )}

              {/* Messages rendered as a flat timeline, no bubbles */}
              {messages.map((msg) => (
                <DesktopMessageBubble
                  key={msg.id}
                  message={msg}
                  persistedMessageId={persistedMessageIds[msg.id]}
                  trace={msg.id === liveTraceMessageId ? liveTrace : undefined}
                  copiedId={copiedId}
                  onCopy={handleCopy}
                  onQuote={handleQuote}
                  onRetry={handleRetry}
                  onBranch={handleBranch}
                  branching={branchingMessageId === msg.id}
                  skills={agentExtensionSnapshot?.skills ?? []}
                  t={t}
                />
              ))}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Input area: flat, integrated, toolbar-style ── */}
        <div className="border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="max-w-[48rem] mx-auto">
            {/* Quoted message */}
            {quotedMessage && (
              <div className="flex items-start gap-2 px-4 pt-3">
                <div className="flex-1 flex items-start gap-2 px-3 py-2 rounded border-l-2" style={{ borderColor: 'var(--muted-foreground)', backgroundColor: 'var(--muted)/10' }}>
                  <Quote size={11} className="shrink-0 mt-0.5" style={{ color: 'var(--muted-foreground)' }} />
                  <p className="flex-1 text-[11px] line-clamp-1" style={{ color: 'var(--muted-foreground)' }}>{quotedMessage.content}</p>
                  <button onClick={() => setQuotedMessage(null)} className="shrink-0 p-0.5 rounded hover:bg-accent" style={{ color: 'var(--muted-foreground)' }}><X size={11} /></button>
                </div>
              </div>
            )}

            {/* Attached images */}
            {attachedImages.length > 0 && (
              <div className="flex items-center gap-2 px-4 pt-3 flex-wrap">
                {attachedImages.map((img) => (
                  <div key={img.id} className="relative group w-12 h-12 rounded overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => removeAttachedImage(img.id)}
                      className="absolute top-0.5 right-0.5 p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ backgroundColor: 'var(--background)' }}><X size={9} /></button>
                    {img.status === 'loading' && (
                      <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'var(--background)' }}>
                        <Loader2 size={14} className="animate-spin" style={{ color: 'var(--muted-foreground)' }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Model + image controls row: model selector (left) → image toggle (center) → size selector (right, conditional) */}
            <div className="flex items-center gap-2 px-4 pb-1 pt-3">
              {/* Model selector: switches between chat/image models based on mode */}
              {(imageMode ? imageModels : chatModels).length > 0 && (
                <div className="w-48">
                  <SelectDropdown
                    value={imageMode ? selectedImageModel : selectedModel}
                    options={(imageMode ? imageModels : chatModels).map(m => ({ value: m.id, label: m.label }))}
                    onChange={(val) => imageMode ? setSelectedImageModel(val as string) : setSelectedModel(val as string)}
                    placeholder="选择模型"
                    size="sm"
                    icon={Sparkles}
                    disabled={sending}
                    placement="top"
                  />
                </div>
              )}

              {/* Image mode toggle: matches SelectDropdown style, icon only */}
              <button
                type="button"
                onClick={() => setImageMode(prev => !prev)}
                disabled={sending}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-all disabled:opacity-30"
                style={{
                  borderColor: imageMode ? '#f59e0b' : 'var(--border)',
                  backgroundColor: imageMode ? '#f59e0b/10' : 'var(--background)',
                  color: imageMode ? '#f59e0b' : 'var(--muted-foreground)',
                }}
                title={t('admin.ai_image_mode')}
              >
                <ImageIcon size={14} />
              </button>

              {/* Size selector: only visible in image mode */}
              {imageMode && (
                <div className="w-32 transition-all duration-200 ease-out" style={{ animation: 'slideInFromRight 200ms ease-out' }}>
                  <SelectDropdown
                    value={selectedImageSize}
                    options={[
                      { value: 'auto', label: '⊡ 自动' },
                      { value: '1024x1024', label: '□ 1:1' },
                      { value: '1024x1792', label: '▯ 9:16' },
                      { value: '1792x1024', label: '▬ 16:9' },
                    ]}
                    onChange={(val) => setSelectedImageSize(val as string)}
                    size="sm"
                    disabled={sending}
                    placement="top"
                  />
                </div>
              )}
            </div>

            {/* Textarea + toolbar row */}
            <div className="relative flex items-end gap-2 px-4 py-3">
              {/* Agent mention menu: positioned above the textarea */}
              {agentMentionContext && agentExtensionSnapshot && (
                <AgentMentionMenu
                  candidates={filteredAgentMentionCandidates}
                  activeIndex={Math.min(agentMentionActiveIndex, Math.max(0, filteredAgentMentionCandidates.length - 1))}
                  onSelect={selectAgentMention}
                />
              )}

              <div className="flex-1 flex flex-col min-w-0 relative">
                {/* Highlighted text overlay */}
                <div
                  className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-sm leading-6 px-0"
                  aria-hidden="true"
                >
                  {input.split(/(\s+)/).map((segment, i) => {
                    // Highlight /skill tokens
                    if (/^\/[A-Za-z0-9_:-]+$/.test(segment)) {
                      return (
                        <span key={i} className="rounded bg-amber-500/20 px-0.5 text-amber-600 dark:text-amber-400">
                          {segment}
                        </span>
                      )
                    }
                    // Highlight @mcp:server tokens
                    if (/^@mcp:[^\s]+$/.test(segment)) {
                      return (
                        <span key={i} className="rounded bg-cyan-500/20 px-0.5 text-cyan-600 dark:text-cyan-400">
                          {segment}
                        </span>
                      )
                    }
                    return <span key={i} style={{ color: 'var(--foreground)' }}>{segment}</span>
                  })}
                </div>

                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={autoResize}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  onSelect={refreshAgentMentionContext}
                  onBlur={() => setAgentMentionContext(null)}
                  role="combobox"
                  aria-haspopup="listbox"
                  aria-expanded={Boolean(agentMentionContext && agentExtensionSnapshot)}
                  aria-controls={agentMentionContext ? 'agent-mention-listbox' : undefined}
                  aria-activedescendant={agentMentionContext && filteredAgentMentionCandidates.length > 0 ? `agent-mention-option-${Math.min(agentMentionActiveIndex, filteredAgentMentionCandidates.length - 1)}` : undefined}
                  aria-autocomplete="list"
                  placeholder={t('admin.ai_input_placeholder')}
                  rows={1}
                  disabled={sending}
                  className="relative z-10 w-full resize-none bg-transparent text-sm leading-6 outline-none disabled:opacity-40"
                  style={{
                    color: 'transparent',
                    caretColor: 'var(--foreground)',
                    maxHeight: 160,
                    minHeight: 36,
                  }}
                />
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1 shrink-0 pb-0.5">
                <button
                  type="button"
                  onClick={handleSelectImages}
                  disabled={sending || loadingImages}
                  className="flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-accent disabled:opacity-30"
                  style={{ color: 'var(--muted-foreground)' }}
                  title={t('admin.ai_attach_image')}
                >
                  <Paperclip size={14} />
                </button>

                {sending ? (
                  <button
                    onClick={handleStop}
                    className="flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-accent"
                    style={{ color: 'var(--muted-foreground)' }}
                    title={t('admin.ai_stop')}
                  >
                    <Square size={13} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    onClick={() => void handleSend()}
                    disabled={!canSend}
                    className="flex h-7 w-7 items-center justify-center rounded transition-colors disabled:opacity-20"
                    style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}
                    title={t('admin.ai_send')}
                  >
                    <Send size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Bottom bar: keyboard hints only */}
            <div className="flex items-center justify-end px-4 pb-2.5">
              <span className="text-[9px] select-none" style={{ color: 'var(--muted-foreground)', opacity: 0.5 }}>Enter 发送 · Shift+Enter 换行</span>
            </div>
          </div>
        </div>
      </div>

      {/* Conversation context menu */}
      {conversationMenu && createPortal(
        <div
          role="menu"
          className="fixed z-[100] min-w-40 rounded-md border p-1 shadow-xl"
          style={{ left: conversationMenu.x, top: conversationMenu.y, borderColor: 'var(--border)', backgroundColor: 'var(--background)' }}
          onPointerDown={event => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            disabled={Boolean(generatingTitleId)}
            onClick={() => void handleGenerateConversationTitle(conversationMenu.id)}
            className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-50"
            style={{ color: 'var(--foreground)' }}
          >
            {generatingTitleId === conversationMenu.id
              ? <Loader2 size={14} className="animate-spin" />
              : <Sparkles size={14} />}
            {t('admin.ai_generate_title')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => startRenamingConversation(conversationMenu.id, 'sidebar')}
            className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs transition-colors hover:bg-accent"
            style={{ color: 'var(--foreground)' }}
          >
            <Pencil size={14} />
            {t('admin.ai_rename_conversation')}
          </button>
        </div>,
        document.body,
      )}
    </div>
  )
}
