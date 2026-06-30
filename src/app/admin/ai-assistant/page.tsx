'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
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
  uploadAiImage,
  streamStoryAiGenerate,
  getStoryAiModels,
} from '@/lib/api/story-ai'
import type {
  EditorAiConversationDto,
  EditorAiMessageDto,
  StoryAiModelsResponse,
} from '@/lib/api/types'
import { AdminButton } from '@/components/admin/AdminButton'
import { Skeleton } from '@/components/admin/Skeleton'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import { useAdmin } from '../layout'

const SCOPE_ID = 'ai-assistant'

function formatConversationDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ─── Staggered reveal variants ────────────────────────────────────────────────
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
  const [sending, setSending] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [models, setModels] = useState<StoryAiModelsResponse | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [showSidebar, setShowSidebar] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [quotedMessage, setQuotedMessage] = useState<EditorAiMessageDto | null>(null)
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)
  const [systemPromptDraft, setSystemPromptDraft] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [attachedImages, setAttachedImages] = useState<Array<{ url: string; key: string; previewUrl: string }>>([])
  const [uploadingImages, setUploadingImages] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isSwitchingRef = useRef(false)

  const scrollToBottom = useCallback((instant?: boolean) => {
    messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'instant' : 'smooth' })
  }, [])

  useEffect(() => {
    if (isSwitchingRef.current) {
      scrollToBottom(true)
      isSwitchingRef.current = false
    } else {
      scrollToBottom()
    }
  }, [messages, streamingContent, scrollToBottom])

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
          setModels(modelsData)
          setSelectedModel(modelsData.defaultModel)
        }
      } catch (error) {
        if (error instanceof ApiUnauthorizedError) {
          handleUnauthorized()
          return
        }
        console.error('Failed to load AI assistant data:', error)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load messages when active conversation changes
  useEffect(() => {
    if (!token || !activeConversation) {
      setMessages([])
      setShowSystemPrompt(false)
      return
    }
    isSwitchingRef.current = true
    const loadMessages = async () => {
      try {
        const convo = await getEditorAiConversation(token, activeConversation)
        setMessages(convo.messages)
        setSystemPromptDraft(convo.systemPrompt || '')
      } catch (error) {
        if (error instanceof ApiUnauthorizedError) {
          handleUnauthorized()
          return
        }
        console.error('Failed to load messages:', error)
      }
    }
    loadMessages()
  }, [token, activeConversation]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewConversation = async () => {
    if (!token) return
    try {
      const convo = await createEditorAiConversation(token, {
        scopeId: SCOPE_ID,
        title: t('admin.ai_new_chat'),
      })
      setConversations((prev) => [convo, ...prev])
      setActiveConversation(convo.id)
      setMessages([])
      setInput('')
      textareaRef.current?.focus()
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized()
        return
      }
      notify(t('common.error'), 'error')
    }
  }

  const handleDeleteConversation = async (id: string) => {
    if (!token) return
    try {
      await deleteEditorAiConversation(token, id)
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (activeConversation === id) {
        setActiveConversation(null)
        setMessages([])
      }
      setDeleteConfirm(null)
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized()
        return
      }
      notify(t('common.error'), 'error')
    }
  }

  const handleClearConversation = async () => {
    if (!token || !activeConversation) return
    try {
      await clearEditorAiConversation(token, activeConversation)
      setMessages([])
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized()
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
        handleUnauthorized()
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

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !token) return

    const previews = Array.from(files).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }))

    setAttachedImages((prev) => [...prev, ...previews.map((p) => ({ url: '', key: '', previewUrl: p.previewUrl }))])
    setUploadingImages(true)

    try {
      const uploadPromises = previews.map(async (p) => {
        const result = await uploadAiImage(token, p.file)
        return { url: result.url, key: result.key, previewUrl: p.previewUrl }
      })
      const results = await Promise.all(uploadPromises)
      setAttachedImages((prev) => {
        const alreadyUploaded = prev.filter((img) => img.url !== '')
        return [...alreadyUploaded, ...results]
      })
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized()
        return
      }
      notify(t('admin.ai_upload_failed'), 'error')
      setAttachedImages((prev) => prev.filter((img) => img.url !== ''))
    } finally {
      setUploadingImages(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const activeConvoData = conversations.find((c) => c.id === activeConversation)
  const hasCustomPrompt = Boolean(activeConvoData?.systemPrompt)

  const handleSend = async () => {
    if (!token || !input.trim() || sending) return

    let conversationId = activeConversation

    // Auto-create conversation if none active
    if (!conversationId) {
      try {
        const convo = await createEditorAiConversation(token, {
          scopeId: SCOPE_ID,
          title: input.trim().slice(0, 50),
        })
        setConversations((prev) => [convo, ...prev])
        setActiveConversation(convo.id)
        conversationId = convo.id
      } catch (error) {
        if (error instanceof ApiUnauthorizedError) {
          handleUnauthorized()
          return
        }
        notify(t('common.error'), 'error')
        return
      }
    }

    const userInput = input.trim()
    const quoted = quotedMessage
    const images = attachedImages.map((i) => i.url).filter(Boolean)
    const imageMeta = attachedImages.filter((i) => i.url).map((i) => ({ url: i.url, key: i.key }))
    setInput('')
    setQuotedMessage(null)
    setAttachedImages([])
    setSending(true)
    setStreamingContent('')

    // Build prompt with quote context
    const prompt = quoted
      ? `> ${quoted.content.split('\n').join('\n> ')}\n\n${userInput}`
      : userInput

    // Optimistic: show user message immediately
    const optimisticMsg: EditorAiMessageDto = {
      id: `optimistic-${Date.now()}`,
      conversationId: conversationId!,
      role: 'user',
      content: prompt,
      status: 'completed',
      createdAt: new Date().toISOString(),
      ...(imageMeta.length > 0 ? { metadata: { images: imageMeta } } : {}),
    }
    setMessages((prev) => [...prev, optimisticMsg])

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    const abortController = new AbortController()
    abortRef.current = abortController

    try {
      let accumulated = ''
      await streamStoryAiGenerate(
        token,
        {
          conversationId,
          action: 'custom',
          prompt,
          model: selectedModel || undefined,
          images: images.length > 0 ? images : undefined,
        },
        {
          onChunk: (chunk) => {
            accumulated += chunk
            setStreamingContent(accumulated)
          },
          onDone: () => {
            // 不在 done 事件中清空 streamingContent，等消息加载完再清
          },
          signal: abortController.signal,
        },
      )

      if (conversationId) {
        const convo = await getEditorAiConversation(token, conversationId)
        setMessages(convo.messages)
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId
              ? { ...c, title: convo.title, updatedAt: convo.updatedAt }
              : c,
          ),
        )
      }
      setStreamingContent('')
      setSending(false)
    } catch (error) {
      setStreamingContent('')
      setSending(false)
      if (error instanceof DOMException && error.name === 'AbortError') {
        // User cancelled
      } else if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized()
        return
      } else {
        const message = error instanceof Error ? error.message : t('common.error')
        notify(message, 'error')
      }
      if (conversationId) {
        try {
          const convo = await getEditorAiConversation(token, conversationId)
          setMessages(convo.messages)
        } catch { /* ignore */ }
      }
    } finally {
      abortRef.current = null
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
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        multiple
        onChange={handleFilesSelected}
        className="hidden"
      />
      {/* ── Conversation Sidebar ─────────────────────────────────────────── */}
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
                        onKeyDown={(e) => { if (e.key === 'Enter') setActiveConversation(convo.id) }}
                        onClick={() => setActiveConversation(convo.id)}
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
                          <div className={`text-xs leading-5 truncate transition-colors duration-200 ${
                            isActive ? 'font-medium' : 'font-normal'
                          }`}>
                            {convo.title || t('admin.ai_new_chat')}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <ScopeBadge scopeId={convo.scopeId} />
                            <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                              {formatConversationDate(convo.updatedAt)}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteConfirm(convo.id)
                          }}
                          className="flex-shrink-0 p-1 opacity-0 group-hover:opacity-100 transition-all duration-200 text-muted-foreground/40 hover:text-destructive rounded-md hover:bg-destructive/5"
                          aria-label={t('common.delete')}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Sidebar footer — subtle model indicator */}
            <div className="px-4 py-3 border-t border-border/30">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500/50" />
                <span className="tracking-wider uppercase">{selectedModel || 'default'}</span>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Main Chat Area ────────────────────────────────────────────────── */}
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
            <span className="text-xs font-medium truncate tracking-wide">
              {activeConvoData?.title || t('admin.ai_assistant')}
            </span>
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
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {!activeConversation && messages.length === 0 && !sending ? (
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
                      t={t}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Streaming response */}
              {sending && streamingContent && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3 items-start"
                >
                  <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-xl bg-amber-500/[0.08] flex items-center justify-center ring-1 ring-amber-500/10">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500/70" />
                  </div>
                  <div className="max-w-[78%] min-w-0">
                    <div className="relative rounded-2xl rounded-tl-md bg-gradient-to-br from-muted/20 to-muted/5 border border-border/30 px-4 py-3">
                      <div className="absolute inset-0 rounded-2xl rounded-tl-md bg-gradient-to-br from-amber-500/[0.02] to-transparent pointer-events-none" />
                      <div className="relative text-sm leading-relaxed text-foreground/90 break-words">
                        <div className="ai-markdown">
                          <Markdown remarkPlugins={[remarkGfm]}>{streamingContent}</Markdown>
                        </div>
                        <span className="inline-block w-[3px] h-4 bg-amber-500/60 animate-pulse ml-0.5 align-middle rounded-full" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Thinking indicator */}
              {sending && !streamingContent && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3 items-start"
                >
                  <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-xl bg-amber-500/[0.08] flex items-center justify-center ring-1 ring-amber-500/10">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500/70" />
                  </div>
                  <div className="rounded-2xl rounded-tl-md bg-gradient-to-br from-muted/20 to-muted/5 border border-border/30 px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs text-muted-foreground/60">{t('admin.ai_thinking')}</span>
                      <span className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="w-1 h-1 rounded-full bg-amber-500/30 animate-bounce"
                            style={{ animationDelay: `${i * 150}ms` }}
                          />
                        ))}
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}

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
                      {attachedImages.map((img, idx) => (
                        <div key={idx} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-border/30 flex-shrink-0">
                          <img
                            src={img.previewUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                          <button
                            onClick={() => setAttachedImages((prev) => prev.filter((_, i) => i !== idx))}
                            className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-background/80 text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            aria-label="Remove image"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                          {!img.url && (
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
                    aria-label={t('admin.ai_attach_image')}
                    title={t('admin.ai_attach_image')}
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                  </button>
                  {models && models.models.length > 1 && (
                    <ModelSelector
                      models={models.models}
                      value={selectedModel}
                      onChange={setSelectedModel}
                    />
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
                      disabled={!input.trim()}
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

      {/* Delete confirmation */}
      <SimpleDeleteDialog
        isOpen={deleteConfirm !== null}
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={() => { if (deleteConfirm) return handleDeleteConversation(deleteConfirm) }}
        title={t('common.delete')}
        message={t('admin.ai_delete_confirm')}
        t={t}
      />
    </div>
  )
}

/* ─── Empty State ───────────────────────────────────────────────────────────── */

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

/* ─── Message Bubble ────────────────────────────────────────────────────────── */

function MessageBubble({
  message,
  copiedId,
  onCopy,
  onQuote,
  t,
}: {
  message: EditorAiMessageDto
  copiedId: string | null
  onCopy: (content: string, id: string) => void
  onQuote: (msg: EditorAiMessageDto) => void
  t: (key: string) => string
}) {
  const isUser = message.role === 'user'

  const messageImages: Array<{ url: string }> | undefined =
    message.metadata && typeof message.metadata === 'object' && 'images' in message.metadata
      ? (message.metadata as { images?: Array<{ url: string }> }).images
      : undefined

  if (isUser) {
    return (
      <div className="flex gap-3 items-start justify-end">
        <div className="max-w-[78%] min-w-0">
          <div className="relative rounded-2xl rounded-tr-md bg-foreground/[0.06] border border-border/20 px-4 py-3">
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85 break-words">
              {message.content}
            </div>
            {messageImages && messageImages.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {messageImages.map((img, idx) => (
                  <div key={idx} className="relative max-w-[200px] rounded-lg overflow-hidden border border-border/20">
                    <img
                      src={img.url}
                      alt=""
                      className="max-h-[200px] object-contain bg-muted/20"
                      loading="lazy"
                    />
                  </div>
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
            <div className="ai-markdown">
              <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
            </div>
          </div>
          {messageImages && messageImages.length > 0 && (
            <div className="relative mt-2.5 flex flex-wrap gap-2">
              {messageImages.map((img, idx) => (
                <div key={idx} className="relative max-w-[200px] rounded-lg overflow-hidden border border-border/20">
                  <img
                    src={img.url}
                    alt=""
                    className="max-h-[200px] object-contain bg-muted/20"
                    loading="lazy"
                  />
                </div>
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

/* ─── Model Selector ────────────────────────────────────────────────────────── */

function ModelSelector({
  models,
  value,
  onChange,
}: {
  models: { id: string; label: string }[]
  value: string
  onChange: (value: string) => void
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
        <Sparkles className="w-3 h-3 text-amber-500/40" />
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

/* ─── Scope Badge ───────────────────────────────────────────────────────────── */

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
