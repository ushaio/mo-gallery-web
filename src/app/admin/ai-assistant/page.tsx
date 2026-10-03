'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Plus,
  Send,
  X,
  ChevronLeft,
  ChevronDown,
  Copy,
  Check,
  Eraser,
  Sparkles,
  Search,
  Quote,
  StopCircle,
  Settings2,
  RotateCcw,
  Paperclip,
  Loader2,
  Image as ImageIcon,
  Pencil,
  GitBranch,
  Trash2,
  Download,
} from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import { ApiUnauthorizedError } from '@/lib/api/core'
import {
  getEditorAiConversations,
  createEditorAiConversation,
  getEditorAiConversation,
  deleteEditorAiConversation,
  clearEditorAiConversation,
  updateEditorAiConversation,
  generateEditorAiConversationTitle,
  uploadAiImage,
  streamStoryAiGenerate,
  getStoryAiModels,
  generateEditorAiImage,
  forkEditorAiConversation,
  saveEditorAiMessageImage,
} from '@/lib/api/story-ai'
import type {
  EditorAiConversationDto,
  EditorAiMessageDto,
  EditorAiMessageStatus,
  StoryAiModelOption,
  StoryAiModelsResponse,
} from '@/lib/api/types'
import { EDITOR_AI_CHAT_SYSTEM_PROMPT, type EditorAiUsage } from '@mo-gallery/ai-agent'
import { AdminButton } from '@/components/admin/AdminButton'
import { Skeleton } from '@/components/admin/Skeleton'
import { useAdmin } from '../layout'

const SCOPE_ID = 'ai-assistant'
const MAX_ATTACHED_IMAGES = 10
const MAX_IMAGE_SIZE = 20 * 1024 * 1024
const IMAGE_EDIT_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const DELETE_ARM_TIMEOUT_MS = 3000

type AttachedImage = {
  id: string
  url: string
  key: string
  previewUrl: string
  status: 'uploading' | 'ready'
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
  return models.some((model) => model.id === preferred) ? preferred ?? '' : models[0]?.id ?? ''
}

type MessageImageRef = {
  url: string
  photoId?: string
}

type WritableImageFile = {
  write: (data: Blob) => Promise<void>
  close: () => Promise<void>
}

type ImageFileHandle = {
  createWritable: () => Promise<WritableImageFile>
}

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: Array<{
      description: string
      accept: Record<string, string[]>
    }>
  }) => Promise<ImageFileHandle>
}

function getSuggestedImageName(imageUrl: string): string {
  if (imageUrl.startsWith('data:')) {
    const mimeType = imageUrl.slice(5, imageUrl.indexOf(';'))
    const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1] || 'png'
    return `ai-image-${Date.now()}.${extension}`
  }

  try {
    const pathname = new URL(imageUrl, window.location.href).pathname
    const fileName = decodeURIComponent(pathname.split('/').pop() || '')
    if (/\.(?:png|jpe?g|webp|gif|avif)$/i.test(fileName)) return fileName
  } catch {
    // Use a stable fallback name for malformed or non-URL image sources.
  }
  return `ai-image-${Date.now()}.png`
}

async function fetchImageBlob(imageUrl: string): Promise<Blob> {
  const response = await fetch(imageUrl)
  if (!response.ok) throw new Error(`Image download failed (${response.status})`)
  const blob = await response.blob()
  if (!blob.type.startsWith('image/')) throw new Error('Downloaded file is not an image')
  return blob
}

