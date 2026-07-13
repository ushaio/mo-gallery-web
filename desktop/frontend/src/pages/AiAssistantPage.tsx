import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/LanguageContext'
import type {
  AiImageMetadata,
  EditorAiConversationDto,
  EditorAiMessageDto,
  EditorAiMessageStatus,
  StoryAiModelOption,
  StoryAiModelsResponse,
} from '@/lib/api/types'
// Text chat shares the editor AI pipeline (agent package, local proxy, and conversation database).
// Image generation continues to use the local /ai/generate endpoint.
import {
  editorAiLocal,
  generateEditorAiConversationTitle,
  getLocalStoryAiModels,
  mapEditorAiMessageDto,
} from '@/lib/api/editor-ai-local'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Skeleton } from '@/components/admin/Skeleton'
import {
  ClearEditorAiConversation,
  CreateEditorAiConversation,
  DeleteEditorAiConversation,
  DownloadMessageImageToLocal,
  GetAiHttpPort,
  GetAiImageDataURL,
  GetEditorAiConversation,
  GetEditorAiConversations,
  SaveMessageImageToAlbum,
  UpdateEditorAiConversation,
} from '../../wailsjs/go/main/App'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Send, MessageSquare, X, ChevronLeft, ChevronDown,
  Copy, Check, Eraser, Sparkles, Search, Quote, StopCircle,
  Settings2, RotateCcw, Paperclip, Loader2, Image as ImageIcon, Pencil, Trash2, Download,
} from 'lucide-react'

// Local AI HTTP service port
let aiHttpPort = 0

async function ensureAiPort() {
  if (!aiHttpPort) {
    aiHttpPort = await GetAiHttpPort()
  }
  return aiHttpPort
}

const SCOPE_ID = 'ai-assistant'
const MAX_ATTACHED_IMAGES = 10
const MAX_IMAGE_SIZE = 20 * 1024 * 1024
const IMAGE_EDIT_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const DELETE_ARM_TIMEOUT_MS = 3000

type AttachedImage = {
  id: string
  url: string
  status: 'loading' | 'ready'
}

type ConversationRenameTarget = {
  id: string
  surface: 'sidebar' | 'header'
}

