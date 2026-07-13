'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Plus,
  Send,
  MessageSquare,
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
  Trash2,
  Download,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
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
  saveEditorAiMessageImage,
} from '@/lib/api/story-ai'
import type {
  EditorAiConversationDto,
  EditorAiMessageDto,
  EditorAiMessageStatus,
  StoryAiModelOption,
  StoryAiModelsResponse,
} from '@/lib/api/types'
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
    <div className="relative max-w-[200px] rounded-lg overflow-hidden border border-border/20">
      <img
        src={image.url}
        alt={alt}
        className="max-h-[200px] object-contain bg-muted/20"
        loading="lazy"
        onContextMenu={handleContextMenu}
      />
      {contextMenu && typeof document !== 'undefined' && createPortal(
        <div
          role="menu"
          className="fixed z-[100] min-w-44 rounded-lg border border-border bg-popover p-1 shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            disabled={saving || saved}
            onClick={() => void handleSave()}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-popover-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-default disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
            {saved ? t('admin.ai_saved_to_album') : t('admin.ai_save_to_album')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={downloading}
            onClick={() => void handleDownload()}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-popover-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-default disabled:opacity-50"
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

// Staggered reveal variants
const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.35, ease: [0.23, 0.36, 0.18, 0.97] as const },
  }),
}

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
      setSystemPromptDraft('')
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

  const handleNewConversation = async () => {
    clearDeleteArm()
    setConversationMenu(null)
    setRenameTarget(null)
    if (!token) return
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
      setInput('')
      textareaRef.current?.focus()
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized(error)
        return
      }
      notify(t('common.error'), 'error')
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

  const handleSaveSystemPrompt = async () => {
    if (!token || !activeConversation || savingPrompt) return
    setSavingPrompt(true)
    try {
      const trimmed = systemPromptDraft.trim()
      const updated = await updateEditorAiConversation(token, activeConversation, {
        systemPrompt: trimmed || null,
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

  const handleSend = async () => {
    const sendableImages = attachedImages.filter((image) => image.status === 'ready' && image.url)
    if (!token || sending || uploadingImages || (
      imageMode ? !input.trim() : (!input.trim() && sendableImages.length === 0)
    )) return
    if (imageMode && !selectedImageModel) {
      notify(t('admin.ai_image_model_required'), 'error')
      return
    }

    let conversationId = activeConversation
    const rawUserInput = input.trim()
    const userInput = rawUserInput || t('admin.ai_image_only_prompt')

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
          return
        }
        notify(t('common.error'), 'error')
        return
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

    const quoted = quotedMessage
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

    attachedImages.forEach((image) => URL.revokeObjectURL(image.previewUrl))
    setInput('')
    setQuotedMessage(null)
    setAttachedImages([])
    setSending(true)
    isNearBottomRef.current = true
    setMessages((prev) => [...prev, optimisticUserMessage, optimisticAssistantMessage])

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
          },
          {
            onChunk: (chunk) => {
              accumulated += chunk
              updateAssistant(accumulated, 'streaming')
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
        return
      }
      if (!aborted) notify(errorMessage, 'error')
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
      <div className="h-full flex overflow-hidden rounded-2xl">
        <div className="w-64 border-r border-border p-3 space-y-2 shrink-0">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
        <div className="flex-1 p-6 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-3/4" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex overflow-hidden rounded-2xl">
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
            className="flex-shrink-0 flex flex-col overflow-hidden border-r border-border/40 bg-gradient-to-b from-muted/10 via-background to-muted/5"
          >
            {/* Sidebar header */}
            <div className="px-5 pb-4 pt-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    {t('admin.ai_conversations')}
                  </span>
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground/50">
                  {conversations.length}
                </span>
              </div>
              <AdminButton
                onClick={handleNewConversation}
                adminVariant="outlineMuted"
                size="sm"
                className="w-full justify-start gap-2.5 rounded-xl border-dashed border-border/60 bg-transparent py-2.5 text-xs font-medium hover:border-amber-500/30 hover:bg-amber-500/[0.04] hover:text-foreground transition-all duration-200"
              >
                <Plus className="w-3.5 h-3.5 text-amber-500/70" />
                <span>{t('admin.ai_new_chat')}</span>
              </AdminButton>
            </div>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-3">
              {conversations.length === 0 ? (
                <div className="py-16 text-center">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.15 }}
                    transition={{ delay: 0.2 }}
                  >
                    <MessageSquare className="w-8 h-8 mx-auto mb-4" />
                  </motion.div>
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/30">
                    {t('admin.ai_no_conversations')}
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {conversations.map((convo, idx) => {
                    const isActive = activeConversation === convo.id
                    return (
                      <motion.div
                        key={convo.id}
                        custom={idx}
                        initial="hidden"
                        animate="visible"
                        variants={staggerItem}
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
                        className={`group relative flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-all duration-200 rounded-xl ${
                          isActive
                            ? 'bg-amber-500/[0.08] text-foreground shadow-[inset_0_1px_0_rgba(245,158,11,0.08)]'
                            : 'hover:bg-muted/50 text-muted-foreground'
                        }`}
                      >
                        {/* Active indicator */}
                        {isActive && (
                          <motion.div
                            layoutId="sidebar-active"
                            className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-amber-500/80"
                            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                          />
                        )}

                        <span className={`flex-shrink-0 text-[10px] tabular-nums font-medium w-5 text-right ${
                          isActive ? 'text-amber-500/80' : 'text-muted-foreground/25 group-hover:text-muted-foreground/40'
                        }`}>
                          {idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                        </span>

                        <div className="flex-1 min-w-0">
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
                              className="h-6 w-full rounded-md border border-amber-500/40 bg-background px-2 text-xs outline-none"
                              aria-label={t('admin.ai_rename_conversation')}
                            />
                          ) : (
                            <div className={`text-xs leading-5 truncate transition-colors duration-200 ${
                              isActive ? 'font-medium' : 'font-normal'
                            }`}>
                              {convo.title || t('admin.ai_new_chat')}
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <ScopeBadge scopeId={convo.scopeId} />
                            <span className="whitespace-nowrap text-[10px] text-muted-foreground/40 tabular-nums">
                              {formatConversationDate(convo.updatedAt)}
                            </span>
                          </div>
                        </div>

                        {generatingTitleId === convo.id && (
                          <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-amber-500/70" />
                        )}

                        <button
                          disabled={generatingTitleId === convo.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteClick(convo.id)
                          }}
                          className={`flex-shrink-0 p-1 transition-all duration-200 rounded-md hover:bg-destructive/5 disabled:cursor-default disabled:opacity-30 ${
                            pendingDeleteId === convo.id
                              ? 'opacity-100 text-destructive'
                              : 'opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-destructive'
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
            <div className="px-4 py-3 border-t border-border/30">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500/50" />
                <span className="tracking-wider uppercase">{activeModelLabel}</span>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        {/* Chat header */}
        <div className="flex items-center gap-3 px-5 h-14 border-b border-border/30 flex-shrink-0 bg-background/80 backdrop-blur-sm">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-all duration-200"
            aria-label={showSidebar ? 'Hide sidebar' : 'Show sidebar'}
          >
            <ChevronLeft className={`w-4 h-4 transition-transform duration-300 ${!showSidebar ? 'rotate-180' : ''}`} />
          </button>

          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            </span>
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
                className="h-8 min-w-0 flex-1 rounded-lg border border-amber-500/25 bg-muted/20 px-2.5 text-xs font-medium tracking-wide outline-none focus:border-amber-500/50"
                aria-label={t('admin.ai_rename_conversation')}
              />
            ) : (
              <button
                type="button"
                disabled={!activeConversation}
                onClick={() => { if (activeConversation) startRenamingConversation(activeConversation, 'header') }}
                className="min-w-0 truncate text-left text-xs font-medium tracking-wide disabled:cursor-default"
                title={activeConversation ? t('admin.ai_rename_conversation') : undefined}
              >
                {activeConvoData?.title || t('admin.ai_assistant')}
              </button>
            )}
            {hasCustomPrompt && (
              <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500/60" title={t('admin.ai_system_prompt_title')} />
            )}
          </div>

          <div className="flex items-center gap-1">
            {activeConversation && (
              <button
                onClick={() => {
                  setShowSystemPrompt(!showSystemPrompt)
                  if (!showSystemPrompt) {
                    setSystemPromptDraft(activeConvoData?.systemPrompt || '')
                  }
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                  showSystemPrompt || hasCustomPrompt
                    ? 'text-amber-500/80 bg-amber-500/[0.06] border border-amber-500/15'
                    : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50 border border-transparent'
                }`}
                title={t('admin.ai_system_prompt_title')}
                aria-label={t('admin.ai_system_prompt_title')}
              >
                <Settings2 className="w-3 h-3" />
                <span className="hidden sm:inline">{t('admin.ai_system_prompt')}</span>
              </button>
            )}
            {activeConversation && messages.length > 0 && (
              <button
                onClick={handleClearConversation}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50 transition-all duration-200"
                title={t('admin.ai_clear')}
                aria-label={t('admin.ai_clear')}
              >
                <Eraser className="w-3 h-3" />
                <span className="hidden sm:inline">{t('admin.ai_clear')}</span>
              </button>
            )}
          </div>
        </div>

        {/* System prompt editor */}
        <AnimatePresence>
          {showSystemPrompt && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="overflow-hidden border-b border-border/30 bg-muted/[0.06]"
            >
              <div className="px-5 py-4 max-w-[44rem] mx-auto">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/[0.08]">
                      <Settings2 className="h-3 w-3 text-amber-500/70" />
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {t('admin.ai_system_prompt_title')}
                    </span>
                    {hasCustomPrompt && !systemPromptDraft.trim() && (
                      <span className="text-[10px] text-amber-500/60 font-medium">
                        {t('admin.ai_system_prompt_revert')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSystemPromptDraft('')
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/40 transition-all duration-200 cursor-pointer"
                      aria-label={t('admin.ai_system_prompt_reset')}
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span className="hidden sm:inline">{t('admin.ai_system_prompt_reset')}</span>
                    </button>
                    <button
                      onClick={handleSaveSystemPrompt}
                      disabled={savingPrompt}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-foreground text-background hover:bg-foreground/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer"
                    >
                      {savingPrompt ? t('admin.ai_system_prompt_saving') : t('admin.ai_system_prompt_save')}
                    </button>
                  </div>
                </div>
                <textarea
                  value={systemPromptDraft}
                  onChange={(e) => setSystemPromptDraft(e.target.value)}
                  placeholder={t('admin.ai_system_prompt_placeholder')}
                  rows={3}
                  className="w-full resize-none bg-background/60 border border-border/30 rounded-xl px-4 py-3 text-xs leading-relaxed outline-none placeholder:text-muted-foreground/20 focus:border-amber-500/25 focus:bg-background transition-all duration-200"
                />
                <p className="mt-2 text-[10px] text-muted-foreground/25 leading-relaxed">
                  {t('admin.ai_system_prompt_hint')}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages area */}
        <div ref={messagesScrollRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto custom-scrollbar">
          {loadingConversation && activeConversation ? (
            <div className="flex h-full items-center justify-center text-muted-foreground/40">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : !activeConversation && messages.length === 0 && !sending ? (
            <EmptyState t={t} textareaRef={textareaRef} setInput={setInput} />
          ) : (
            <div className="max-w-[44rem] mx-auto px-5 py-6 space-y-4">
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                  >
                    <MessageBubble
                      message={msg}
                      copiedId={copiedId}
                      onCopy={handleCopy}
                      onQuote={handleQuote}
                      onSaveImage={handleSaveMessageImage}
                      onDownloadImage={handleDownloadMessageImage}
                      persistedMessageId={persistedMessageIds[msg.id]}
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
        <div className="border-t border-border/30 p-4 flex-shrink-0 bg-gradient-to-t from-muted/[0.03] to-background">
          <div className="max-w-[44rem] mx-auto">
            <div className="relative rounded-2xl border border-border/40 bg-muted/[0.12] shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition-all duration-300 focus-within:border-amber-500/25 focus-within:shadow-[0_2px_16px_rgba(245,158,11,0.06)]">
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
                    <div className="flex items-start gap-2.5 mx-4 mt-3 px-3 py-2.5 rounded-xl bg-amber-500/[0.04] border-l-2 border-amber-500/30">
                      <Quote className="w-3 h-3 text-amber-500/40 flex-shrink-0 mt-0.5" />
                      <p className="flex-1 text-xs text-muted-foreground/70 line-clamp-2 leading-relaxed italic">
                        {quotedMessage.content}
                      </p>
                      <button
                        onClick={() => setQuotedMessage(null)}
                        className="flex-shrink-0 p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors cursor-pointer"
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
                    <div className="flex items-center gap-2 mx-4 mt-3 flex-wrap">
                      {attachedImages.map((img) => (
                        <div key={img.id} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-border/30 flex-shrink-0">
                          <img
                            src={img.previewUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                          <button
                            onClick={() => removeAttachedImage(img.id)}
                            className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-background/80 text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
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
                className="w-full resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-muted-foreground/30 disabled:opacity-40 px-4 pt-3.5 pb-1"
                style={{ maxHeight: 200 }}
              />

              <div className="flex items-center justify-between px-3 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleSelectImages}
                    disabled={sending || uploadingImages}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/40 disabled:opacity-30 transition-all duration-200 cursor-pointer"
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
                      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-medium transition-all disabled:opacity-30 ${
                        imageMode
                          ? 'border-amber-500/30 bg-amber-500/[0.06] text-amber-500'
                          : 'border-border/30 text-muted-foreground/50 hover:text-muted-foreground'
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
                        className="h-7 rounded-lg border border-border/30 bg-transparent px-2 text-[10px] text-muted-foreground outline-none disabled:opacity-30"
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
                  <span className="hidden sm:inline text-[10px] text-muted-foreground/25 tracking-wide">
                    Enter {t('admin.ai_newline')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {sending ? (
                    <button
                      onClick={handleStop}
                      className="flex-shrink-0 h-9 px-3 flex items-center gap-1.5 rounded-xl border border-border/40 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-200 cursor-pointer"
                      aria-label="Stop generating"
                    >
                      <StopCircle className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{t('admin.ai_stop') || 'Stop'}</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleSend}
                      disabled={!canSend}
                      className="flex-shrink-0 h-9 w-9 flex items-center justify-center rounded-xl bg-foreground text-background hover:bg-foreground/90 hover:shadow-[0_2px_8px_rgba(0,0,0,0.1)] disabled:opacity-15 disabled:cursor-not-allowed disabled:hover:shadow-none transition-all duration-200 cursor-pointer"
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
      </div>

      {conversationMenu && typeof document !== 'undefined' && createPortal(
        <div
          role="menu"
          className="fixed z-[100] min-w-40 rounded-lg border border-border bg-popover p-1 shadow-xl"
          style={{ left: conversationMenu.x, top: conversationMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            disabled={Boolean(generatingTitleId)}
            onClick={() => void handleGenerateConversationTitle(conversationMenu.id)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-popover-foreground transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-50"
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
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-popover-foreground transition-colors hover:bg-muted"
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
    { text: t('admin.ai_prompt_narrative'), order: '01' },
    { text: t('admin.ai_prompt_describe'), order: '02' },
    { text: t('admin.ai_prompt_title'), order: '03' },
  ]

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 pb-16">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.23, 0.36, 0.18, 0.97] }}
        className="text-center max-w-md"
      >
        {/* Decorative ring */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.5, ease: 'easeOut' }}
          className="mx-auto mb-8"
        >
          <div className="relative inline-flex">
            <span className="absolute inset-0 rounded-full bg-amber-500/[0.04] blur-xl" />
            <span className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/[0.06] to-transparent ring-1 ring-amber-500/10 shadow-[0_4px_24px_rgba(245,158,11,0.06)]">
              <Sparkles className="h-8 w-8 text-amber-500/30" />
            </span>
          </div>
        </motion.div>

        <h2 className="font-serif text-2xl tracking-tight mb-3 text-foreground/90">
          {t('admin.ai_assistant')}
        </h2>
        <p className="text-sm text-muted-foreground/50 leading-relaxed mb-10 max-w-sm mx-auto">
          {t('admin.ai_welcome')}
        </p>

        <div className="space-y-2">
          {prompts.map((prompt, i) => (
            <motion.button
              key={prompt.text}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.08, duration: 0.35, ease: 'easeOut' }}
              onClick={() => {
                setInput(prompt.text)
                textareaRef.current?.focus()
              }}
              className="group flex items-center gap-4 w-full px-4 py-3 rounded-xl border border-border/30 hover:border-amber-500/20 hover:bg-amber-500/[0.03] transition-all duration-300 text-left cursor-pointer"
            >
              <span className="flex-shrink-0 w-7 text-right text-[10px] font-mono font-medium text-muted-foreground/20 group-hover:text-amber-500/40 transition-colors duration-300">
                {prompt.order}
              </span>
              <span className="text-sm text-muted-foreground/60 group-hover:text-foreground/80 transition-colors duration-300">
                {prompt.text}
              </span>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

/* Message Bubble */

function MessageBubble({
  message,
  copiedId,
  onCopy,
  onQuote,
  onSaveImage,
  onDownloadImage,
  persistedMessageId,
  t,
}: {
  message: EditorAiMessageDto
  copiedId: string | null
  onCopy: (content: string, id: string) => void
  onQuote: (msg: EditorAiMessageDto) => void
  onSaveImage: (messageId: string, imageUrl: string) => Promise<void>
  onDownloadImage: (imageUrl: string) => Promise<void>
  persistedMessageId?: string
  t: (key: string) => string
}) {
  const isUser = message.role === 'user'

  const messageImages = getMessageImages(message.metadata)
  const saveMessageId = persistedMessageId || message.id

  if (isUser) {
    return (
      <div className="flex gap-3 items-start justify-end">
        <div className="max-w-[78%] min-w-0">
          <div className="relative rounded-2xl rounded-tr-md bg-foreground/[0.06] border border-border/20 px-4 py-3">
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85 break-words">
              {message.content}
            </div>
            {messageImages.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-2">
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
          <div className="mt-1 flex items-center justify-end">
            <button
              onClick={() => onQuote(message)}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors cursor-pointer rounded-md"
              aria-label="Quote"
            >
              <Quote className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
        <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-muted/40 flex items-center justify-center ring-1 ring-border/20">
          <span className="text-[10px] font-semibold text-muted-foreground/50">Me</span>
        </div>
      </div>
    )
  }

  // Assistant message
  return (
    <div className="flex gap-3 items-start">
      <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-xl bg-amber-500/[0.08] flex items-center justify-center ring-1 ring-amber-500/10">
        <Sparkles className="h-3.5 w-3.5 text-amber-500/70" />
      </div>
      <div className="max-w-[78%] min-w-0">
        <div className="relative rounded-2xl rounded-tl-md bg-gradient-to-br from-muted/20 to-transparent border border-border/30 px-4 py-3">
          {/* Subtle warm glow */}
          <div className="absolute inset-0 rounded-2xl rounded-tl-md bg-gradient-to-br from-amber-500/[0.02] to-transparent pointer-events-none" />
          <div className="relative text-sm leading-relaxed text-foreground/90 break-words">
            {message.status === 'streaming' && !message.content ? (
              <div className="flex items-center gap-2.5">
                <span className="text-xs text-muted-foreground/60">{t('admin.ai_thinking')}</span>
                <span className="flex gap-1">
                  {[0, 1, 2].map((index) => (
                    <span
                      key={index}
                      className="w-1 h-1 rounded-full bg-amber-500/30 animate-bounce"
                      style={{ animationDelay: `${index * 150}ms` }}
                    />
                  ))}
                </span>
              </div>
            ) : (
              <div className="ai-markdown">
                <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
                {message.status === 'streaming' && (
                  <span className="inline-block w-[3px] h-4 bg-amber-500/60 animate-pulse ml-0.5 align-middle rounded-full" />
                )}
              </div>
            )}
          </div>
          {messageImages.length > 0 && (
            <div className="relative mt-2.5 flex flex-wrap gap-2">
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
            <div className="relative mt-2.5 rounded-xl border border-destructive/15 bg-destructive/[0.04] px-3 py-2 text-xs text-destructive/80 leading-relaxed">
              {message.error}
            </div>
          )}
        </div>

        {message.content && (
          <div className="mt-1.5 flex items-center gap-0.5">
            <button
              onClick={() => onCopy(message.content, message.id)}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors cursor-pointer rounded-md"
              aria-label="Copy"
            >
              {copiedId === message.id ? (
                <>
                  <Check className="w-2.5 h-2.5 text-emerald-500/70" />
                  <span className="text-emerald-500/70">{t('admin.ai_copied')}</span>
                </>
              ) : (
                <>
                  <Copy className="w-2.5 h-2.5" />
                  <span>{t('admin.ai_copy')}</span>
                </>
              )}
            </button>
            <button
              onClick={() => onQuote(message)}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors cursor-pointer rounded-md"
              aria-label="Quote"
            >
              <Quote className="w-2.5 h-2.5" />
              <span>{t('admin.ai_quote')}</span>
            </button>
          </div>
        )}
      </div>
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
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/30 text-[10px] font-medium text-muted-foreground/50 hover:text-muted-foreground hover:border-border/50 hover:bg-muted/30 transition-all duration-200 cursor-pointer"
      >
        {icon === 'image'
          ? <ImageIcon className="w-3 h-3 text-amber-500/50" />
          : <Sparkles className="w-3 h-3 text-amber-500/40" />}
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
            className="absolute bottom-full left-0 mb-1.5 w-56 bg-background border border-border/40 rounded-xl shadow-[0_16px_40px_rgba(0,0,0,0.08)] overflow-hidden z-20 ring-1 ring-border/10"
          >
            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/30">
              <Search className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search models..."
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/20 text-foreground/80"
              />
            </div>

            {/* Options */}
            <div className="max-h-44 overflow-y-auto custom-scrollbar py-1">
              {filtered.length === 0 ? (
                <div className="px-3 py-3 text-[10px] text-muted-foreground/30 text-center">
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
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500/[0.06] text-amber-600 dark:text-amber-400'
                          : 'text-foreground/70 hover:bg-muted/40'
                      }`}
                    >
                      <span className="truncate">{m.label}</span>
                      {isSelected && <Check className="w-3 h-3 flex-shrink-0 text-amber-500/70" />}
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
  'ai-assistant': { label: 'Chat', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  'story-editor': { label: 'Story', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  'blog-editor': { label: 'Blog', color: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
}

function ScopeBadge({ scopeId }: { scopeId: string }) {
  const config = SCOPE_LABELS[scopeId] ?? {
    label: scopeId.length > 12 ? `${scopeId.slice(0, 12)}...` : scopeId,
    color: 'bg-muted text-muted-foreground/50',
  }

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-px rounded-md text-[9px] font-medium leading-4 ${config.color}`}>
      <span className="w-1 h-1 rounded-full bg-current/30" />
      {config.label}
    </span>
  )
}