async function downloadImageToLocal(imageUrl: string): Promise<boolean> {
  const suggestedName = getSuggestedImageName(imageUrl)
  const savePicker = (window as SaveFilePickerWindow).showSaveFilePicker

  if (savePicker) {
    try {
      const fileHandle = await savePicker.call(window, {
        suggestedName,
        types: [{
          description: 'Image',
          accept: {
            'image/png': ['.png'],
            'image/jpeg': ['.jpg', '.jpeg'],
            'image/webp': ['.webp'],
            'image/gif': ['.gif'],
            'image/avif': ['.avif'],
          },
        }],
      })
      const blob = await fetchImageBlob(imageUrl)
      const writable = await fileHandle.createWritable()
      await writable.write(blob)
      await writable.close()
      return true
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false
      throw error
    }
  }

  const blob = await fetchImageBlob(imageUrl)
  const objectUrl = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = suggestedName
    link.click()
    return true
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function getMessageImages(metadata: unknown): MessageImageRef[] {
  if (!metadata || typeof metadata !== 'object') return []

  const imageMetadata = metadata as {
    type?: unknown
    uploadedUrl?: unknown
    photoId?: unknown
    images?: unknown
  }
  if (imageMetadata.type === 'image' && typeof imageMetadata.uploadedUrl === 'string') {
    return imageMetadata.uploadedUrl
      ? [{
          url: imageMetadata.uploadedUrl,
          ...(typeof imageMetadata.photoId === 'string' ? { photoId: imageMetadata.photoId } : {}),
        }]
      : []
  }
  if (!Array.isArray(imageMetadata.images)) return []
  return imageMetadata.images.flatMap((image) => {
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

function MessageImage({
  image,
  alt,
  onSave,
  onDownload,
  t,
}: {
  image: MessageImageRef
  alt: string
  onSave: () => Promise<void>
  onDownload: () => Promise<void>
  t: (key: string) => string
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [saved, setSaved] = useState(Boolean(image.photoId))

  useEffect(() => {
    if (image.photoId) setSaved(true)
  }, [image.photoId])

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
      // The page-level callback reports API errors.
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
      // The page-level callback reports download errors.
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="relative max-w-[200px] overflow-hidden border border-border">
      <img
        src={image.url}
        alt={alt}
        className="max-h-[200px] object-contain bg-muted/40"
        loading="lazy"
        onContextMenu={handleContextMenu}
      />
      {contextMenu && typeof document !== 'undefined' && createPortal(
        <div
          role="menu"
          className="fixed z-[100] min-w-44 border border-border bg-popover p-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            disabled={saving || saved}
            onClick={() => void handleSave()}
            className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-2 text-left text-[13px] text-popover-foreground transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
            {saved ? t('admin.ai_saved_to_album') : t('admin.ai_save_to_album')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={downloading}
            onClick={() => void handleDownload()}
            className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-2 text-left text-[13px] text-popover-foreground transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-50"
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {t('admin.ai_download_to_local')}
          </button>
        </div>,
        document.body,
      )}
    </div>
  )
}

function readJsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readUsageCount(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Reads `metadata.usage` as persisted by the server (OpenAI/DeepSeek-style counter names
 * are already normalized there, so only the four canonical keys are handled here). */
function readMessageUsage(metadata: EditorAiMessageDto['metadata'] | undefined): EditorAiUsage | null {
  const root = readJsonRecord(metadata)
  const usage = root ? readJsonRecord(root.usage) : null
  if (!usage) return null

  const inputTokens = readUsageCount(usage, 'inputTokens')
  const outputTokens = readUsageCount(usage, 'outputTokens')
  const reasoningTokens = readUsageCount(usage, 'reasoningTokens')
  const cacheReadTokens = readUsageCount(usage, 'cacheReadTokens')
  if (
    inputTokens === undefined
    && outputTokens === undefined
    && reasoningTokens === undefined
    && cacheReadTokens === undefined
  ) {
    return null
  }

  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
    ...(cacheReadTokens === undefined ? {} : { cacheReadTokens }),
  }
}

function serializeUsage(usage: EditorAiUsage): Record<string, number> | null {
  const entries = Object.entries(usage).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]),
  )
  return entries.length > 0 ? Object.fromEntries(entries) : null
}

/** Mirrors the server-side write so live streaming usage and reloaded usage render alike. */
function withMessageUsage(message: EditorAiMessageDto, usage: EditorAiUsage): EditorAiMessageDto {
  const serialized = serializeUsage(usage)
  if (!serialized) return message
  const metadata = readJsonRecord(message.metadata) ?? {}
  return { ...message, metadata: { ...metadata, usage: serialized } }
}

function readImageRefs(metadata: unknown): Array<{ url: string; key?: string }> {
  const root = readJsonRecord(metadata)
  if (!Array.isArray(root?.images)) return []
  return root.images.flatMap((image) => {
    const record = readJsonRecord(image)
    const url = typeof image === 'string' ? image : (typeof record?.url === 'string' ? record.url : '')
    if (!url) return []
    const key = typeof record?.key === 'string' && record.key ? record.key : undefined
    return [{ url, ...(key ? { key } : {}) }]
  })
}

function formatTokenCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return String(value)
}

function cacheHitPercent(usage: EditorAiUsage): number | null {
  if (!usage.inputTokens || usage.cacheReadTokens === undefined) return null
  return Math.round((usage.cacheReadTokens / usage.inputTokens) * 100)
}

/** Margin note next to a turn: the prompt size under the question, the answer size and
 * cache hit rate under the reply. */
function formatUsageSummary(
  usage: EditorAiUsage,
  t: (key: string) => string,
  variant: 'user' | 'assistant',
): string {
  if (variant === 'user') {
    return usage.inputTokens === undefined
      ? ''
      : `${t('admin.ai_usage_input')} ${formatTokenCount(usage.inputTokens)}`
  }

  const parts: string[] = []
  if (usage.outputTokens !== undefined) {
    parts.push(`${t('admin.ai_usage_output')} ${formatTokenCount(usage.outputTokens)}`)
  } else if (usage.inputTokens !== undefined) {
    parts.push(`${t('admin.ai_usage_input')} ${formatTokenCount(usage.inputTokens)}`)
  }
  const percent = cacheHitPercent(usage)
  if (percent !== null) parts.push(`${t('admin.ai_usage_cache')} ${percent}%`)
  return parts.join(' · ')
}

function formatUsageDetail(usage: EditorAiUsage, t: (key: string) => string): string {
  const exact = (value: number) => value.toLocaleString('en-US')
  const parts: string[] = []
  if (usage.inputTokens !== undefined) {
    parts.push(`${t('admin.ai_usage_input')} ${exact(usage.inputTokens)}`)
  }
  if (usage.outputTokens !== undefined) {
    parts.push(`${t('admin.ai_usage_output')} ${exact(usage.outputTokens)}`)
  }
  if (usage.cacheReadTokens !== undefined) {
    const percent = cacheHitPercent(usage)
    parts.push(`${t('admin.ai_usage_cached')} ${exact(usage.cacheReadTokens)}${percent === null ? '' : ` (${percent}%)`}`)
  }
  if (usage.reasoningTokens !== undefined) {
    parts.push(`${t('admin.ai_usage_reasoning')} ${exact(usage.reasoningTokens)}`)
  }
  if (usage.inputTokens !== undefined && usage.outputTokens !== undefined) {
    parts.push(`${t('admin.ai_usage_total')} ${exact(usage.inputTokens + usage.outputTokens)}`)
  }
  return parts.join(' · ')
}

/** The turn following a user message carries its usage; the user row borrows it. */
function findTurnUsage(messages: EditorAiMessageDto[], index: number): EditorAiUsage | null {
  for (let cursor = index + 1; cursor < messages.length; cursor += 1) {
    const candidate = messages[cursor]
    if (!candidate || candidate.role !== 'assistant') break
    const usage = readMessageUsage(candidate.metadata)
    if (usage) return usage
  }
  return null
}

function reconcilePersistedMessages(
  current: EditorAiMessageDto[],
  persisted: EditorAiMessageDto[],
): EditorAiMessageDto[] {
  const currentById = new Map(current.map((message) => [message.id, message]))
  return persisted.map((message, index) => {
    const existing = currentById.get(message.id)
    if (existing) return { ...existing, ...message }
    const optimistic = current[index]
    if (optimistic?.id.startsWith('local-') && optimistic.role === message.role) {
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

// Staggered reveal variants removed in favour of the panel's single open/close motion.

export default function AiAssistantPage() {
  const { t, notify, handleUnauthorized } = useAdmin()
  const { token } = useAuth()

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
  const [forkingId, setForkingId] = useState<string | null>(null)

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
  const attachedImagesRef = useRef<AttachedImage[]>([])
  const deleteArmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const uploadingImages = attachedImages.some((image) => image.status === 'uploading')
  const readyImages = attachedImages.filter((image) => image.status === 'ready' && image.url)
  const canSend = !sending && !uploadingImages && (
    imageMode
      ? input.trim().length > 0 && Boolean(selectedImageModel)
      : input.trim().length > 0 || readyImages.length > 0
  )

  useEffect(() => {
    activeConversationRef.current = activeConversation
  }, [activeConversation])

  useEffect(() => {
    attachedImagesRef.current = attachedImages
  }, [attachedImages])

  useEffect(() => () => {
    attachedImagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl))
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
    if (!token) return
    const init = async () => {
      setLoading(true)
      try {
        const [convos, modelsData] = await Promise.all([
          getEditorAiConversations(token),
          getStoryAiModels(token).catch(() => null),
        ])
        setConversations(convos)
        if (modelsData) {
          const chatModels = modelsData.models.filter(supportsChat)
          const imageModels = modelsData.models.filter(supportsImageGeneration)
          setModels(modelsData)
          setSelectedModel(selectAvailableModel(chatModels, modelsData.defaultModel))
          setSelectedImageModel(selectAvailableModel(imageModels, modelsData.defaultImageModel))
        }
      } catch (error) {
        if (error instanceof ApiUnauthorizedError) {
          handleUnauthorized(error)
          return
        }
        console.error('Failed to load AI assistant data:', error)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  // Switch the visible conversation immediately, then reconcile its messages asynchronously.
  // Locally-created conversations skip the first empty fetch so it cannot overwrite an optimistic message.
  useEffect(() => {
    const loadId = ++conversationLoadIdRef.current
    if (!token || !activeConversation) {
      setMessages([])
      setShowSystemPrompt(false)
      setLoadingConversation(false)
      return
    }
    if (skipConversationLoadRef.current === activeConversation) {
      skipConversationLoadRef.current = null
      setLoadingConversation(false)
      return
    }

    setLoadingConversation(true)
    const loadMessages = async () => {
      try {
        const convo = await getEditorAiConversation(token, activeConversation)
        if (conversationLoadIdRef.current !== loadId || activeConversationRef.current !== activeConversation) return
        isSwitchingRef.current = true
        setMessages(convo.messages)
        setSystemPromptDraft(convo.systemPrompt || '')
      } catch (error) {
        if (conversationLoadIdRef.current !== loadId || activeConversationRef.current !== activeConversation) return
        if (error instanceof ApiUnauthorizedError) {
          handleUnauthorized(error)
          return
        }
        console.error('Failed to load messages:', error)
      } finally {
        if (conversationLoadIdRef.current === loadId && activeConversationRef.current === activeConversation) {
          setLoadingConversation(false)
        }
      }
    }
    void loadMessages()
  }, [token, activeConversation]) // eslint-disable-line react-hooks/exhaustive-deps

  const createConversation = async () => {
    if (!token) return null
    try {
      const convo = await createEditorAiConversation(token, {
        scopeId: SCOPE_ID,
        title: t('admin.ai_new_chat'),
      })
      setConversations((prev) => [convo, ...prev])
      skipConversationLoadRef.current = convo.id
      activeConversationRef.current = convo.id
      setActiveConversation(convo.id)
      setMessages([])
      setLoadingConversation(false)
      return convo
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized(error)
        return null
      }
      notify(t('common.error'), 'error')
      return null
    }
  }

  const handleNewConversation = async () => {
    clearDeleteArm()
    setConversationMenu(null)
    setRenameTarget(null)
    const convo = await createConversation()
    if (!convo) return
    setInput('')
    textareaRef.current?.focus()
  }

  // 刚进页面时没有选中对话；系统提示词是按会话保存的，所以先落一个会话作为它的归属
  const openSystemPrompt = async () => {
    if (showSystemPrompt) {
      setShowSystemPrompt(false)
      return
    }
    const conversationId = activeConversationRef.current
    if (!conversationId) {
      const created = await createConversation()
      if (!created) return
      setSystemPromptDraft(created.systemPrompt || EDITOR_AI_CHAT_SYSTEM_PROMPT)
      setShowSystemPrompt(true)
      return
    }
    setSystemPromptDraft(
      conversations.find((item) => item.id === conversationId)?.systemPrompt || EDITOR_AI_CHAT_SYSTEM_PROMPT,
    )
    setShowSystemPrompt(true)
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
    if (!token) return
    try {
      await deleteEditorAiConversation(token, id)
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (activeConversation === id) {
        activeConversationRef.current = null
        setActiveConversation(null)
        setMessages([])
        setLoadingConversation(false)
      }
      if (renameTarget?.id === id) setRenameTarget(null)
      clearDeleteArm()
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized(error)
        return
      }
      notify(t('common.error'), 'error')
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
      setPendingDeleteId((current) => current === id ? null : current)
      deleteArmTimeoutRef.current = null
    }, DELETE_ARM_TIMEOUT_MS)
  }

  const startRenamingConversation = (id: string, surface: ConversationRenameTarget['surface']) => {
    const conversation = conversations.find((item) => item.id === id)
    if (!conversation) return
    clearDeleteArm()
    setConversationMenu(null)
    setConversationTitleDraft(conversation.title || t('admin.ai_new_chat'))
    setRenameTarget({ id, surface })
  }

  const commitConversationTitle = async (id: string) => {
    if (!token || renameTarget?.id !== id) return
    const conversation = conversations.find((item) => item.id === id)
    const title = conversationTitleDraft.replace(/\s+/g, ' ').trim()
    setRenameTarget(null)
    if (!conversation || !title || title === conversation.title) return
    setConversations((previous) => previous.map((item) =>
      item.id === id ? { ...item, title, updatedAt: new Date().toISOString() } : item,
    ))
    try {
      await updateEditorAiConversation(token, id, { title })
    } catch (error) {
      setConversations((previous) => previous.map((item) =>
        item.id === id ? { ...item, title: conversation.title } : item,
      ))
      if (error instanceof ApiUnauthorizedError) handleUnauthorized(error)
      else notify(t('admin.ai_rename_failed'), 'error')
    }
  }

  const handleGenerateConversationTitle = async (id: string) => {
    if (!token || generatingTitleId) return
    clearDeleteArm()
    setConversationMenu(null)
    setRenameTarget(null)
    setGeneratingTitleId(id)
    try {
      const updated = await generateEditorAiConversationTitle(token, id, selectedModel || undefined)
      setConversations((previous) => previous.map((item) => item.id === id ? updated : item))
      notify(t('admin.ai_generate_title_success'), 'success')
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized(error)
        return
      }
      const message = error instanceof Error && error.message === 'AI_CONVERSATION_EMPTY'
        ? t('admin.ai_generate_title_empty')
        : error instanceof Error && error.message !== 'AI_TITLE_EMPTY'
          ? error.message
          : t('admin.ai_generate_title_failed')
      notify(message, 'error')
    } finally {
      setGeneratingTitleId((current) => current === id ? null : current)
    }
  }

  const handleClearConversation = async () => {
    if (!token || !activeConversation) return
    try {
      await clearEditorAiConversation(token, activeConversation)
      setMessages([])
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized(error)
        return
      }
      notify(t('common.error'), 'error')
    }
  }

  const reduceMotion = useReducedMotion()

  // The system prompt editor is a right-side drawer; Escape closes it like the
  // other dismissible overlays on this page.
  useEffect(() => {
    if (!showSystemPrompt) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowSystemPrompt(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showSystemPrompt])

  const handleSaveSystemPrompt = async () => {
    if (!token || !activeConversation || savingPrompt) return
    setSavingPrompt(true)
    try {
      const trimmed = systemPromptDraft.trim()
      // 与内置默认逐字相同的文本不算自定义，否则页头会点亮一个其实没有差异的「自定义」标记
      const nextSystemPrompt = !trimmed || trimmed === EDITOR_AI_CHAT_SYSTEM_PROMPT ? null : trimmed
      const updated = await updateEditorAiConversation(token, activeConversation, {
        systemPrompt: nextSystemPrompt,
      })
      setConversations((prev) =>
        prev.map((c) => (c.id === activeConversation ? { ...c, systemPrompt: updated.systemPrompt } : c)),
      )
      setSystemPromptDraft(updated.systemPrompt || '')
      setShowSystemPrompt(false)
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized(error)
        return
      }
      notify(t('common.error'), 'error')
    } finally {
      setSavingPrompt(false)
    }
  }

  const handleSelectImages = () => {
    fileInputRef.current?.click()
  }

  const removeAttachedImage = useCallback((id: string) => {
    setAttachedImages((prev) => {
      const image = prev.find((item) => item.id === id)
      if (image) URL.revokeObjectURL(image.previewUrl)
      return prev.filter((item) => item.id !== id)
    })
  }, [])

  const addImageFiles = useCallback(async (files: File[]) => {
    if (!token || sending || files.length === 0) return

    const remainingSlots = Math.max(0, MAX_ATTACHED_IMAGES - attachedImagesRef.current.length)
    const accepted = files
      .filter((file) => (
        file.type.startsWith('image/')
        && file.size <= MAX_IMAGE_SIZE
        && (!imageMode || IMAGE_EDIT_MIME_TYPES.has(file.type))
      ))
      .slice(0, remainingSlots)

    if (accepted.length === 0) {
      notify(t(imageMode ? 'admin.ai_image_reference_format' : 'admin.ai_upload_failed'), 'error')
      return
    }

    const pending = accepted.map((file) => ({
      id: `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }))

    setAttachedImages((prev) => [
      ...prev,
      ...pending.map(({ id, previewUrl }) => ({
        id,
        url: '',
        key: '',
        previewUrl,
        status: 'uploading' as const,
      })),
    ])

    await Promise.all(pending.map(async ({ id, file }) => {
      try {
        const result = await uploadAiImage(token, file)
        setAttachedImages((prev) => prev.map((image) =>
          image.id === id
            ? { ...image, url: result.url, key: result.key, status: 'ready' as const }
            : image,
        ))
      } catch (error) {
        removeAttachedImage(id)
        if (error instanceof ApiUnauthorizedError) {
          handleUnauthorized(error)
          return
        }
        notify(t('admin.ai_upload_failed'), 'error')
      }
    }))
  }, [handleUnauthorized, imageMode, notify, removeAttachedImage, sending, t, token])

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (fileInputRef.current) fileInputRef.current.value = ''
    void addImageFiles(files)
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file))
    if (files.length === 0) return
    event.preventDefault()
    void addImageFiles(files)
  }

  const activeConvoData = conversations.find((c) => c.id === activeConversation)
  const hasCustomPrompt = Boolean(activeConvoData?.systemPrompt)
  const chatModels = models?.models.filter(supportsChat) ?? []
  const imageModels = models?.models.filter(supportsImageGeneration) ?? []
  const activeModelLabel = imageMode ? (selectedImageModel || 'image model') : (selectedModel || 'default')

  const handleSend = async (override?: {
    prompt?: string
    replaceMessageId?: string
    images?: AttachedImage[]
  }): Promise<boolean> => {
    const sendableImages = (override?.images ?? attachedImages).filter((image) => image.status === 'ready' && image.url)
    const rawUserInput = (override?.prompt ?? input).trim()
    if (!token || sending || uploadingImages || (
      imageMode ? !rawUserInput : (!rawUserInput && sendableImages.length === 0)
    )) return false
    if (imageMode && !selectedImageModel) {
      notify(t('admin.ai_image_model_required'), 'error')
      return false
    }

    let conversationId = activeConversation
    const userInput = rawUserInput || t('admin.ai_image_only_prompt')
    // Editing an existing turn rolls the conversation back to that message first; the
    // server deletes it (and everything after it) in the same request that appends the
    // replacement turn.
    const replaceMessageId = override?.replaceMessageId
    const truncateFromMessageId = replaceMessageId
      ? (persistedMessageIds[replaceMessageId]
        ?? (replaceMessageId.startsWith('local-') ? undefined : replaceMessageId))
      : undefined

    // Auto-create conversation if none active. Skip the effect's first empty fetch,
    // otherwise it can race with and hide this first optimistic message.
    if (!conversationId) {
      try {
        const convo = await createEditorAiConversation(token, {
          scopeId: SCOPE_ID,
          title: userInput.slice(0, 50),
        })
        setConversations((prev) => [convo, ...prev])
        skipConversationLoadRef.current = convo.id
        activeConversationRef.current = convo.id
        setActiveConversation(convo.id)
        setLoadingConversation(false)
        conversationId = convo.id
      } catch (error) {
        if (error instanceof ApiUnauthorizedError) {
          handleUnauthorized(error)
          return false
        }
        notify(t('common.error'), 'error')
        return false
      }
    }

    const currentConversation = conversations.find((conversation) => conversation.id === conversationId)
    const conversationTitle = currentConversation && (
      !currentConversation.title || currentConversation.title === t('admin.ai_new_chat')
    ) ? deriveConversationTitle(rawUserInput || userInput) : undefined
    if (conversationTitle) {
      setConversations((previous) => previous.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, title: conversationTitle, updatedAt: new Date().toISOString() }
          : conversation,
      ))
      void updateEditorAiConversation(token, conversationId, { title: conversationTitle }).catch((error) => {
        if (error instanceof ApiUnauthorizedError) handleUnauthorized(error)
        else console.warn('Failed to update AI conversation title:', error)
      })
    }

    const quoted = override ? null : quotedMessage
    const images = sendableImages.map((image) => image.url)
    const imageMeta = sendableImages.map((image) => ({ url: image.url, key: image.key }))
    const prompt = quoted
      ? `> ${quoted.content.split('\n').join('\n> ')}\n\n${userInput}`
      : userInput
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
      ...(imageMeta.length > 0 ? { metadata: { images: imageMeta } } : {}),
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

    if (!override) {
      attachedImages.forEach((image) => URL.revokeObjectURL(image.previewUrl))
      setInput('')
      setQuotedMessage(null)
      setAttachedImages([])
    }
    setSending(true)
    isNearBottomRef.current = true
    setMessages((prev) => {
      if (!replaceMessageId) return [...prev, optimisticUserMessage, optimisticAssistantMessage]
      const index = prev.findIndex((message) => message.id === replaceMessageId)
      const kept = index === -1 ? prev : prev.slice(0, index)
      return [...kept, optimisticUserMessage, optimisticAssistantMessage]
    })

    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const abortController = new AbortController()
    abortRef.current = abortController
    let accumulated = ''

    const updateAssistant = (content: string, status: EditorAiMessageStatus, error?: string) => {
      if (activeConversationRef.current !== conversationId) return
      setMessages((prev) => prev.map((message) =>
        message.id === assistantMessageId
          ? { ...message, content, status, error }
          : message,
      ))
    }

    try {
      if (imageMode) {
        const persistedConversation = await generateEditorAiImage(token, {
          conversationId,
          prompt,
          title: conversationTitle,
          imageModel: selectedImageModel || undefined,
          imageSize: selectedImageSize,
          images: images.length > 0 ? images : undefined,
          imageKeys: images.length > 0 ? sendableImages.map((image) => image.key) : undefined,
          truncateFromMessageId,
        })
        const persistedMessages = persistedConversation.messages || []
        const persistedUserMessage = persistedMessages.at(-2)
        const persistedAssistantMessage = persistedMessages.at(-1)
        setPersistedMessageIds((previous) => ({
          ...previous,
          ...(persistedUserMessage?.role === 'user' ? { [userMessageId]: persistedUserMessage.id } : {}),
          ...(persistedAssistantMessage?.role === 'assistant' ? { [assistantMessageId]: persistedAssistantMessage.id } : {}),
        }))
        if (activeConversationRef.current === conversationId) {
          setMessages((previous) => reconcilePersistedMessages(previous, persistedMessages))
        }
        setConversations((previous) => previous.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, title: persistedConversation.title, updatedAt: persistedConversation.updatedAt }
            : conversation,
        ))
      } else {
        await streamStoryAiGenerate(
          token,
          {
            conversationId,
            action: 'custom',
            prompt,
            model: selectedModel || undefined,
            title: conversationTitle,
            images: images.length > 0 ? images : undefined,
            imageKeys: images.length > 0 ? sendableImages.map((image) => image.key) : undefined,
            truncateFromMessageId,
          },
          {
            onChunk: (chunk) => {
              accumulated += chunk
              updateAssistant(accumulated, 'streaming')
            },
            onUsage: (usage) => {
              setMessages((prev) => prev.map((message) => (
                message.id === assistantMessageId ? withMessageUsage(message, usage) : message
              )))
            },
            onPersisted: (messageIds) => {
              setPersistedMessageIds((previous) => ({
                ...previous,
                [userMessageId]: messageIds.userMessageId,
                [assistantMessageId]: messageIds.assistantMessageId,
              }))
            },
            signal: abortController.signal,
          },
        )

        updateAssistant(accumulated, 'completed')
        if (images.length > 0) {
          try {
            const persistedConversation = await getEditorAiConversation(token, conversationId)
            const persistedMessages = persistedConversation.messages || []
            const persistedUserMessage = persistedMessages.at(-2)
            const persistedAssistantMessage = persistedMessages.at(-1)
            setPersistedMessageIds((previous) => ({
              ...previous,
              ...(persistedUserMessage?.role === 'user' ? { [userMessageId]: persistedUserMessage.id } : {}),
              ...(persistedAssistantMessage?.role === 'assistant' ? { [assistantMessageId]: persistedAssistantMessage.id } : {}),
            }))
          } catch (error) {
            console.warn('Failed to resolve persisted AI message IDs:', error)
          }
        }
        setConversations((prev) => prev.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, updatedAt: new Date().toISOString() }
            : conversation,
        ))
      }
      return true
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError'
      const errorMessage = aborted ? t('admin.ai_generation_stopped') : error instanceof Error ? error.message : t('common.error')
      updateAssistant(
        accumulated,
        aborted && accumulated ? 'completed' : 'failed',
        aborted && accumulated ? undefined : errorMessage,
      )
      if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized(error)
        return false
      }
      if (!aborted) notify(errorMessage, 'error')
      // A stopped turn was still appended (and rolled back) server-side, so the caller
      // can treat it as delivered.
      return aborted
    } finally {
      abortRef.current = null
      setSending(false)
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
  }

  const handleCopy = async (content: string, id: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch { /* ignore */ }
  }

  const handleQuote = (msg: EditorAiMessageDto) => {
    setQuotedMessage(msg)
    textareaRef.current?.focus()
  }

  /** Editing a user turn resends it: the server rolls the conversation back to that
   * message first, so everything after it is replaced by the new turn. */
  const handleEditSubmit = async (message: EditorAiMessageDto, content: string) => {
    if (!token || sending) return
    const images: AttachedImage[] = readImageRefs(message.metadata).flatMap((reference, index) => (
      reference.key
        ? [{
          id: `${message.id}-image-${index}`,
          url: reference.url,
          key: reference.key,
          previewUrl: reference.url,
          status: 'ready' as const,
        }]
        : []
    ))
    const delivered = await handleSend({
      prompt: content,
      replaceMessageId: message.id,
      images,
    })
    if (!delivered) throw new Error(t('common.error'))
  }

  /** Branches the conversation into a new one that ends at this assistant reply. */
  const handleFork = async (message: EditorAiMessageDto) => {
    if (!token || !activeConversation || sending || forkingId) return
    const persistedId = persistedMessageIds[message.id]
      ?? (message.id.startsWith('local-') ? undefined : message.id)
    if (!persistedId) {
      notify(t('admin.ai_message_pending'), 'error')
      return
    }
    const source = conversations.find((conversation) => conversation.id === activeConversation)
    const branchTitle = source?.title && source.title !== t('admin.ai_new_chat')
      ? `${source.title} · ${t('admin.ai_fork_short')}`
      : undefined

    setForkingId(message.id)
    try {
      const forked = await forkEditorAiConversation(token, activeConversation, {
        messageId: persistedId,
        ...(branchTitle ? { title: branchTitle } : {}),
      })
      const { messages: forkedMessages = [], ...forkedConversation } = forked
      setConversations((previous) => [forkedConversation, ...previous])
      skipConversationLoadRef.current = forkedConversation.id
      activeConversationRef.current = forkedConversation.id
      setActiveConversation(forkedConversation.id)
      setLoadingConversation(false)
      setMessages(forkedMessages)
      setPersistedMessageIds({})
      notify(t('admin.ai_fork_created'), 'success')
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized(error)
        return
      }
      notify(error instanceof Error ? error.message : t('admin.ai_fork_failed'), 'error')
    } finally {
      setForkingId(null)
    }
  }

  const handleSaveMessageImage = useCallback(async (messageId: string, imageUrl: string) => {
    if (!token) throw new Error(t('common.error'))
    try {
      await saveEditorAiMessageImage(token, messageId, imageUrl)
      notify(t('admin.ai_saved_to_album'), 'success')
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized(error)
      } else {
        notify(error instanceof Error ? error.message : t('admin.ai_save_to_album_failed'), 'error')
      }
      throw error
    }
  }, [handleUnauthorized, notify, t, token])


  const handleDownloadMessageImage = useCallback(async (imageUrl: string) => {
    try {
      const downloaded = await downloadImageToLocal(imageUrl)
      if (downloaded) notify(t('admin.ai_downloaded_to_local'), 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : t('admin.ai_download_to_local_failed'), 'error')
      throw error
    }
  }, [notify, t])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
    setInput(el.value)
  }

  if (loading) {
    return (
      <div className="flex h-full overflow-hidden bg-background">
        <div className="w-64 shrink-0 space-y-2 border-r border-border p-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
        <div className="flex-1 space-y-4 p-8">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-3/4" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden bg-background">
      <input
        ref={fileInputRef}
        type="file"
        accept={imageMode ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,image/gif,image/avif"}
        multiple
        onChange={handleFilesSelected}
        className="hidden"
      />
      {/* Conversation Sidebar */}
      <AnimatePresence initial={false}>
        {showSidebar && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.23, 0.36, 0.18, 0.97] }}
            className="flex flex-shrink-0 flex-col overflow-hidden border-r border-border bg-muted/30"
          >
            {/* Sidebar header */}
            <div className="px-4 pb-3 pt-4">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="font-serif text-lg leading-none tracking-tight">
                  {t('admin.ai_conversations')}
                </h2>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {conversations.length}
                </span>
              </div>
              <AdminButton
                onClick={handleNewConversation}
                adminVariant="outline"
                size="sm"
                className="w-full justify-start gap-2"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{t('admin.ai_new_chat')}</span>
              </AdminButton>
            </div>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-1">
              {conversations.length === 0 ? (
                <div className="px-2 py-10">
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    {t('admin.ai_no_conversations')}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground/70">
                    {t('admin.ai_no_conversations_hint')}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {conversations.map((convo) => {
                    const isActive = activeConversation === convo.id
                    return (
                      <motion.div
                        key={convo.id}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') switchConversation(convo.id)
                        }}
                        onClick={() => switchConversation(convo.id)}
                        onContextMenu={(event) => {
                          event.preventDefault()
                          const menuWidth = 160
                          const menuHeight = 82
                          setConversationMenu({
                            id: convo.id,
                            x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
                            y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
                          })
                        }}
                        className={`group relative flex cursor-pointer items-start gap-2 border-l-2 py-2 pl-2.5 pr-1 transition-colors ${
                          isActive
                            ? 'border-primary bg-background'
                            : 'border-transparent hover:bg-background/70'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          {renameTarget?.id === convo.id && renameTarget.surface === 'sidebar' ? (
                            <input
                              autoFocus
                              value={conversationTitleDraft}
                              onChange={(event) => setConversationTitleDraft(event.target.value)}
                              onFocus={(event) => event.currentTarget.select()}
                              onClick={(event) => event.stopPropagation()}
                              onPointerDown={(event) => event.stopPropagation()}
                              onBlur={() => void commitConversationTitle(convo.id)}
                              onKeyDown={(event) => {
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
                              className="h-7 w-full border border-border bg-background px-2 text-[13px] outline-none focus:border-primary"
                              aria-label={t('admin.ai_rename_conversation')}
                            />
                          ) : (
                            <div className={`truncate text-[13px] leading-5 transition-colors ${
                              isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
                            }`}>
                              {convo.title || t('admin.ai_new_chat')}
                            </div>
                          )}
                          <div className="mt-1 flex items-center gap-2">
                            <ScopeBadge scopeId={convo.scopeId} />
                            <span className="whitespace-nowrap text-[11px] text-muted-foreground/70 tabular-nums">
                              {formatConversationDate(convo.updatedAt)}
                            </span>
                          </div>
                        </div>

                        {generatingTitleId === convo.id && (
                          <Loader2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 animate-spin text-muted-foreground" />
                        )}

                        <button
                          disabled={generatingTitleId === convo.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteClick(convo.id)
                          }}
                          className={`mt-0.5 flex-shrink-0 p-1 transition-opacity focus-visible:opacity-100 disabled:cursor-default disabled:opacity-30 ${
                            pendingDeleteId === convo.id
                              ? 'opacity-100 text-destructive'
                              : 'opacity-0 text-muted-foreground group-hover:opacity-100 hover:text-destructive'
                          }`}
                          aria-label={pendingDeleteId === convo.id ? t('admin.ai_delete_confirm_again') : t('common.delete')}
                          title={pendingDeleteId === convo.id ? t('admin.ai_delete_confirm_again') : t('common.delete')}
                        >
                          {pendingDeleteId === convo.id ? <Trash2 className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        </button>
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Sidebar footer 鈥?subtle model indicator */}
            <div className="flex items-center gap-2 border-t border-border px-4 py-3">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {activeModelLabel}
              </span>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <div className="relative flex min-w-0 flex-1 flex-col bg-background">
        {/* Chat header */}
        <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-border px-4">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label={showSidebar ? 'Hide sidebar' : 'Show sidebar'}
          >
            <ChevronLeft className={`h-4 w-4 transition-transform duration-300 motion-reduce:transition-none ${!showSidebar ? 'rotate-180' : ''}`} />
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            {activeConversation && renameTarget?.id === activeConversation && renameTarget.surface === 'header' ? (
              <input
                autoFocus
                value={conversationTitleDraft}
                onChange={(event) => setConversationTitleDraft(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                onBlur={() => void commitConversationTitle(activeConversation)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    event.currentTarget.blur()
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    setRenameTarget(null)
                  }
                }}
                maxLength={200}
                className="h-8 min-w-0 flex-1 border border-border bg-background px-2.5 text-[13px] outline-none focus:border-primary"
                aria-label={t('admin.ai_rename_conversation')}
              />
            ) : (
              <button
                type="button"
                disabled={!activeConversation}
                onClick={() => { if (activeConversation) startRenamingConversation(activeConversation, 'header') }}
                className="min-w-0 truncate text-left text-[13px] text-foreground disabled:cursor-default"
                title={activeConversation ? t('admin.ai_rename_conversation') : undefined}
              >
                {activeConvoData?.title || t('admin.ai_assistant')}
              </button>
            )}
            {hasCustomPrompt && (
              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" title={t('admin.ai_system_prompt_title')} />
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => void openSystemPrompt()}
              className={`flex cursor-pointer items-center gap-1.5 border px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                showSystemPrompt || hasCustomPrompt
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              title={t('admin.ai_system_prompt_title')}
              aria-label={t('admin.ai_system_prompt_title')}
            >
              <Settings2 className="w-3 h-3" />
              <span className="hidden sm:inline">{t('admin.ai_system_prompt')}</span>
            </button>
            {activeConversation && messages.length > 0 && (
              <button
                onClick={handleClearConversation}
                className="flex cursor-pointer items-center gap-1.5 border border-transparent px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title={t('admin.ai_clear')}
                aria-label={t('admin.ai_clear')}
              >
                <Eraser className="w-3 h-3" />
                <span className="hidden sm:inline">{t('admin.ai_clear')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Messages area */}
        <div ref={messagesScrollRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto custom-scrollbar">
          {loadingConversation && activeConversation ? (
            <div className="flex h-full items-center justify-center text-muted-foreground/40">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : messages.length === 0 && !sending ? (
            <EmptyState t={t} textareaRef={textareaRef} setInput={setInput} />
          ) : (
            <div className="mx-auto max-w-[44rem] space-y-8 px-6 py-8">
              {messages.map((msg, index) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  usage={msg.role === 'user' ? findTurnUsage(messages, index) : readMessageUsage(msg.metadata)}
                  copiedId={copiedId}
                  onCopy={handleCopy}
                  onQuote={handleQuote}
                  onEditSubmit={msg.role === 'user' ? handleEditSubmit : undefined}
                  onFork={msg.role === 'assistant' ? handleFork : undefined}
                  onSaveImage={handleSaveMessageImage}
                  onDownloadImage={handleDownloadMessageImage}
                  persistedMessageId={persistedMessageIds[msg.id]}
                  busy={sending || forkingId !== null}
                  t={t}
                />
              ))}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="flex-shrink-0 border-t border-border p-4">
          <div className="mx-auto max-w-[44rem]">
            <div className="relative border border-border bg-background transition-colors focus-within:border-primary">
              {/* Quote preview */}
              <AnimatePresence>
                {quotedMessage && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <div className="mx-4 mt-3 flex items-start gap-2.5 border-l-2 border-primary bg-muted/50 px-3 py-2">
                      <Quote className="mt-0.5 h-3 w-3 flex-shrink-0 text-muted-foreground" />
                      <p className="line-clamp-2 flex-1 text-[13px] leading-relaxed text-muted-foreground">
                        {quotedMessage.content}
                      </p>
                      <button
                        onClick={() => setQuotedMessage(null)}
                        className="flex-shrink-0 p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="Remove quote"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Image preview strip */}
              <AnimatePresence>
                {attachedImages.length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <div className="mx-4 mt-3 flex flex-wrap items-center gap-2">
                      {attachedImages.map((img) => (
                        <div key={img.id} className="group relative h-14 w-14 flex-shrink-0 overflow-hidden border border-border">
                          <img
                            src={img.previewUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                          <button
                            onClick={() => removeAttachedImage(img.id)}
                            className="absolute right-0.5 top-0.5 cursor-pointer bg-background/80 p-0.5 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                            aria-label="Remove image"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                          {img.status === 'uploading' && (
                            <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/40" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <textarea
                ref={textareaRef}
                value={input}
                onChange={autoResize}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={t('admin.ai_input_placeholder')}
                rows={1}
                disabled={sending}
                className="w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-sm leading-6 outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
                style={{ maxHeight: 200 }}
              />

              <div className="flex items-center justify-between px-3 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleSelectImages}
                    disabled={sending || uploadingImages}
                    className="flex cursor-pointer items-center gap-1.5 px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={imageMode ? t('admin.ai_image_reference') : t('admin.ai_attach_image')}
                    title={imageMode ? t('admin.ai_image_reference') : t('admin.ai_attach_image')}
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                  </button>
                  {imageModels.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setImageMode((previous) => !previous)}
                      disabled={sending}
                      className={`flex cursor-pointer items-center gap-1.5 border px-2 py-1 text-[11px] font-bold uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        imageMode
                          ? 'border-primary/30 bg-primary/10 text-primary'
                          : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <ImageIcon className="h-3 w-3" />
                      <span className="hidden sm:inline">{t('admin.ai_generate_image')}</span>
                    </button>
                  )}
                  {imageMode ? (
                    <>
                      {imageModels.length > 0 && (
                        <ModelSelector
                          models={imageModels}
                          value={selectedImageModel}
                          onChange={setSelectedImageModel}
                          icon="image"
                        />
                      )}
                      <select
                        value={selectedImageSize}
                        onChange={(event) => setSelectedImageSize(event.target.value)}
                        disabled={sending}
                        className="h-7 border border-border bg-background px-2 text-[11px] text-foreground outline-none disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <option value="1024x1024">1:1</option>
                        <option value="1024x1792">9:16</option>
                        <option value="1792x1024">16:9</option>
                      </select>
                    </>
                  ) : (
                    chatModels.length > 0 && (
                      <ModelSelector models={chatModels} value={selectedModel} onChange={setSelectedModel} />
                    )
                  )}
                  <span className="hidden text-[11px] text-muted-foreground/70 sm:inline">
                    Enter {t('admin.ai_newline')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {sending ? (
                    <button
                      onClick={handleStop}
                      className="flex h-9 flex-shrink-0 cursor-pointer items-center gap-1.5 border border-border px-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Stop generating"
                    >
                      <StopCircle className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{t('admin.ai_stop') || 'Stop'}</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => void handleSend()}
                      disabled={!canSend}
                      className="flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label="Send message"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* System prompt drawer — slides in from the right edge of the workspace */}
        <AnimatePresence>
          {showSystemPrompt && (
            <motion.div
              key="system-prompt-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.15 }}
              onPointerDown={() => setShowSystemPrompt(false)}
              className="absolute inset-0 z-20 bg-black/10 dark:bg-black/40"
            />
          )}
          {showSystemPrompt && (
            <motion.aside
              key="system-prompt-drawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby="ai-system-prompt-title"
              initial={{ x: reduceMotion ? 0 : '100%' }}
              animate={{ x: 0 }}
              exit={{ x: reduceMotion ? 0 : '100%' }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[26rem] flex-col border-l border-border bg-background"
            >
              <div className="flex h-14 flex-shrink-0 items-center justify-between gap-3 border-b border-border px-5">
                <div className="flex min-w-0 items-baseline gap-2">
                  <h2 id="ai-system-prompt-title" className="font-serif text-base leading-none tracking-tight">
                    {t('admin.ai_system_prompt_title')}
                  </h2>
                  {hasCustomPrompt && !systemPromptDraft.trim() && (
                    <span className="truncate text-[11px] text-muted-foreground">
                      {t('admin.ai_system_prompt_revert')}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowSystemPrompt(false)}
                  className="flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={t('common.close')}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
                <textarea
                  value={systemPromptDraft}
                  onChange={(e) => setSystemPromptDraft(e.target.value)}
                  placeholder={EDITOR_AI_CHAT_SYSTEM_PROMPT}
                  className="min-h-0 flex-1 resize-none border border-border bg-background px-3 py-2.5 text-[13px] leading-relaxed outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                  aria-label={t('admin.ai_system_prompt_title')}
                />
                <p className="flex-shrink-0 text-[11px] leading-relaxed text-muted-foreground">
                  {t('admin.ai_system_prompt_hint')}
                </p>
              </div>

              <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
                <button
                  onClick={() => setSystemPromptDraft(EDITOR_AI_CHAT_SYSTEM_PROMPT)}
                  className="flex cursor-pointer items-center gap-1 border border-border px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={t('admin.ai_system_prompt_reset')}
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  {t('admin.ai_system_prompt_reset')}
                </button>
                <button
                  onClick={handleSaveSystemPrompt}
                  disabled={savingPrompt}
                  className="flex cursor-pointer items-center gap-1.5 bg-primary px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {savingPrompt ? t('admin.ai_system_prompt_saving') : t('admin.ai_system_prompt_save')}
                </button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {conversationMenu && typeof document !== 'undefined' && createPortal(
        <div
          role="menu"
          className="fixed z-[100] min-w-44 border border-border bg-popover p-1 shadow-lg"
          style={{ left: conversationMenu.x, top: conversationMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            disabled={Boolean(generatingTitleId)}
            onClick={() => void handleGenerateConversationTitle(conversationMenu.id)}
            className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[13px] text-popover-foreground transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-50"
          >
            {generatingTitleId === conversationMenu.id
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Sparkles className="h-3.5 w-3.5" />}
            {t('admin.ai_generate_title')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => startRenamingConversation(conversationMenu.id, 'sidebar')}
            className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[13px] text-popover-foreground transition-colors hover:bg-muted"
          >
            <Pencil className="h-3.5 w-3.5" />
            {t('admin.ai_rename_conversation')}
          </button>
        </div>,
        document.body,
      )}
    </div>
  )
}

/* Empty State */

function EmptyState({
  t,
  textareaRef,
  setInput,
}: {
  t: (key: string) => string
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  setInput: (value: string) => void
}) {
  const prompts = [
    t('admin.ai_prompt_narrative'),
    t('admin.ai_prompt_describe'),
    t('admin.ai_prompt_title'),
  ]

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 pb-12">
      <div className="w-full max-w-xl">
        <h2 className="font-serif text-3xl leading-tight tracking-tight">
          {t('admin.ai_assistant')}
        </h2>
        <p className="mt-3 max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
          {t('admin.ai_welcome')}
        </p>

        <p className="mb-2 mt-9 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {t('admin.ai_starters')}
        </p>
        <div className="border-t border-border">
          {prompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => {
                setInput(prompt)
                textareaRef.current?.focus()
              }}
              className="group flex w-full cursor-pointer items-center border-b border-border px-1 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <span className="text-[13px] leading-relaxed text-muted-foreground transition-colors group-hover:text-foreground">
                {prompt}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* Message Bubble */

function MessageBubble({
  message,
  usage,
  copiedId,
  onCopy,
  onQuote,
  onEditSubmit,
  onFork,
  onSaveImage,
  onDownloadImage,
  persistedMessageId,
  busy,
  t,
}: {
  message: EditorAiMessageDto
  usage?: EditorAiUsage | null
  copiedId: string | null
  onCopy: (content: string, id: string) => void
  onQuote: (msg: EditorAiMessageDto) => void
  onEditSubmit?: (message: EditorAiMessageDto, content: string) => Promise<void>
  onFork?: (message: EditorAiMessageDto) => void
  onSaveImage: (messageId: string, imageUrl: string) => Promise<void>
  onDownloadImage: (imageUrl: string) => Promise<void>
  persistedMessageId?: string
  busy?: boolean
  t: (key: string) => string
}) {
  const isUser = message.role === 'user'
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const editRef = useRef<HTMLTextAreaElement>(null)

  const messageImages = getMessageImages(message.metadata)
  const saveMessageId = persistedMessageId || message.id
  const usageLabel = usage ? formatUsageSummary(usage, t, isUser ? 'user' : 'assistant') : ''
  const usageDetail = usage ? formatUsageDetail(usage, t) : ''

  useEffect(() => {
    if (!editing) return
    const node = editRef.current
    if (!node) return
    node.focus()
    node.style.height = 'auto'
    node.style.height = `${Math.min(node.scrollHeight, 200)}px`
  }, [editing])

  const beginEdit = () => {
    setDraft(message.content)
    setEditing(true)
  }

  const submitEdit = async () => {
    if (!onEditSubmit || busy) return
    const next = draft.trim()
    if (!next) return
    // The page notifies on failure; keep the editor open so the draft survives.
    try {
      await onEditSubmit(message, next)
      setEditing(false)
    } catch {
      /* keep editing */
    }
  }

  const actionClass = 'inline-flex cursor-pointer items-center gap-1 px-1 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-40'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="min-w-0 max-w-[85%]">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {t('admin.ai_you')}
          </div>
          <div className="border-l-2 border-primary bg-muted/50 px-4 py-3">
            {editing ? (
              <textarea
                ref={editRef}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value)
                  const node = event.currentTarget
                  node.style.height = 'auto'
                  node.style.height = `${Math.min(node.scrollHeight, 200)}px`
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void submitEdit()
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    setEditing(false)
                  }
                }}
                rows={1}
                className="w-full resize-none bg-transparent text-sm leading-relaxed text-foreground outline-none"
                aria-label={t('admin.ai_edit')}
              />
            ) : (
              <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                {message.content}
              </div>
            )}
            {messageImages.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {messageImages.map((image, index) => (
                  <MessageImage
                    key={`${image.url}-${index}`}
                    image={image}
                    alt=""
                    onSave={() => onSaveImage(saveMessageId, image.url)}
                    onDownload={() => onDownloadImage(image.url)}
                    t={t}
                  />
                ))}
              </div>
            )}
          </div>
          {editing ? (
            <div className="mt-1.5 flex items-center gap-3">
              <span className="mr-auto text-[11px] text-muted-foreground">{t('admin.ai_edit_hint')}</span>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className={actionClass}
              >
                {t('admin.ai_edit_cancel')}
              </button>
              <button
                type="button"
                onClick={() => void submitEdit()}
                disabled={busy || !draft.trim()}
                className={actionClass}
              >
                <Send className="h-3 w-3" />
                {t('admin.ai_edit_send')}
              </button>
            </div>
          ) : (
            <div className="mt-1.5 flex items-center gap-3">
              {usageLabel && (
                <span
                  className="mr-auto text-[11px] tabular-nums text-muted-foreground"
                  title={usageDetail}
                >
                  {usageLabel}
                </span>
              )}
              {onEditSubmit && (
                <button
                  type="button"
                  onClick={beginEdit}
                  disabled={busy}
                  className={actionClass}
                  aria-label={t('admin.ai_edit')}
                >
                  <Pencil className="h-3 w-3" />
                  {t('admin.ai_edit')}
                </button>
              )}
              <button
                onClick={() => onQuote(message)}
                className={actionClass}
                aria-label={t('admin.ai_quote')}
              >
                <Quote className="h-3 w-3" />
                {t('admin.ai_quote')}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Assistant message — the answer reads as the main column of the sheet,
  // the label sits on the margin rule.
  return (
    <div className="border-l border-border pl-4">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        <span>AI</span>
        {message.status === 'streaming' && (
          <span className="text-primary">{t('admin.ai_thinking')}</span>
        )}
      </div>

      <div className="break-words text-sm leading-relaxed text-foreground">
        {message.status === 'streaming' && !message.content ? (
          <span className="flex gap-1">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="h-1 w-1 animate-bounce rounded-full bg-primary/50"
                style={{ animationDelay: `${index * 150}ms` }}
              />
            ))}
          </span>
        ) : (
          <div className="ai-markdown">
            <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
            {message.status === 'streaming' && (
              <span className="ml-0.5 inline-block h-4 w-[3px] animate-pulse rounded-full bg-primary align-middle" />
            )}
          </div>
        )}
      </div>

      {messageImages.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {messageImages.map((image, index) => (
            <MessageImage
              key={`${image.url}-${index}`}
              image={image}
              alt=""
              onSave={() => onSaveImage(saveMessageId, image.url)}
              onDownload={() => onDownloadImage(image.url)}
              t={t}
            />
          ))}
        </div>
      )}

      {message.status === 'failed' && message.error && (
        <div className="mt-3 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-[13px] leading-relaxed text-destructive">
          {message.error}
        </div>
      )}

      {message.content && (
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={() => onCopy(message.content, message.id)}
            className="inline-flex cursor-pointer items-center gap-1 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            aria-label={t('admin.ai_copy')}
          >
            {copiedId === message.id ? (
              <>
                <Check className="h-3 w-3 text-green-600" />
                <span className="text-green-600">{t('admin.ai_copied')}</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>{t('admin.ai_copy')}</span>
              </>
            )}
          </button>
          <button
            onClick={() => onQuote(message)}
            className="inline-flex cursor-pointer items-center gap-1 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            aria-label={t('admin.ai_quote')}
          >
            <Quote className="h-3 w-3" />
            <span>{t('admin.ai_quote')}</span>
          </button>
          {onFork && (
            <button
              type="button"
              onClick={() => onFork(message)}
              disabled={busy}
              className="inline-flex cursor-pointer items-center gap-1 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-40"
              aria-label={t('admin.ai_fork')}
            >
              <GitBranch className="h-3 w-3" />
              <span>{t('admin.ai_fork')}</span>
            </button>
          )}
          {usageLabel && (
            <span
              className="text-[11px] tabular-nums text-muted-foreground"
              title={usageDetail}
            >
              {usageLabel}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/* Model Selector */

function ModelSelector({
  models,
  value,
  onChange,
  icon = 'sparkles',
}: {
  models: { id: string; label: string }[]
  value: string
  onChange: (value: string) => void
  icon?: 'sparkles' | 'image'
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = models.find((m) => m.id === value)

  const filtered = search.trim()
    ? models.filter((m) => m.label.toLowerCase().includes(search.trim().toLowerCase()))
    : models

  const handleToggle = () => {
    const nextIsOpen = !isOpen
    if (nextIsOpen) setSearch('')
    setIsOpen(nextIsOpen)
  }

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => searchRef.current?.focus())
    }
  }, [isOpen])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isOpen && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside, true)
    return () => document.removeEventListener('click', handleClickOutside, true)
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="flex cursor-pointer items-center gap-1.5 border border-border px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {icon === 'image'
          ? <ImageIcon className="h-3 w-3 text-muted-foreground" />
          : <Sparkles className="h-3 w-3 text-muted-foreground" />}
        <span className="max-w-20 truncate">{selected?.label ?? 'Model'}</span>
        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute bottom-full left-0 z-20 mb-1.5 w-56 overflow-hidden border border-border bg-popover shadow-lg"
          >
            {/* Search */}
            <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
              <Search className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search models..."
                className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60"
              />
            </div>

            {/* Options */}
            <div className="max-h-44 overflow-y-auto custom-scrollbar py-1">
              {filtered.length === 0 ? (
                <div className="px-3 py-3 text-center text-[11px] text-muted-foreground">
                  No results
                </div>
              ) : (
                filtered.map((m) => {
                  const isSelected = value === m.id
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        onChange(m.id)
                        setIsOpen(false)
                      }}
                      className={`flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-[13px] transition-colors ${
                        isSelected
                          ? 'bg-muted text-foreground'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                      }`}
                    >
                      <span className="truncate">{m.label}</span>
                      {isSelected && <Check className="h-3 w-3 flex-shrink-0 text-primary" />}
                    </button>
                  )
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* Scope Badge */

const SCOPE_LABELS: Record<string, { label: string; color: string }> = {
  'ai-assistant': { label: 'Chat', color: 'bg-primary/10 text-primary' },
  'story-editor': { label: 'Story', color: 'bg-muted text-foreground' },
  'blog-editor': { label: 'Blog', color: 'bg-muted text-muted-foreground' },
}

function ScopeBadge({ scopeId }: { scopeId: string }) {
  const config = SCOPE_LABELS[scopeId] ?? {
    label: scopeId.length > 12 ? `${scopeId.slice(0, 12)}...` : scopeId,
    color: 'bg-muted text-muted-foreground',
  }

  return (
    <span className={`inline-flex items-center px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.14em] leading-4 ${config.color}`}>
      {config.label}
    </span>
  )
}