function createLocalMessageId(role: 'user' | 'assistant'): string {
  return `local-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function deriveConversationTitle(prompt: string): string {
  return prompt.replace(/\s+/g, ' ').trim().slice(0, 40)
}

function supportsChat(model: StoryAiModelOption): boolean {
  return !model.capabilities || model.capabilities.includes('chat')
}

function supportsImageGeneration(model: StoryAiModelOption): boolean {
  return model.capabilities?.includes('image') === true
}

function selectAvailableModel(models: StoryAiModelOption[], preferred: string | undefined): string {
  return models.some(model => model.id === preferred) ? preferred ?? '' : models[0]?.id ?? ''
}

type MessageImageRef = {
  url: string
  photoId?: string
}

function getMessageImages(metadata: unknown): MessageImageRef[] {
  if (!metadata || typeof metadata !== 'object' || !('images' in metadata)) return []
  const images = (metadata as { images?: unknown }).images
  if (!Array.isArray(images)) return []
  return images.flatMap((image) => {
    if (typeof image === 'string') return image ? [{ url: image }] : []
    if (image && typeof image === 'object' && 'url' in image && typeof image.url === 'string' && image.url) {
      return [{
        url: image.url,
        ...('photoId' in image && typeof image.photoId === 'string' ? { photoId: image.photoId } : {}),
      }]
    }
    return []
  })
}

async function downloadMessageImageToLocal(imageUrl: string, t: (key: string) => string): Promise<void> {
  try {
    const filePath = await DownloadMessageImageToLocal(imageUrl)
    if (filePath) toast.success(t('admin.ai_downloaded_to_local'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('admin.ai_download_to_local_failed'))
    throw error
  }
}

function useImageContextMenu(
  savedInitially: boolean,
  onSave: () => Promise<void>,
  onDownload: () => Promise<void>,
) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [saved, setSaved] = useState(savedInitially)

  useEffect(() => {
    if (savedInitially) setSaved(true)
  }, [savedInitially])

  useEffect(() => {
    if (!contextMenu) return
    const closeMenu = () => setContextMenu(null)
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
  }, [contextMenu])

  const handleContextMenu = (event: React.MouseEvent<HTMLImageElement>) => {
    event.preventDefault()
    const menuWidth = 176
    const menuHeight = 84
    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
    })
  }

  const handleSave = async () => {
    if (saving || saved) return
    setContextMenu(null)
    setSaving(true)
    try {
      await onSave()
      setSaved(true)
    } catch {
      // The save callback reports the user-facing error.
    } finally {
      setSaving(false)
    }
  }

  const handleDownload = async () => {
    if (downloading) return
    setContextMenu(null)
    setDownloading(true)
    try {
      await onDownload()
    } catch {
      // The download callback reports the user-facing error.
    } finally {
      setDownloading(false)
    }
  }

  return { contextMenu, saving, downloading, saved, handleContextMenu, handleSave, handleDownload }
}

function ImageContextMenu({
  position,
  saving,
  downloading,
  saved,
  onSave,
  onDownload,
  t,
}: {
  position: { x: number; y: number } | null
  saving: boolean
  downloading: boolean
  saved: boolean
  onSave: () => Promise<void>
  onDownload: () => Promise<void>
  t: (key: string) => string
}) {
  if (!position || typeof document === 'undefined') return null
  return createPortal(
    <div
      role="menu"
      className="fixed z-50 min-w-44 rounded-md border p-1 shadow-xl"
      style={{
        left: position.x,
        top: position.y,
        borderColor: 'var(--border)',
        backgroundColor: 'var(--background)',
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        disabled={saving || saved}
        onClick={() => void onSave()}
        className="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-default disabled:opacity-50"
        style={{ color: 'var(--foreground)' }}
      >
        {saving ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />}
        {saved ? t('admin.ai_saved_to_album') : t('admin.ai_save_to_album')}
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={downloading}
        onClick={() => void onDownload()}
        className="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-default disabled:opacity-50"
        style={{ color: 'var(--foreground)' }}
      >
        {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        {t('admin.ai_download_to_local')}
      </button>
    </div>,
    document.body,
  )
}

function MessageImage({
  messageId,
  image,
  t,
}: {
  messageId: string
  image: MessageImageRef
  t: (key: string) => string
}) {
  const saveState = useImageContextMenu(
    Boolean(image.photoId),
    async () => {
      try {
        await SaveMessageImageToAlbum(messageId, image.url)
        toast.success(t('admin.ai_saved_to_album'))
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('admin.ai_save_to_album_failed'))
        throw error
      }
    },
    () => downloadMessageImageToLocal(image.url, t),
  )

  return (
    <div className="relative max-w-[200px] rounded-md overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
      <img
        src={image.url}
        alt=""
        className="max-h-[200px] object-contain"
        loading="lazy"
        onContextMenu={saveState.handleContextMenu}
      />
      <ImageContextMenu
        position={saveState.contextMenu}
        saving={saveState.saving}
        downloading={saveState.downloading}
        saved={saveState.saved}
        onSave={saveState.handleSave}
        onDownload={saveState.handleDownload}
        t={t}
      />
    </div>
  )
}

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('图片读取失败'))
    reader.onerror = () => reject(reader.error || new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

function reconcilePersistedMessages(
  current: EditorAiMessageDto[],
  persisted: EditorAiMessageDto[],
): EditorAiMessageDto[] {
  const currentById = new Map(current.map(message => [message.id, message]))

  return persisted.map((message, index) => {
    const existing = currentById.get(message.id)
    if (existing) return { ...existing, ...message }

    const optimistic = current[index]
    if (optimistic?.id.startsWith('local-') && optimistic.role === message.role) {
      // Use the persisted ID once the backend has completed the message. Image
      // previews and follow-up actions address stored messages by this ID.
      return { ...optimistic, ...message, id: optimistic.id }
    }
    return message
  })
}

function formatConversationDate(dateStr: string): string {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.35, ease: [0.23, 0.36, 0.18, 0.97] as const },
  }),
}

export function AiAssistantPage() {
  const { t } = useLanguage()

  const [conversations, setConversations] = useState<EditorAiConversationDto[]>([])
  const [activeConversation, setActiveConversation] = useState<string | null>(null)
  const [messages, setMessages] = useState<EditorAiMessageDto[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingConversation, setLoadingConversation] = useState(false)
  const [sending, setSending] = useState(false)
  const [models, setModels] = useState<StoryAiModelsResponse | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [imageMode, setImageMode] = useState(false)
  const [selectedImageModel, setSelectedImageModel] = useState<string>('')
  const [selectedImageSize, setSelectedImageSize] = useState('1024x1024')
  const [showSidebar, setShowSidebar] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<ConversationRenameTarget | null>(null)
  const [conversationTitleDraft, setConversationTitleDraft] = useState('')
  const [generatingTitleId, setGeneratingTitleId] = useState<string | null>(null)
  const [conversationMenu, setConversationMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [quotedMessage, setQuotedMessage] = useState<EditorAiMessageDto | null>(null)
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)
  const [systemPromptDraft, setSystemPromptDraft] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([])
  const [persistedMessageIds, setPersistedMessageIds] = useState<Record<string, string>>({})

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
  const deleteArmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadingImages = attachedImages.some(image => image.status === 'loading')
  const readyImages = attachedImages.filter(image => image.status === 'ready' && image.url)
  const canSend = !sending && !loadingImages && (
    imageMode
      ? input.trim().length > 0 && Boolean(selectedImageModel)
      : input.trim().length > 0 || readyImages.length > 0
  )

  useEffect(() => { activeConversationRef.current = activeConversation }, [activeConversation])

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

  useEffect(() => {
    if (isSwitchingRef.current) {
      scrollToBottom(true)
      isSwitchingRef.current = false
      isNearBottomRef.current = true
    } else if (isNearBottomRef.current) {
      scrollToBottom(sending)
    }
  }, [messages, sending, scrollToBottom])

  // Load conversations and models
  useEffect(() => {
    const init = async () => {
      setLoading(true)
      try {
        const [convos, modelsData] = await Promise.all([
          GetEditorAiConversations(SCOPE_ID),
          getLocalStoryAiModels().catch(() => null),
        ])
        setConversations(convos || [])
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
    init()
  }, [])

  // Switch the visible conversation immediately, then reconcile its messages asynchronously.
  // Locally-created conversations skip the first empty fetch so it cannot overwrite an optimistic message.
  useEffect(() => {
    const loadId = ++conversationLoadIdRef.current
    if (!activeConversation) {
      setMessages([])
      setShowSystemPrompt(false)
      setLoadingConversation(false)
      return
    }
    if (skipConversationLoadRef.current === activeConversation) {
      skipConversationLoadRef.current = null
      setSystemPromptDraft('')
      setLoadingConversation(false)
      return
    }

    setLoadingConversation(true)
    const loadMessages = async () => {
      try {
        const convo = await GetEditorAiConversation(activeConversation)
        if (conversationLoadIdRef.current !== loadId || activeConversationRef.current !== activeConversation) return
        isSwitchingRef.current = true
        setMessages((convo.messages || []).map(mapEditorAiMessageDto))
        setSystemPromptDraft(convo.systemPrompt || '')
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

    activeConversationRef.current = id
    isSwitchingRef.current = true
    setActiveConversation(id)
    setMessages([])
    setShowSystemPrompt(false)
    setSystemPromptDraft('')
    setQuotedMessage(null)
    setLoadingConversation(true)
  }

  const handleDeleteConversation = async (id: string) => {
    try {
      await DeleteEditorAiConversation(id)
      setConversations(prev => prev.filter(c => c.id !== id))
      if (activeConversation === id) {
        activeConversationRef.current = null
        setActiveConversation(null)
        setMessages([])
        setLoadingConversation(false)
      }
      if (renameTarget?.id === id) setRenameTarget(null)
      clearDeleteArm()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'))
    }
  }

  const handleDeleteClick = (id: string) => {
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
      setMessages([])
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

  const handleSend = async () => {
    const sendableImages = attachedImages.filter(image => image.status === 'ready' && image.url)
    if (sending || loadingImages || (imageMode ? !input.trim() : (!input.trim() && sendableImages.length === 0))) return

    if (imageMode && !selectedImageModel) {
      toast.error(t('admin.ai_image_model_required'))
      return
    }

    let conversationId = activeConversation
    const rawUserInput = input.trim()
    const userInput = rawUserInput || t('admin.ai_image_only_prompt')

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
    const prompt = quoted ? `> ${quoted.content.split('\n').join('\n> ')}\n\n${userInput}` : userInput
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
    setMessages(prev => [...prev, optimisticUserMessage, optimisticAssistantMessage])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const abortController = new AbortController()
    abortRef.current = abortController
    let accumulated = ''

    const updateAssistant = (content: string, status: EditorAiMessageStatus, error?: string) => {
      if (activeConversationRef.current !== conversationId) return
      setMessages(prev => prev.map(message =>
        message.id === assistantMessageId
          ? { ...message, content, status, error }
          : message,
      ))
    }

    try {
      if (imageMode) {
        const port = await ensureAiPort()
        if (!port) throw new Error('AI 服务未启动')

        const response = await fetch(`http://127.0.0.1:${port}/ai/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId,
            action: 'custom',
            prompt,
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

        const convo = await GetEditorAiConversation(conversationId)
        if (activeConversationRef.current === conversationId) {
          const persistedMessages = (convo.messages || []).map(mapEditorAiMessageDto)
          const persistedUserMessage = persistedMessages.at(-2)
          const persistedAssistantMessage = persistedMessages.at(-1)
          setPersistedMessageIds(previous => ({
            ...previous,
            ...(persistedUserMessage?.role === 'user' ? { [userMessageId]: persistedUserMessage.id } : {}),
            ...(persistedAssistantMessage?.role === 'assistant' ? { [assistantMessageId]: persistedAssistantMessage.id } : {}),
          }))
          setMessages(prev => reconcilePersistedMessages(prev, persistedMessages))
        }
        setConversations(prev => prev.map(c => c.id === conversationId
          ? { ...c, title: convo.title, updatedAt: convo.updatedAt }
          : c))
      } else {
        await editorAiLocal.streamStoryAiGenerate('', {
          conversationId,
          action: 'custom',
          prompt,
          model: selectedModel || undefined,
          title: conversationTitle,
          images: images.length > 0 ? images : undefined,
        }, {
          onChunk: (chunk) => {
            accumulated += chunk
            updateAssistant(accumulated, 'streaming')
          },
          signal: abortController.signal,
        })
        updateAssistant(accumulated, 'completed')
        try {
          const convo = await GetEditorAiConversation(conversationId)
          if (activeConversationRef.current === conversationId) {
            const persistedMessages = (convo.messages || []).map(mapEditorAiMessageDto)
            const persistedUserMessage = persistedMessages.at(-2)
            const persistedAssistantMessage = persistedMessages.at(-1)
            setPersistedMessageIds(previous => ({
              ...previous,
              ...(persistedUserMessage?.role === 'user' ? { [userMessageId]: persistedUserMessage.id } : {}),
              ...(persistedAssistantMessage?.role === 'assistant' ? { [assistantMessageId]: persistedAssistantMessage.id } : {}),
            }))
            setMessages(prev => reconcilePersistedMessages(prev, persistedMessages))
          }
        } catch (error) {
          console.warn('[AI] Failed to resolve persisted message IDs:', error)
        }
        setConversations(prev => prev.map(c => c.id === conversationId
          ? { ...c, updatedAt: new Date().toISOString() }
          : c))
      }
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError'
      const errorMessage = aborted ? t('admin.ai_generation_stopped') : error instanceof Error ? error.message : t('common.error')
      updateAssistant(accumulated, aborted ? 'stopped' : 'failed', errorMessage)
      if (!aborted) toast.error(errorMessage)
    } finally {
      abortRef.current = null
      setSending(false)
    }
  }

  const handleStop = () => { abortRef.current?.abort() }

  const handleCopy = async (content: string, id: string) => {
    try { await navigator.clipboard.writeText(content); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000) } catch { /* ignore */ }
  }

  const handleQuote = (msg: EditorAiMessageDto) => { setQuotedMessage(msg); textareaRef.current?.focus() }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 200)}px`; setInput(el.value)
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

      {/* Conversation Sidebar */}
      <AnimatePresence initial={false}>
        {showSidebar && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }} animate={{ width: 280, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.23, 0.36, 0.18, 0.97] }}
            className="flex-shrink-0 flex flex-col overflow-hidden border-r"
            style={{ borderColor: 'var(--border)' }}>
            <div className="px-4 pb-3 pt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} style={{ color: '#f59e0b' }} />
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>{t('admin.ai_conversations')}</span>
                </div>
                <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{conversations.length}</span>
              </div>
              <button onClick={handleNewConversation}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-md border border-dashed transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                <Plus size={14} /> {t('admin.ai_new_chat')}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-3">
              {conversations.length === 0 ? (
                <div className="py-16 text-center">
                  <MessageSquare size={24} className="mx-auto mb-3 opacity-15" />
                  <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>{t('admin.ai_no_conversations')}</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {conversations.map((convo, idx) => {
                    const isActive = activeConversation === convo.id
                    return (
                      <motion.div key={convo.id} custom={idx} initial="hidden" animate="visible" variants={staggerItem}
                        role="button" tabIndex={0}
                        onKeyDown={e => {
                          if (e.key === 'Enter') switchConversation(convo.id)
                        }}
                        onClick={() => switchConversation(convo.id)}
                        onContextMenu={event => {
                          event.preventDefault()
                          const menuWidth = 160
                          const menuHeight = 82
                          setConversationMenu({
                            id: convo.id,
                            x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
                            y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
                          })
                        }}
                        className="group relative flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors rounded-md"
                        style={{ backgroundColor: isActive ? 'var(--accent)' : 'transparent', color: isActive ? 'var(--accent-foreground)' : 'var(--muted-foreground)' }}>
                        <span className="flex-shrink-0 text-[10px] font-mono w-5 text-right" style={{ opacity: 0.4 }}>{idx + 1 < 10 ? `0${idx + 1}` : idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          {renameTarget?.id === convo.id && renameTarget.surface === 'sidebar' ? (
                            <input
                              autoFocus
                              value={conversationTitleDraft}
                              onChange={event => setConversationTitleDraft(event.target.value)}
                              onFocus={event => event.currentTarget.select()}
                              onClick={event => event.stopPropagation()}
                              onPointerDown={event => event.stopPropagation()}
                              onBlur={() => void commitConversationTitle(convo.id)}
                              onKeyDown={event => {
                                event.stopPropagation()
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  event.currentTarget.blur()
                                } else if (event.key === 'Escape') {
                                  event.preventDefault()
                                  setRenameTarget(null)
                                }
                              }}
                              maxLength={200}
                              className="h-6 w-full rounded border px-2 text-xs outline-none"
                              style={{ borderColor: '#f59e0b66', color: 'var(--foreground)', backgroundColor: 'var(--background)' }}
                              aria-label={t('admin.ai_rename_conversation')}
                            />
                          ) : (
                            <div className="text-xs truncate">{convo.title || t('admin.ai_new_chat')}</div>
                          )}
                          <span className="whitespace-nowrap text-[10px] tabular-nums" style={{ opacity: 0.4 }}>{formatConversationDate(convo.updatedAt)}</span>
                        </div>
                        {generatingTitleId === convo.id && (
                          <Loader2 size={14} className="flex-shrink-0 animate-spin" style={{ color: '#f59e0b' }} />
                        )}
                        <button disabled={generatingTitleId === convo.id} onClick={e => { e.stopPropagation(); handleDeleteClick(convo.id) }}
                          className={`flex-shrink-0 p-1 transition-opacity rounded disabled:cursor-default disabled:opacity-30 ${pendingDeleteId === convo.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                          style={{ color: 'var(--destructive)' }}
                          aria-label={pendingDeleteId === convo.id ? t('admin.ai_delete_confirm_again') : t('common.delete')}
                          title={pendingDeleteId === convo.id ? t('admin.ai_delete_confirm_again') : t('common.delete')}>
                          {pendingDeleteId === convo.id ? <Trash2 size={12} /> : <X size={12} />}
                        </button>
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="px-4 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-green-500/50" />
                <span className="uppercase tracking-wider">{activeModelLabel}</span>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0" style={{ backgroundColor: 'var(--background)' }}>
        {/* Chat header */}
        <div className="flex items-center gap-3 px-5 h-12 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <button onClick={() => setShowSidebar(!showSidebar)}
            className="p-1.5 rounded-md transition-colors" style={{ color: 'var(--muted-foreground)' }}>
            <ChevronLeft size={16} className={`transition-transform duration-300 ${!showSidebar ? 'rotate-180' : ''}`} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Sparkles size={14} style={{ color: '#f59e0b' }} />
            {activeConversation && renameTarget?.id === activeConversation && renameTarget.surface === 'header' ? (
              <input
                autoFocus
                value={conversationTitleDraft}
                onChange={event => setConversationTitleDraft(event.target.value)}
                onFocus={event => event.currentTarget.select()}
                onBlur={() => void commitConversationTitle(activeConversation)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    event.currentTarget.blur()
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    setRenameTarget(null)
                  }
                }}
                maxLength={200}
                className="h-7 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-xs font-medium outline-none"
                style={{ borderColor: '#f59e0b66', color: 'var(--foreground)' }}
                aria-label={t('admin.ai_rename_conversation')}
              />
            ) : (
              <button
                type="button"
                disabled={!activeConversation}
                onClick={() => { if (activeConversation) startRenamingConversation(activeConversation, 'header') }}
                className="min-w-0 truncate text-left text-xs font-medium disabled:cursor-default"
                title={activeConversation ? t('admin.ai_rename_conversation') : undefined}
              >
                {activeConvoData?.title || t('admin.ai_assistant')}
              </button>
            )}
            {hasCustomPrompt && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#f59e0b' }} />}
          </div>
          <div className="flex items-center gap-1">
            {activeConversation && (
              <button onClick={() => { setShowSystemPrompt(!showSystemPrompt); if (!showSystemPrompt) setSystemPromptDraft(activeConvoData?.systemPrompt || '') }}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] uppercase tracking-wider transition-colors"
                style={{ color: showSystemPrompt || hasCustomPrompt ? '#f59e0b' : 'var(--muted-foreground)' }}>
                <Settings2 size={12} /> <span className="hidden sm:inline">{t('admin.ai_system_prompt')}</span>
              </button>
            )}
            {activeConversation && messages.length > 0 && (
              <button onClick={handleClearConversation}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] uppercase tracking-wider transition-colors"
                style={{ color: 'var(--muted-foreground)' }}>
                <Eraser size={12} /> <span className="hidden sm:inline">{t('admin.ai_clear')}</span>
              </button>
            )}
          </div>
        </div>

        {/* System prompt editor */}
        <AnimatePresence>
          {showSystemPrompt && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }} className="overflow-hidden border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)/10' }}>
              <div className="px-5 py-4 max-w-[44rem] mx-auto">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>{t('admin.ai_system_prompt_title')}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSystemPromptDraft('')}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                      <RotateCcw size={10} /> <span className="hidden sm:inline">{t('admin.ai_system_prompt_reset')}</span>
                    </button>
                    <button onClick={handleSaveSystemPrompt} disabled={savingPrompt}
                      className="flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-semibold uppercase tracking-wider disabled:opacity-30"
                      style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}>
                      {savingPrompt ? t('admin.ai_system_prompt_saving') : t('admin.ai_system_prompt_save')}
                    </button>
                  </div>
                </div>
                <textarea value={systemPromptDraft} onChange={e => setSystemPromptDraft(e.target.value)}
                  placeholder={t('admin.ai_system_prompt_placeholder')} rows={3}
                  className="w-full resize-none border rounded-md px-4 py-3 text-xs leading-relaxed outline-none"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }} />
                <p className="mt-2 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{t('admin.ai_system_prompt_hint')}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages area */}
        <div ref={messagesScrollRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto">
          {loadingConversation && activeConversation ? (
            <div className="flex h-full items-center justify-center" style={{ color: 'var(--muted-foreground)' }}>
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : !activeConversation && messages.length === 0 && !sending ? (
            <EmptyState t={t} textareaRef={textareaRef} setInput={setInput} />
          ) : (
            <div className="max-w-[44rem] mx-auto px-5 py-6 space-y-4">
              <AnimatePresence initial={false}>
                {messages.map(msg => (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                    <MessageBubble
                      message={msg}
                      persistedMessageId={persistedMessageIds[msg.id]}
                      copiedId={copiedId}
                      onCopy={handleCopy}
                      onQuote={handleQuote}
                      t={t}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t p-4 flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="max-w-[44rem] mx-auto">
            <div className="relative rounded-xl border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)/10' }}>
              <AnimatePresence>
                {quotedMessage && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }} className="overflow-hidden">
                    <div className="flex items-start gap-2 mx-4 mt-3 px-3 py-2 rounded-md border-l-2" style={{ borderColor: '#f59e0b', backgroundColor: '#f59e0b/5' }}>
                      <Quote size={12} style={{ color: '#f59e0b' }} className="flex-shrink-0 mt-0.5" />
                      <p className="flex-1 text-xs line-clamp-2 italic" style={{ color: 'var(--muted-foreground)' }}>{quotedMessage.content}</p>
                      <button onClick={() => setQuotedMessage(null)} className="flex-shrink-0 p-0.5" style={{ color: 'var(--muted-foreground)' }}><X size={12} /></button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {attachedImages.length > 0 && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }} className="overflow-hidden">
                    <div className="flex items-center gap-2 mx-4 mt-3 flex-wrap">
                      {attachedImages.map((img) => (
                        <div key={img.id} className="relative group w-14 h-14 rounded-md overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                          <img src={img.url} alt="" className="w-full h-full object-cover" />
                          <button onClick={() => removeAttachedImage(img.id)}
                            className="absolute top-0.5 right-0.5 p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ backgroundColor: 'var(--background)' }}><X size={10} /></button>
                          {img.status === 'loading' && (
                            <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'var(--background)' }}>
                              <Loader2 size={16} className="animate-spin" style={{ color: 'var(--muted-foreground)' }} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <textarea ref={textareaRef} value={input} onChange={autoResize} onKeyDown={handleKeyDown} onPaste={handlePaste}
                placeholder={t('admin.ai_input_placeholder')} rows={1} disabled={sending}
                className="w-full resize-none bg-transparent text-sm leading-6 outline-none px-4 pt-3.5 pb-1 disabled:opacity-40"
                style={{ color: 'var(--foreground)', maxHeight: 200 }} />

              <div className="flex items-center justify-between px-3 pb-2.5">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={handleSelectImages} disabled={sending || loadingImages}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] disabled:opacity-30 transition-colors"
                    style={{ color: 'var(--muted-foreground)' }}><Paperclip size={14} /></button>
                  <button type="button" onClick={() => setImageMode(prev => !prev)} disabled={sending}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] disabled:opacity-30 transition-colors"
                    style={{ borderColor: imageMode ? '#f59e0b' : 'var(--border)', color: imageMode ? '#f59e0b' : 'var(--muted-foreground)', backgroundColor: imageMode ? '#f59e0b/5' : 'transparent' }}>
                    <ImageIcon size={12} /> <span className="hidden sm:inline">{t('admin.ai_generate_image')}</span>
                  </button>
                  {imageMode ? (
                    <>
                      {imageModels.length > 0 && <ModelSelector models={imageModels} value={selectedImageModel} onChange={setSelectedImageModel} icon="image" />}
                      <select value={selectedImageSize} onChange={e => setSelectedImageSize(e.target.value)} disabled={sending}
                        className="h-6 rounded-md border bg-transparent px-2 text-[10px] outline-none disabled:opacity-30"
                        style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                        <option value="1024x1024">1:1</option>
                        <option value="1024x1792">9:16</option>
                        <option value="1792x1024">16:9</option>
                      </select>
                    </>
                  ) : (
                    chatModels.length > 0 && <ModelSelector models={chatModels} value={selectedModel} onChange={setSelectedModel} />
                  )}
                  <span className="hidden sm:inline text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Enter {t('admin.ai_newline')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {sending ? (
                    <button onClick={handleStop}
                      className="flex-shrink-0 h-8 px-3 flex items-center gap-1.5 rounded-md border text-xs transition-colors"
                      style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                      <StopCircle size={14} /> <span className="hidden sm:inline">{t('admin.ai_stop')}</span>
                    </button>
                  ) : (
                    <button onClick={handleSend} disabled={!canSend}
                      className="flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-md disabled:opacity-15 transition-colors"
                      style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}>
                      <Send size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

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
            className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs transition-colors hover:bg-black/5 disabled:cursor-default disabled:opacity-50 dark:hover:bg-white/5"
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
            className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/5"
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

/* Empty State */

function EmptyState({ t, textareaRef, setInput }: {
  t: (key: string) => string
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  setInput: (value: string) => void
}) {
  const prompts = [
    { text: t('admin.ai_prompt_narrative'), order: '01' },
    { text: t('admin.ai_prompt_describe'), order: '02' },
    { text: t('admin.ai_prompt_title'), order: '03' },
  ]

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 pb-16">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.23, 0.36, 0.18, 0.97] }} className="text-center max-w-md">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.5 }} className="mx-auto mb-8">
          <div className="relative inline-flex">
            <span className="absolute inset-0 rounded-full blur-xl" style={{ backgroundColor: '#f59e0b/5' }} />
            <span className="relative flex h-20 w-20 items-center justify-center rounded-2xl" style={{ backgroundColor: '#f59e0b/5', border: '1px solid #f59e0b/10' }}>
              <Sparkles size={32} style={{ color: '#f59e0b/30' }} />
            </span>
          </div>
        </motion.div>

        <h2 className="font-serif text-2xl tracking-tight mb-3" style={{ color: 'var(--foreground)' }}>{t('admin.ai_assistant')}</h2>
        <p className="text-sm leading-relaxed mb-10 max-w-sm mx-auto" style={{ color: 'var(--muted-foreground)' }}>{t('admin.ai_welcome')}</p>

        <div className="space-y-2">
          {prompts.map((prompt, i) => (
            <motion.button key={prompt.text} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.08, duration: 0.35 }}
              onClick={() => { setInput(prompt.text); textareaRef.current?.focus() }}
              className="group flex items-center gap-4 w-full px-4 py-3 rounded-xl border transition-colors text-left"
              style={{ borderColor: 'var(--border)' }}>
              <span className="flex-shrink-0 w-7 text-right text-[10px] font-mono" style={{ color: 'var(--muted-foreground)' }}>{prompt.order}</span>
              <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{prompt.text}</span>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

/* Message Bubble */

function isAiImageMetadata(value: unknown): value is AiImageMetadata {
  return Boolean(value && typeof value === 'object' && (value as AiImageMetadata).type === 'image')
}

function MessageBubble({ message, persistedMessageId, copiedId, onCopy, onQuote, t }: {
  message: EditorAiMessageDto
  persistedMessageId?: string
  copiedId: string | null
  onCopy: (content: string, id: string) => void
  onQuote: (msg: EditorAiMessageDto) => void
  t: (key: string) => string
}) {
  const isUser = message.role === 'user'
  const imageMetadata = isAiImageMetadata(message.metadata) ? message.metadata : null
  const messageImages = getMessageImages(message.metadata)
  const saveMessageId = persistedMessageId || message.id

  if (isUser) {
    return (
      <div className="flex gap-3 items-start justify-end">
        <div className="max-w-[78%] min-w-0">
          <div className="rounded-lg rounded-tr-md border px-4 py-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)/20' }}>
            <div className="whitespace-pre-wrap text-sm leading-relaxed break-words" style={{ color: 'var(--foreground)' }}>{message.content}</div>
            {messageImages.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {messageImages.map((image, index) => (
                  <MessageImage key={`${image.url}-${index}`} messageId={saveMessageId} image={image} t={t} />
                ))}
              </div>
            )}
          </div>
          <div className="mt-1 flex items-center justify-end">
            <button onClick={() => onQuote(message)} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-md transition-colors" style={{ color: 'var(--muted-foreground)' }}>
              <Quote size={10} />
            </button>
          </div>
        </div>
        <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-semibold" style={{ backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}>Me</div>
      </div>
    )
  }

  return (
    <div className="flex gap-3 items-start">
      <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#f59e0b/10' }}>
        <Sparkles size={14} style={{ color: '#f59e0b' }} />
      </div>
      <div className="max-w-[78%] min-w-0">
        <div className="rounded-lg rounded-tl-md border px-4 py-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)/10' }}>
          {imageMetadata ? (
            <ImagePreview message={message} messageId={saveMessageId} metadata={imageMetadata} t={t} />
          ) : message.status === 'streaming' && !message.content ? (
            <div className="flex items-center gap-2.5">
              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{t('admin.ai_thinking')}</span>
              <span className="flex gap-1">
                {[0, 1, 2].map(index => (
                  <span
                    key={index}
                    className="w-1 h-1 rounded-full animate-bounce"
                    style={{ backgroundColor: '#f59e0b', opacity: 0.45, animationDelay: `${index * 150}ms` }}
                  />
                ))}
              </span>
            </div>
          ) : (
            <div className="ai-markdown text-sm leading-relaxed break-words" style={{ color: 'var(--foreground)' }}>
              <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
              {message.status === 'streaming' && (
                <span className="inline-block w-[3px] h-4 rounded-full animate-pulse ml-0.5 align-middle" style={{ backgroundColor: '#f59e0b' }} />
              )}
            </div>
          )}
          {messageImages.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {messageImages.map((image, index) => (
                  <MessageImage key={`${image.url}-${index}`} messageId={saveMessageId} image={image} t={t} />
                ))}
            </div>
          )}
          {message.status === 'failed' && message.error && (
            <div className="mt-2.5 rounded-md border px-3 py-2 text-xs" style={{ borderColor: 'var(--destructive)/20', color: 'var(--destructive)', backgroundColor: 'var(--destructive)/5' }}>
              {message.error}
            </div>
          )}
        </div>
        {message.content && (
          <div className="mt-1.5 flex items-center gap-0.5">
            <button onClick={() => onCopy(message.content, message.id)}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-md transition-colors" style={{ color: 'var(--muted-foreground)' }}>
              {copiedId === message.id ? <><Check size={10} className="text-green-500" /><span className="text-green-500">{t('admin.ai_copied')}</span></> : <><Copy size={10} /><span>{t('admin.ai_copy')}</span></>}
            </button>
            <button onClick={() => onQuote(message)}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-md transition-colors" style={{ color: 'var(--muted-foreground)' }}>
              <Quote size={10} /><span>{t('admin.ai_quote')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* Image Preview */

function ImagePreview({ message, messageId, metadata, t }: {
  message: EditorAiMessageDto
  messageId: string
  metadata: AiImageMetadata
  t: (key: string) => string
}) {
  const [imageSrc, setImageSrc] = useState(metadata.uploadedUrl || '')
  const [loadingImage, setLoadingImage] = useState(!metadata.uploadedUrl)
  const [loadError, setLoadError] = useState('')
  const saveState = useImageContextMenu(
    Boolean(metadata.photoId),
    async () => {
      try {
        await SaveMessageImageToAlbum(messageId, imageSrc)
        toast.success(t('admin.ai_saved_to_album'))
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('admin.ai_save_to_album_failed'))
        throw error
      }
    },
    () => downloadMessageImageToLocal(imageSrc, t),
  )

  useEffect(() => {
    let cancelled = false
    async function loadImage() {
      setLoadError('')
      if (metadata.uploadedUrl) {
        setImageSrc(metadata.uploadedUrl)
        setLoadingImage(false)
        return
      }
      setLoadingImage(true)
      try {
        const dataUrl = await GetAiImageDataURL(messageId)
        if (!cancelled) setImageSrc(dataUrl)
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : '图片加载失败')
      } finally {
        if (!cancelled) setLoadingImage(false)
      }
    }
    void loadImage()
    return () => { cancelled = true }
  }, [messageId, metadata.uploadedUrl])

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: 'var(--foreground)' }}>{message.content || '已生成图片'}</p>
      <div className="rounded-lg border overflow-hidden max-w-md" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)/10' }}>
        {loadingImage ? (
          <div className="h-56 flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
            <Loader2 size={16} className="animate-spin" /> 正在加载图片...
          </div>
        ) : loadError ? (
          <div className="h-32 flex items-center justify-center px-4 text-xs text-center" style={{ color: 'var(--destructive)' }}>{loadError}</div>
        ) : (
          <img
            src={imageSrc}
            alt={metadata.prompt || 'AI generated image'}
            className="w-full max-h-[420px] object-contain"
            loading="lazy"
            onContextMenu={saveState.handleContextMenu}
          />
        )}
      </div>
      <ImageContextMenu
        position={saveState.contextMenu}
        saving={saveState.saving}
        downloading={saveState.downloading}
        saved={saveState.saved}
        onSave={saveState.handleSave}
        onDownload={saveState.handleDownload}
        t={t}
      />
      <div className="space-y-1 text-[11px] leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
        <p>提示词：{metadata.prompt}</p>
        {metadata.revisedPrompt && <p>优化后：{metadata.revisedPrompt}</p>}
        {(metadata.provider || metadata.model || metadata.size) && <p>{[metadata.provider, metadata.model, metadata.size].filter(Boolean).join(' · ')}</p>}
      </div>
    </div>
  )
}

/* Model Selector */

function ModelSelector({ models, value, onChange, icon = 'sparkles' }: {
  models: { id: string; label: string }[]
  value: string
  onChange: (value: string) => void
  icon?: 'sparkles' | 'image'
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = models.find(m => m.id === value)
  const filtered = search.trim() ? models.filter(m => m.label.toLowerCase().includes(search.trim().toLowerCase())) : models

  useEffect(() => { if (isOpen) requestAnimationFrame(() => searchRef.current?.focus()) }, [isOpen])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isOpen && containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('click', handleClickOutside, true)
    return () => document.removeEventListener('click', handleClickOutside, true)
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative">
      <button type="button" onClick={() => { setIsOpen(!isOpen); if (!isOpen) setSearch('') }}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] transition-colors"
        style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
        {icon === 'image' ? <ImageIcon size={10} style={{ color: '#f59e0b' }} /> : <Sparkles size={10} style={{ color: '#f59e0b' }} />}
        <span className="max-w-20 truncate">{selected?.label ?? 'Model'}</span>
        <ChevronDown size={10} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }} className="absolute bottom-full left-0 mb-1.5 w-56 border rounded-md shadow-lg overflow-hidden z-20"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)' }}>
            <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <Search size={12} style={{ color: 'var(--muted-foreground)' }} />
              <input ref={searchRef} type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search models..." className="flex-1 bg-transparent text-xs outline-none" style={{ color: 'var(--foreground)' }} />
            </div>
            <div className="max-h-44 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <div className="px-3 py-3 text-[10px] text-center" style={{ color: 'var(--muted-foreground)' }}>No results</div>
              ) : filtered.map(m => (
                <button key={m.id} onClick={() => { onChange(m.id); setIsOpen(false) }}
                  className="w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors"
                  style={{ backgroundColor: value === m.id ? '#f59e0b/5' : 'transparent', color: 'var(--foreground)' }}>
                  <span className="truncate">{m.label}</span>
                  {value === m.id && <Check size={12} style={{ color: '#f59e0b' }} />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
