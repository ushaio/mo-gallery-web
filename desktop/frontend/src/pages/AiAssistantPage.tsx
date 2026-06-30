import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/LanguageContext'
import type { EditorAiConversationDto, EditorAiMessageDto, StoryAiModelsResponse } from '@/lib/api/types'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import { Skeleton } from '@/components/admin/Skeleton'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Send, MessageSquare, X, ChevronLeft, ChevronDown,
  Copy, Check, Eraser, Sparkles, Search, Quote, StopCircle,
  Settings2, RotateCcw, Paperclip, Loader2,
} from 'lucide-react'

// Go backend proxy calls
const go = () => (window as any).go.main.App

// 本地 AI HTTP 服务端口（startup 时设置）
let aiHttpPort = 0

async function ensureAiPort() {
  if (!aiHttpPort) {
    aiHttpPort = await go().GetAiHttpPort()
  }
  return aiHttpPort
}

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
      // 切换会话时立即滚到底，无动画
      scrollToBottom(true)
      isSwitchingRef.current = false
    } else {
      scrollToBottom()
    }
  }, [messages, streamingContent, scrollToBottom])

  // Load conversations and models
  useEffect(() => {
    const init = async () => {
      setLoading(true)
      try {
        const [convos, modelsData] = await Promise.all([
          go().GetEditorAiConversations(SCOPE_ID),
          go().GetStoryAiModels().catch(() => null),
        ])
        setConversations(convos || [])
        if (modelsData) { setModels(modelsData); setSelectedModel(modelsData.defaultModel) }
      } catch (error) {
        console.error('[AI] Failed to load data:', error)
      } finally { setLoading(false) }
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeConversation) { setMessages([]); setShowSystemPrompt(false); return }
    isSwitchingRef.current = true
    const loadMessages = async () => {
      try {
        const convo = await go().GetEditorAiConversation(activeConversation)
        setMessages(convo.messages || [])
        setSystemPromptDraft(convo.systemPrompt || '')
      } catch (error) {
        console.error('[AI] Failed to load messages:', error)
      }
    }
    loadMessages()
  }, [activeConversation]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewConversation = async () => {
    try {
      const convo = await go().CreateEditorAiConversation({ scopeId: SCOPE_ID, title: t('admin.ai_new_chat') })
      setConversations(prev => [convo, ...prev])
      setActiveConversation(convo.id)
      setMessages([]); setInput(''); textareaRef.current?.focus()
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error('[AI] Create conversation failed:', msg)
      toast.error(msg)
    }
  }

  const handleDeleteConversation = async (id: string) => {
    try {
      await go().DeleteEditorAiConversation(id)
      setConversations(prev => prev.filter(c => c.id !== id))
      if (activeConversation === id) { setActiveConversation(null); setMessages([]) }
      setDeleteConfirm(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'))
    }
  }

  const handleClearConversation = async () => {
    if (!activeConversation) return
    try {
      await go().ClearEditorAiConversation(activeConversation)
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
      const updated = await go().UpdateEditorAiConversation(activeConversation, { systemPrompt: trimmed || null })
      setConversations(prev => prev.map(c => c.id === activeConversation ? { ...c, systemPrompt: updated.systemPrompt } : c))
      setSystemPromptDraft(updated.systemPrompt || ''); setShowSystemPrompt(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'))
    } finally { setSavingPrompt(false) }
  }

  const handleSelectImages = () => { fileInputRef.current?.click() }

  const handleFilesSelected = async (_e: React.ChangeEvent<HTMLInputElement>) => {
    toast.info('桌面端暂不支持图片上传')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const activeConvoData = conversations.find(c => c.id === activeConversation)
  const hasCustomPrompt = Boolean(activeConvoData?.systemPrompt)

  const handleSend = async () => {
    if (!input.trim() || sending) return

    let conversationId = activeConversation

    if (!conversationId) {
      try {
        const convo = await go().CreateEditorAiConversation({ scopeId: SCOPE_ID, title: input.trim().slice(0, 50) })
        setConversations(prev => [convo, ...prev]); setActiveConversation(convo.id); conversationId = convo.id
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('common.error')); return
      }
    }

    const userInput = input.trim()
    const quoted = quotedMessage
    const images = attachedImages.map(i => i.url).filter(Boolean)
    setInput(''); setQuotedMessage(null); setAttachedImages([]); setSending(true); setStreamingContent('')

    const prompt = quoted ? `> ${quoted.content.split('\n').join('\n> ')}\n\n${userInput}` : userInput

    const optimisticMsg: EditorAiMessageDto = {
      id: `optimistic-${Date.now()}`, conversationId: conversationId!, role: 'user',
      content: prompt, status: 'completed', createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimisticMsg])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const abortController = new AbortController()
    abortRef.current = abortController

    try {
      const port = await ensureAiPort()
      if (!port) throw new Error('AI 服务未就绪')

      const response = await fetch(`http://127.0.0.1:${port}/ai/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          action: 'custom',
          prompt,
          model: selectedModel || undefined,
          images: images.length > 0 ? images : undefined,
        }),
        signal: abortController.signal,
      })

      if (!response.ok) {
        const errText = await response.text().catch(() => 'Unknown error')
        throw new Error(errText)
      }

      // 读取 SSE 流
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let sseBuffer = ''
      let accumulated = ''

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
            setStreamingContent(accumulated)
          }
          // 不在 done 事件中清空 streamingContent，等消息加载完再清
        }
      }

      // 加载最终消息，加载完再清空流式状态（避免闪烁）
      if (conversationId) {
        const convo = await go().GetEditorAiConversation(conversationId)
        setMessages(convo.messages || [])
        setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, title: convo.title, updatedAt: convo.updatedAt } : c))
      }
      setStreamingContent('')
      setSending(false)
    } catch (error) {
      setStreamingContent('')
      setSending(false)
      if (error instanceof DOMException && error.name === 'AbortError') { /* cancelled */ }
      else { toast.error(error instanceof Error ? error.message : t('common.error')) }
      if (conversationId) {
        try { const convo = await go().GetEditorAiConversation(conversationId); setMessages(convo.messages || []) } catch { /* ignore */ }
      }
    } finally { abortRef.current = null }
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
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple onChange={handleFilesSelected} className="hidden" />

      {/* ── Conversation Sidebar ── */}
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
                        onKeyDown={e => { if (e.key === 'Enter') setActiveConversation(convo.id) }}
                        onClick={() => setActiveConversation(convo.id)}
                        className="group relative flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors rounded-md"
                        style={{ backgroundColor: isActive ? 'var(--accent)' : 'transparent', color: isActive ? 'var(--accent-foreground)' : 'var(--muted-foreground)' }}>
                        <span className="flex-shrink-0 text-[10px] font-mono w-5 text-right" style={{ opacity: 0.4 }}>{idx + 1 < 10 ? `0${idx + 1}` : idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs truncate">{convo.title || t('admin.ai_new_chat')}</div>
                          <span className="text-[10px]" style={{ opacity: 0.4 }}>{formatConversationDate(convo.updatedAt)}</span>
                        </div>
                        <button onClick={e => { e.stopPropagation(); setDeleteConfirm(convo.id) }}
                          className="flex-shrink-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity rounded"
                          style={{ color: 'var(--destructive)' }}>
                          <X size={12} />
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
                <span className="uppercase tracking-wider">{selectedModel || 'default'}</span>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Main Chat Area ── */}
      <div className="flex-1 flex flex-col min-w-0" style={{ backgroundColor: 'var(--background)' }}>
        {/* Chat header */}
        <div className="flex items-center gap-3 px-5 h-12 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <button onClick={() => setShowSidebar(!showSidebar)}
            className="p-1.5 rounded-md transition-colors" style={{ color: 'var(--muted-foreground)' }}>
            <ChevronLeft size={16} className={`transition-transform duration-300 ${!showSidebar ? 'rotate-180' : ''}`} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Sparkles size={14} style={{ color: '#f59e0b' }} />
            <span className="text-xs font-medium truncate">{activeConvoData?.title || t('admin.ai_assistant')}</span>
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
        <div className="flex-1 overflow-y-auto">
          {!activeConversation && messages.length === 0 && !sending ? (
            <EmptyState t={t} textareaRef={textareaRef} setInput={setInput} />
          ) : (
            <div className="max-w-[44rem] mx-auto px-5 py-6 space-y-4">
              <AnimatePresence initial={false}>
                {messages.map(msg => (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                    <MessageBubble message={msg} copiedId={copiedId} onCopy={handleCopy} onQuote={handleQuote} t={t} />
                  </motion.div>
                ))}
              </AnimatePresence>

              {sending && streamingContent && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3 items-start">
                  <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#f59e0b/10' }}>
                    <Sparkles size={14} style={{ color: '#f59e0b' }} />
                  </div>
                  <div className="max-w-[78%] min-w-0">
                    <div className="rounded-lg border px-4 py-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)/20' }}>
                      <div className="text-sm leading-relaxed break-words" style={{ color: 'var(--foreground)' }}>
                        <Markdown remarkPlugins={[remarkGfm]}>{streamingContent}</Markdown>
                        <span className="inline-block w-[3px] h-4 rounded-full animate-pulse ml-0.5 align-middle" style={{ backgroundColor: '#f59e0b' }} />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {sending && !streamingContent && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3 items-start">
                  <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#f59e0b/10' }}>
                    <Sparkles size={14} style={{ color: '#f59e0b' }} />
                  </div>
                  <div className="rounded-lg border px-4 py-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)/20' }}>
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{t('admin.ai_thinking')}</span>
                      <span className="flex gap-1">
                        {[0, 1, 2].map(i => (
                          <span key={i} className="w-1 h-1 rounded-full animate-bounce" style={{ backgroundColor: '#f59e0b/50', animationDelay: `${i * 150}ms` }} />
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
                      {attachedImages.map((img, idx) => (
                        <div key={idx} className="relative group w-14 h-14 rounded-md overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                          <img src={img.previewUrl} alt="" className="w-full h-full object-cover" />
                          <button onClick={() => setAttachedImages(prev => prev.filter((_, i) => i !== idx))}
                            className="absolute top-0.5 right-0.5 p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ backgroundColor: 'var(--background)' }}><X size={10} /></button>
                          {!img.url && (
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

              <textarea ref={textareaRef} value={input} onChange={autoResize} onKeyDown={handleKeyDown}
                placeholder={t('admin.ai_input_placeholder')} rows={1} disabled={sending}
                className="w-full resize-none bg-transparent text-sm leading-6 outline-none px-4 pt-3.5 pb-1 disabled:opacity-40"
                style={{ color: 'var(--foreground)', maxHeight: 200 }} />

              <div className="flex items-center justify-between px-3 pb-2.5">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={handleSelectImages} disabled={sending}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] disabled:opacity-30 transition-colors"
                    style={{ color: 'var(--muted-foreground)' }}><Paperclip size={14} /></button>
                  {models && models.models.length > 1 && (
                    <ModelSelector models={models.models} value={selectedModel} onChange={setSelectedModel} />
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
                    <button onClick={handleSend} disabled={!input.trim()}
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

/* ─── Empty State ── */

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

/* ─── Message Bubble ── */

function MessageBubble({ message, copiedId, onCopy, onQuote, t }: {
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
          <div className="rounded-lg rounded-tr-md border px-4 py-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)/20' }}>
            <div className="whitespace-pre-wrap text-sm leading-relaxed break-words" style={{ color: 'var(--foreground)' }}>{message.content}</div>
            {messageImages && messageImages.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {messageImages.map((img, idx) => (
                  <div key={idx} className="relative max-w-[200px] rounded-md overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                    <img src={img.url} alt="" className="max-h-[200px] object-contain" loading="lazy" />
                  </div>
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
          <div className="ai-markdown text-sm leading-relaxed break-words" style={{ color: 'var(--foreground)' }}>
            <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
          </div>
          {messageImages && messageImages.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {messageImages.map((img, idx) => (
                <div key={idx} className="relative max-w-[200px] rounded-md overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                  <img src={img.url} alt="" className="max-h-[200px] object-contain" loading="lazy" />
                </div>
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

/* ─── Model Selector ── */

function ModelSelector({ models, value, onChange }: {
  models: { id: string; label: string }[]
  value: string
  onChange: (value: string) => void
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
        <Sparkles size={10} style={{ color: '#f59e0b' }} />
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
