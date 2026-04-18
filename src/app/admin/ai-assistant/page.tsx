'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
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
  streamStoryAiGenerate,
  getStoryAiModels,
} from '@/lib/api/story-ai'
import type {
  EditorAiConversationDto,
  EditorAiMessageDto,
  StoryAiModelsResponse,
} from '@/lib/api/types'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminLoading } from '@/components/admin/AdminLoading'
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

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
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
      return
    }
    const loadMessages = async () => {
      try {
        const convo = await getEditorAiConversation(token, activeConversation)
        setMessages(convo.messages)
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
    setInput('')
    setQuotedMessage(null)
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
        },
        {
          onChunk: (chunk) => {
            accumulated += chunk
            setStreamingContent(accumulated)
          },
          onDone: () => {
            setStreamingContent('')
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
    } catch (error) {
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
      setSending(false)
      setStreamingContent('')
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
    return <AdminLoading text={t('common.loading')} className="min-h-[320px]" />
  }

  const activeConvoTitle = conversations.find((c) => c.id === activeConversation)?.title

  return (
    <div className="h-full flex overflow-hidden rounded-lg border border-border/60">
      {/* Conversation sidebar */}
      <AnimatePresence initial={false}>
        {showSidebar && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 272, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="flex-shrink-0 border-r border-border/60 flex flex-col overflow-hidden bg-muted/20"
          >
            {/* Sidebar header */}
            <div className="p-3 border-b border-border/60 flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {t('admin.ai_conversations')}
              </span>
              <AdminButton
                onClick={handleNewConversation}
                adminVariant="icon"
                title={t('admin.ai_new_chat')}
                aria-label={t('admin.ai_new_chat')}
                className="h-8 w-8"
              >
                <Plus className="w-4 h-4" />
              </AdminButton>
            </div>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
              {conversations.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-[0.06]" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {t('admin.ai_no_conversations')}
                  </p>
                </div>
              ) : (
                conversations.map((convo) => (
                  <div
                    key={convo.id}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') setActiveConversation(convo.id) }}
                    className={`group flex items-center gap-2.5 mx-1 px-3 py-2.5 cursor-pointer transition-all duration-150 rounded-lg ${
                      activeConversation === convo.id
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted/60 text-foreground'
                    }`}
                    onClick={() => setActiveConversation(convo.id)}
                  >
                    <Sparkles className={`w-3.5 h-3.5 flex-shrink-0 ${
                      activeConversation === convo.id ? 'text-primary' : 'text-muted-foreground/40'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate leading-5">
                        {convo.title || t('admin.ai_new_chat')}
                      </div>
                      <div className="flex items-center gap-1.5 leading-4">
                        <ScopeBadge scopeId={convo.scopeId} />
                        <span className="text-[10px] text-muted-foreground/60">
                          {formatConversationDate(convo.updatedAt)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteConfirm(convo.id)
                      }}
                      className="p-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive rounded"
                      aria-label={t('common.delete')}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        {/* Chat header */}
        <div className="flex items-center gap-3 px-4 h-12 border-b border-border/60 flex-shrink-0">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label={showSidebar ? 'Hide sidebar' : 'Show sidebar'}
          >
            <ChevronLeft className={`w-4 h-4 transition-transform duration-200 ${showSidebar ? '' : 'rotate-180'}`} />
          </button>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            </span>
            <span className="text-xs font-bold uppercase tracking-widest truncate">
              {activeConvoTitle || t('admin.ai_assistant')}
            </span>
          </div>

          {activeConversation && messages.length > 0 && (
            <AdminButton
              onClick={handleClearConversation}
              adminVariant="icon"
              title={t('admin.ai_clear')}
              aria-label={t('admin.ai_clear')}
              className="h-8 w-8"
            >
              <Eraser className="w-3.5 h-3.5" />
            </AdminButton>
          )}
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {!activeConversation && messages.length === 0 && !sending ? (
            <EmptyState t={t} textareaRef={textareaRef} setInput={setInput} />
          ) : (
            <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
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
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div className="max-w-[75%] min-w-0">
                    <div className="rounded-2xl rounded-tl-sm bg-muted/30 border border-border/40 px-4 py-3">
                      <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground break-words">
                        {streamingContent}
                        <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5 align-middle rounded-full" />
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
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-muted/30 border border-border/40 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t('admin.ai_thinking')}</span>
                      <span className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '300ms' }} />
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
        <div className="border-t border-border/60 p-4 flex-shrink-0 bg-background">
          <div className="max-w-2xl mx-auto">
            <div className="rounded-2xl border border-border/60 bg-muted/15 focus-within:border-primary/40 transition-colors">
              {/* Quote preview */}
              <AnimatePresence>
                {quotedMessage && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-start gap-2 mx-3 mt-3 px-3 py-2 rounded-lg bg-muted/40 border-l-2 border-primary/40">
                      <Quote className="w-3 h-3 text-primary/50 flex-shrink-0 mt-0.5" />
                      <p className="flex-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {quotedMessage.content}
                      </p>
                      <button
                        onClick={() => setQuotedMessage(null)}
                        className="flex-shrink-0 p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-pointer"
                        aria-label="Remove quote"
                      >
                        <X className="w-3 h-3" />
                      </button>
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
                className="w-full resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-muted-foreground/40 disabled:opacity-50 px-4 pt-3 pb-1"
                style={{ maxHeight: 200 }}
              />
              <div className="flex items-center justify-between px-3 pb-2">
                <div className="flex items-center gap-2">
                  {models && models.models.length > 1 && (
                    <ModelSelector
                      models={models.models}
                      value={selectedModel}
                      onChange={setSelectedModel}
                    />
                  )}
                  <span className="text-[10px] text-muted-foreground/30">
                    Shift+Enter {t('admin.ai_newline')}
                  </span>
                </div>
                {sending ? (
                  <button
                    onClick={handleStop}
                    className="flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                    aria-label="Stop generating"
                  >
                    <div className="w-2.5 h-2.5 rounded-sm bg-current" />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className="flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
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

/* ---------- Empty state ---------- */

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
    { text: t('admin.ai_prompt_narrative'), icon: '01' },
    { text: t('admin.ai_prompt_describe'), icon: '02' },
    { text: t('admin.ai_prompt_title'), icon: '03' },
  ]

  return (
    <div className="h-full flex flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="text-center max-w-lg"
      >
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/5">
          <Sparkles className="h-8 w-8 text-primary/20" />
        </div>
        <h2 className="font-serif text-2xl tracking-tight mb-2">
          {t('admin.ai_assistant')}
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-8">
          {t('admin.ai_welcome')}
        </p>

        <div className="grid gap-2">
          {prompts.map((prompt) => (
            <button
              key={prompt.text}
              onClick={() => {
                setInput(prompt.text)
                textareaRef.current?.focus()
              }}
              className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-border/40 hover:border-primary/30 hover:bg-primary/5 transition-all duration-200 text-left cursor-pointer"
            >
              <span className="flex-shrink-0 text-[10px] font-mono font-bold text-muted-foreground/30 group-hover:text-primary/40 transition-colors">
                {prompt.icon}
              </span>
              <span className="text-sm text-foreground/80 group-hover:text-foreground transition-colors">
                {prompt.text}
              </span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

/* ---------- Message bubble ---------- */

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

  if (isUser) {
    // User message — right side
    return (
      <div className="flex gap-3 items-start justify-end">
        <div className="max-w-[75%] min-w-0">
          <div className="rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-3">
            <div className="whitespace-pre-wrap text-sm leading-relaxed break-words">
              {message.content}
            </div>
          </div>
          <div className="mt-1 flex items-center justify-end">
            <button
              onClick={() => onQuote(message)}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
              aria-label="Quote"
            >
              <Quote className="w-3 h-3" />
              <span>{t('admin.ai_quote')}</span>
            </button>
          </div>
        </div>
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-foreground/10 flex items-center justify-center">
          <span className="text-xs font-bold text-foreground/60">Me</span>
        </div>
      </div>
    )
  }

  // Assistant message — left side
  return (
    <div className="flex gap-3 items-start">
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
        <Sparkles className="h-4 w-4 text-primary" />
      </div>
      <div className="max-w-[75%] min-w-0">
        <div className="rounded-2xl rounded-tl-sm bg-muted/30 border border-border/40 px-4 py-3">
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground break-words">
            {message.content}
          </div>

          {message.status === 'failed' && message.error && (
            <div className="mt-2 rounded-lg border border-destructive/20 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
              {message.error}
            </div>
          )}
        </div>

        {message.content && (
          <div className="mt-1 flex items-center gap-1">
            <button
              onClick={() => onCopy(message.content, message.id)}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
              aria-label="Copy"
            >
              {copiedId === message.id ? (
                <>
                  <Check className="w-3 h-3 text-green-500" />
                  <span className="text-green-500">{t('admin.ai_copied')}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>{t('admin.ai_copy')}</span>
                </>
              )}
            </button>
            <button
              onClick={() => onQuote(message)}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
              aria-label="Quote"
            >
              <Quote className="w-3 h-3" />
              <span>{t('admin.ai_quote')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------- Compact model selector (pops upward, searchable) ---------- */

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

  useEffect(() => {
    if (isOpen) {
      setSearch('')
      // Focus search input after animation
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
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border/40 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-border transition-colors cursor-pointer"
      >
        <Sparkles className="w-3 h-3 text-primary/60" />
        <span className="max-w-24 truncate">{selected?.label ?? 'Model'}</span>
        <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
            className="absolute bottom-full left-0 mb-1.5 w-52 bg-background border border-border/60 rounded-xl shadow-2xl overflow-hidden z-20"
          >
            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40">
              <Search className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/30"
              />
            </div>

            {/* Options */}
            <div className="max-h-40 overflow-y-auto custom-scrollbar py-1">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-[10px] text-muted-foreground/50 text-center">
                  No results
                </div>
              ) : (
                filtered.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      onChange(m.id)
                      setIsOpen(false)
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      value === m.id
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="truncate">{m.label}</span>
                    {value === m.id && <Check className="w-3 h-3 flex-shrink-0" />}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ---------- Scope badge ---------- */

const SCOPE_LABELS: Record<string, { label: string; color: string }> = {
  'ai-assistant': { label: 'Chat', color: 'bg-primary/15 text-primary' },
  'story-editor': { label: 'Story', color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  'blog-editor': { label: 'Blog', color: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
}

function ScopeBadge({ scopeId }: { scopeId: string }) {
  const config = SCOPE_LABELS[scopeId] ?? {
    label: scopeId.length > 12 ? `${scopeId.slice(0, 12)}...` : scopeId,
    color: 'bg-muted text-muted-foreground',
  }

  return (
    <span className={`inline-flex px-1.5 py-px rounded text-[9px] font-medium leading-4 ${config.color}`}>
      {config.label}
    </span>
  )
}
