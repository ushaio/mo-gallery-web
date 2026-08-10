import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/LanguageContext'
import { useCachedPageEffect } from '@/hooks/useCachedPageEffect'
import type {
  AiImageMetadata,
  EditorAiConversationDto,
  EditorAiMessageDto,
  EditorAiMessageAppendInput,
  EditorAiMessageStatus,
  StoryAiModelOption,
  StoryAiModelsResponse,
} from '@/lib/api/types'
import {
  editorAiMessageMetadataSchema,
  readEditorAiAssistantTrace,
  reduceEditorAiTrace,
  type EditorAiStreamEvent,
  type EditorAiTraceBlock,
} from '@mo-gallery/ai-agent'
// Text chat shares the editor AI pipeline (agent package, local proxy, and conversation database).
// Image generation continues to use the local /ai/generate endpoint.
import {
  generateEditorAiConversationTitle,
  getLocalStoryAiModels,
  mapEditorAiMessageDto,
  appendLocalEditorAiMessage,
  prepareDesktopImagePrompt,
  streamDesktopAgentGenerate,
} from '@/lib/api/editor-ai-local'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Skeleton } from '@/components/admin/Skeleton'
import { AgentMentionMenu } from '@/components/ai/AgentMentionMenu'
import { SelectDropdown } from '@/components/ui/SelectDropdown'
import {
  ClearEditorAiConversation,
  CreateEditorAiConversation,
  DeleteEditorAiConversation,
  DownloadMessageImageToLocal,
  SaveMessageImageToLocalLibrary,
  GetAiHttpPort,
  GetAiImageDataURL,
  GetEditorAiConversationMessagesPage,
  GetEditorAiConversationPage,
  SaveMessageImageToAlbum,
  UpdateEditorAiConversation,
} from '../../wailsjs/go/main/App'
import { localLibraryApi, parseLocalLibraryError } from '@/features/local-library/api'
import type { FolderItem, RecentLibrary } from '@/features/local-library/types'
import {
  Plus, Send, MessageSquare, X, ChevronLeft, ChevronDown,
  Copy, Check, Eraser, Sparkles, Search, Quote, StopCircle,
  Settings2, RotateCcw, Paperclip, Loader2, Image as ImageIcon, Pencil, Trash2, Download, FolderOpen, ChevronRight, ShieldAlert, GitBranch, PanelLeftClose, PanelLeft, Square,
} from 'lucide-react'
import { answerAgentToolApproval, useAgentToolApprovals } from '@/lib/agent-tool-approval'
import {
  buildAgentMentionCandidates,
  filterAgentMentionCandidates,
  findAgentMentionContext,
  removeAgentMentionQuery,
  resolveAgentMentionSelection,
  type AgentMentionCandidate,
  type AgentMentionContext,
} from '@/lib/agent-composer-mentions'
import { agentExtensions, type AgentExtensionSnapshot, type AgentSkill } from '@/lib/agent-extensions'

// Local AI HTTP service port
let aiHttpPort = 0

async function ensureAiPort() {
  if (!aiHttpPort) {
    aiHttpPort = await GetAiHttpPort()
  }
  return aiHttpPort
}

const SCOPE_ID = 'ai-assistant'
const CONVERSATION_PAGE_SIZE = 50
const MESSAGE_PAGE_SIZE = 50
const MAX_ATTACHED_IMAGES = 10
const MAX_IMAGE_SIZE = 20 * 1024 * 1024
const IMAGE_EDIT_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const DELETE_ARM_TIMEOUT_MS = 3000

type SendOverrides = {
  input?: string
  images?: string[]
}

type AttachedImage = {
  id: string
  url: string
  status: 'loading' | 'ready'
}

type ConversationRenameTarget = {
  id: string
  surface: 'sidebar' | 'header'
}

type ConversationRuntimeCache = {
  messages: EditorAiMessageDto[]
  hasMoreMessages: boolean
  systemPrompt: string
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
  onSelectLibrary,
  t,
}: {
  position: { x: number; y: number } | null
  saving: boolean
  downloading: boolean
  saved: boolean
  onSave: () => Promise<void>
  onDownload: () => Promise<void>
  onSelectLibrary: (library: RecentLibrary) => Promise<void>
  t: (key: string) => string
}) {
  const [libraryMenuOpen, setLibraryMenuOpen] = useState(false)
  const [libraries, setLibraries] = useState<RecentLibrary[]>([])
  const [librariesLoading, setLibrariesLoading] = useState(false)
  const [librariesError, setLibrariesError] = useState('')
  useEffect(() => {
    if (!position) setLibraryMenuOpen(false)
  }, [position])
  const loadLibraries = async () => {
    if (librariesLoading) return
    setLibrariesLoading(true)
    setLibrariesError('')
    try {
      setLibraries((await localLibraryApi.entryState()).recent)
    } catch (cause) {
      setLibrariesError(parseLocalLibraryError(cause).message)
    } finally {
      setLibrariesLoading(false)
    }
  }
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
      <div className="relative" onMouseEnter={() => { if (!libraryMenuOpen) { setLibraryMenuOpen(true); void loadLibraries() } }}>
        <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={libraryMenuOpen} onClick={() => { setLibraryMenuOpen((open) => !open); if (!libraryMenuOpen) void loadLibraries() }} className="flex w-full items-center justify-between gap-2 rounded px-2.5 py-2 text-left text-xs hover:bg-accent" style={{ color: 'var(--foreground)' }}>
          <span className="flex items-center gap-2"><FolderOpen size={13} />{t('admin.ai_save_to_library')}</span><ChevronRight size={13} />
        </button>
        {libraryMenuOpen && <div role="menu" className="absolute left-full top-0 ml-1 min-w-52 rounded-md border p-1 shadow-xl" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)' }} onPointerDown={(event) => event.stopPropagation()}>
          {librariesLoading ? <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground"><Loader2 size={13} className="animate-spin" />{t('admin.loading')}</div> : librariesError ? <div className="max-w-56 px-2.5 py-2 text-xs text-destructive">{librariesError}</div> : libraries.length === 0 ? <div className="px-2.5 py-2 text-xs text-muted-foreground">{t('admin.ai_no_local_libraries')}</div> : libraries.map((library) => <button key={library.path} type="button" role="menuitem" disabled={!library.available} onClick={() => void onSelectLibrary(library)} className="flex w-full flex-col rounded px-2.5 py-2 text-left text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"><span className="truncate">{library.name}</span><span className="truncate text-[10px] text-muted-foreground">{library.available ? library.path : t('admin.ai_library_unavailable')}</span></button>)}
        </div>}
      </div>
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

function LocalLibraryFolderTree({ folders, value, onChange, disabled, rootLabel, t }: { folders: FolderItem[]; value: string; onChange: (path: string) => void; disabled: boolean; rootLabel: string; t: (key: string) => string }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const sorted = folders.toSorted((a, b) => a.relativePath.localeCompare(b.relativePath))
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const matchesQuery = (folder: FolderItem) => !normalizedQuery || `${folder.name} ${folder.relativePath}`.toLocaleLowerCase().includes(normalizedQuery)
  const matchesOrContainsMatch = (folder: FolderItem) => matchesQuery(folder) || sorted.some((candidate) => candidate.relativePath.startsWith(`${folder.relativePath}/`) && matchesQuery(candidate))
  const hasChildren = (path: string) => sorted.some((folder) => folder.relativePath.startsWith(`${path}/`))
  const isVisible = (path: string) => {
    if (normalizedQuery) return matchesOrContainsMatch(sorted.find((folder) => folder.relativePath === path)!)
    const parts = path.split('/')
    for (let index = 1; index < parts.length; index += 1) {
      if (!expanded.has(parts.slice(0, index).join('/'))) return false
    }
    return true
  }
  const toggle = (path: string) => setExpanded((current) => {
    const next = new Set(current)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    return next
  })
  return <>
    <div className="relative mt-2"><Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} disabled={disabled} placeholder={t('admin.ai_search_folder_path')} className="h-8 w-full rounded-md border bg-input pl-8 pr-2 text-xs outline-none focus:ring-1 focus:ring-primary" style={{ borderColor: 'var(--border)' }} /></div>
    <div className="mt-2 min-h-40 max-h-80 overflow-y-auto rounded-md border p-1" style={{ borderColor: 'var(--border)' }}>
    <button type="button" disabled={disabled} onClick={() => onChange('')} className={`flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-accent ${value === '' ? 'bg-accent font-medium' : ''}`}><FolderOpen size={13} className="mr-2 shrink-0" /><span className="truncate">{rootLabel}</span></button>
    {sorted.filter((folder) => isVisible(folder.relativePath)).map((folder) => {
      const depth = folder.relativePath.split('/').length - 1
      const children = hasChildren(folder.relativePath)
      return <div key={folder.id} className="flex items-center" style={{ paddingLeft: `${depth * 16}px` }}><button type="button" disabled={disabled || !children} aria-label={children ? (expanded.has(folder.relativePath) ? t('admin.ai_collapse_folder') : t('admin.ai_expand_folder')) : undefined} onClick={() => toggle(folder.relativePath)} className="flex h-7 w-6 shrink-0 items-center justify-center rounded hover:bg-accent disabled:opacity-40">{children && <ChevronDown size={13} className={`transition-transform ${expanded.has(folder.relativePath) ? '' : '-rotate-90'}`} />}</button><button type="button" disabled={disabled} onClick={() => onChange(folder.relativePath)} className={`min-w-0 flex-1 rounded px-2 py-1.5 text-left text-xs hover:bg-accent ${value === folder.relativePath ? 'bg-accent font-medium' : ''}`}><span className="truncate">{folder.name || folder.relativePath}</span></button></div>
    })}
    {normalizedQuery && sorted.every((folder) => !matchesQuery(folder)) && <div className="px-2 py-2 text-xs text-muted-foreground">{t('admin.ai_no_matching_folders')}</div>}
  </div></>
}

function LocalLibrarySaveDialog({ imageUrl, t, onClose, onSaved }: { imageUrl: string; t: (key: string) => string; onClose: () => void; onSaved: () => void }) {
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [destination, setDestination] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    void localLibraryApi.listFolders().then((items) => { if (!cancelled) setFolders(items) }).catch((cause) => { if (!cancelled) setError(parseLocalLibraryError(cause).message) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])
  const submit = async () => {
    if (saving || loading || error) return
    setSaving(true); setError('')
    try {
      const results = await SaveMessageImageToLocalLibrary(imageUrl, destination)
      const failed = results.filter((result) => result.status === 'failed')
      if (failed.length > 0) throw new Error(failed[0]?.error || t('admin.ai_save_to_library_failed'))
      toast.success(t('admin.ai_saved_to_library')); onSaved(); onClose()
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('admin.ai_save_to_library_failed')) } finally { setSaving(false) }
  }
  return <div className="fixed inset-0 z-[70] flex items-center justify-center p-5"><button type="button" aria-label={t('admin.cancel')} onClick={onClose} className="absolute inset-0 bg-black/60" /><div role="dialog" aria-modal="true" className="relative w-full max-w-md rounded-lg border bg-popover p-5 shadow-2xl" style={{ borderColor: 'var(--border)' }}><button type="button" aria-label={t('admin.cancel')} onClick={onClose} disabled={saving} className="absolute right-3 top-3 rounded p-2 hover:bg-secondary disabled:opacity-50"><X size={16} /></button><h2 className="pr-8 text-sm font-semibold">{t('admin.ai_save_to_library')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('admin.ai_save_to_library_hint')}</p>{loading ? <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" />{t('admin.loading')}</div> : error && !folders.length ? <p className="mt-5 rounded-md border border-destructive/40 p-3 text-xs text-destructive">{error}</p> : <><label className="mt-5 block text-xs font-medium">{t('admin.ai_save_location')}</label><LocalLibraryFolderTree folders={folders} value={destination} onChange={setDestination} disabled={saving} rootLabel={t('admin.ai_library_root')} t={t} />{error && <p className="mt-3 text-xs text-destructive">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={saving} className="rounded-md border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50">{t('admin.cancel')}</button><button type="button" onClick={() => void submit()} disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-50">{saving && <Loader2 size={13} className="animate-spin" />}{t('admin.ai_save_to_library')}</button></div></>}</div></div>
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
  const [libraryDialogOpen, setLibraryDialogOpen] = useState(false)
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
  const selectLibrary = async (library: RecentLibrary) => {
    try {
      await localLibraryApi.open(library.path)
      setLibraryDialogOpen(true)
    } catch (cause) {
      toast.error(formatAiLibraryError(cause))
    }
  }

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
        onSelectLibrary={selectLibrary}
        t={t}
      />
      {libraryDialogOpen && <LocalLibrarySaveDialog imageUrl={image.url} t={t} onClose={() => setLibraryDialogOpen(false)} onSaved={() => setLibraryDialogOpen(false)} />}
    </div>
  )
}

function formatAiLibraryError(cause: unknown): string {
  const error = parseLocalLibraryError(cause)
  if (error.code !== 'LIBRARY_LOCKED') return error.message
  const ownerPID = typeof error.details?.ownerPid === 'number' ? error.details.ownerPid : null
  return ownerPID === null
    ? error.message
    : `${error.message}(占用进程 PID:${ownerPID})`
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

function formatConversationDate(dateStr: string): string {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function AgentToolApprovalBar({ conversationId }: { conversationId: string | null }) {
  const approvals = useAgentToolApprovals(conversationId)
  if (approvals.length === 0) return null
  return (
    <div className="border-b px-5 py-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)/10' }}>
      <div className="mx-auto max-w-[44rem] space-y-2">
        {approvals.map((approval) => {
          const canRemember = approval.riskClass === 'read'
          return (
            <div key={approval.id} className="rounded-md border p-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)' }}>
              <div className="flex items-start gap-2">
                <ShieldAlert size={15} className="mt-0.5 shrink-0 text-amber-500" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium">需要批准:{approval.serverName} / {approval.toolName}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">风险:{approval.riskClass} · 参数:{approval.parameterSummary}</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => answerAgentToolApproval(approval.id, 'deny')} className="rounded-md border px-2.5 py-1.5 text-[11px]" style={{ borderColor: 'var(--border)' }}>
                  拒绝
                </button>
                <button type="button" onClick={() => answerAgentToolApproval(approval.id, canRemember ? 'approve_remembered' : 'approve')} className="rounded-md border px-2.5 py-1.5 text-[11px]" style={{ borderColor: 'var(--border)' }}>
                  {canRemember ? '允许并记住' : '允许本次'}
                </button>
                {canRemember && (
                  <button type="button" onClick={() => answerAgentToolApproval(approval.id, 'approve_session')} className="rounded-md px-2.5 py-1.5 text-[11px]" style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}>
                    本会话允许
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

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
        <aside
          className="flex-shrink-0 flex flex-col overflow-hidden border-r"
          style={{ borderColor: 'var(--border)', width: 260 }}
        >
          {/* Sidebar header: compact title + new button */}
          <div className="flex items-center justify-between px-3 h-11 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>
              {t('admin.ai_conversations')}
              <span className="ml-2 font-normal opacity-50">{conversations.length}</span>
            </span>
            <button
              onClick={handleNewConversation}
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors hover:bg-accent"
              style={{ color: 'var(--foreground)' }}
            >
              <Plus size={14} />
            </button>
          </div>

          {/* Conversation list: compact, flat, no animations */}
          <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full px-6 text-center">
                <MessageSquare size={20} className="mb-2 opacity-20" />
                <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{t('admin.ai_no_conversations')}</p>
              </div>
            ) : (
              <div>
                {conversations.map((convo) => {
                  const isActive = activeConversation === convo.id
                  const isDeleting = deletingConversationId === convo.id
                  const isDeletePending = pendingDeleteId === convo.id
                  return (
                    <div
                      key={convo.id}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter') switchConversation(convo.id) }}
                      onClick={() => switchConversation(convo.id)}
                      onContextMenu={event => {
                        event.preventDefault()
                        setConversationMenu({
                          id: convo.id,
                          x: Math.max(8, Math.min(event.clientX, window.innerWidth - 168)),
                          y: Math.max(8, Math.min(event.clientY, window.innerHeight - 82)),
                        })
                      }}
                      className="group flex items-center gap-2 px-3 py-2 cursor-pointer border-l-2 transition-colors"
                      style={{
                        borderLeftColor: isActive ? 'var(--foreground)' : 'transparent',
                        backgroundColor: isActive ? 'var(--accent)' : 'transparent',
                      }}
                    >
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
                              if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
                              else if (event.key === 'Escape') { event.preventDefault(); setRenameTarget(null) }
                            }}
                            maxLength={200}
                            className="h-6 w-full rounded border px-2 text-xs outline-none"
                            style={{ borderColor: 'var(--border)', color: 'var(--foreground)', backgroundColor: 'var(--background)' }}
                            aria-label={t('admin.ai_rename_conversation')}
                          />
                        ) : (
                          <>
                            <div className="text-[12px] leading-tight truncate" style={{ color: isActive ? 'var(--accent-foreground)' : 'var(--foreground)' }}>
                              {convo.title || t('admin.ai_new_chat')}
                            </div>
                            <div className="text-[10px] mt-0.5 tabular-nums" style={{ color: 'var(--muted-foreground)', opacity: 0.6 }}>
                              {formatConversationDate(convo.updatedAt)}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Sidebar actions: show on hover */}
                      <div className={`flex items-center gap-0.5 shrink-0 ${isDeletePending ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        <button
                          disabled={generatingTitleId === convo.id || deletingConversationId !== null}
                          onClick={e => { e.stopPropagation(); startRenamingConversation(convo.id, 'sidebar') }}
                          className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-background/80"
                          style={{ color: 'var(--muted-foreground)' }}
                          aria-label={t('admin.ai_rename_conversation')}
                          title={t('admin.ai_rename_conversation')}
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          disabled={deletingConversationId !== null}
                          onClick={e => { e.stopPropagation(); handleDeleteClick(convo.id) }}
                          className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-background/80"
                          style={{ color: isDeletePending ? 'var(--destructive)' : 'var(--muted-foreground)' }}
                          aria-label={isDeletePending ? t('admin.ai_delete_confirm_again') : t('common.delete')}
                          title={isDeletePending ? t('admin.ai_delete_confirm_again') : t('common.delete')}
                        >
                          {isDeleting ? <Loader2 size={11} className="animate-spin" /> : isDeletePending ? <Trash2 size={11} /> : <X size={11} />}
                        </button>
                      </div>
                    </div>
                  )
                })}
                {hasMoreConversations && (
                  <button
                    type="button"
                    disabled={loadingMoreConversations}
                    onClick={() => void loadMoreConversations()}
                    className="flex h-8 w-full items-center justify-center gap-1.5 text-[11px] hover:bg-accent disabled:opacity-50"
                    style={{ color: 'var(--muted-foreground)' }}
                  >
                    {loadingMoreConversations && <Loader2 size={12} className="animate-spin" />}
                    {t('admin.ai_load_more_conversations')}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Sidebar footer: model indicator */}
          <div className="px-4 py-2 border-t flex items-center gap-2 shrink-0" style={{ borderColor: 'var(--border)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500/50" />
            <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>{activeModelLabel}</span>
          </div>
        </aside>
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

/* ── Desktop Empty State: clean, minimal ── */
function DesktopEmptyState({ t, textareaRef, setInput }: {
  t: (key: string) => string
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  setInput: (value: string) => void
}) {
  const prompts = [
    { text: t('admin.ai_prompt_narrative'), index: 1 },
    { text: t('admin.ai_prompt_describe'), index: 2 },
    { text: t('admin.ai_prompt_title'), index: 3 },
  ]

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 pb-16 select-none">
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-xl"
          style={{ backgroundColor: 'var(--muted)', border: '1px solid var(--border)' }}>
          <Sparkles size={24} style={{ color: 'var(--muted-foreground)', opacity: 0.5 }} />
        </div>
        <h2 className="font-serif text-xl tracking-tight mb-2" style={{ color: 'var(--foreground)' }}>{t('admin.ai_assistant')}</h2>
        <p className="text-xs leading-relaxed mb-8 max-w-xs mx-auto" style={{ color: 'var(--muted-foreground)' }}>{t('admin.ai_welcome')}</p>

        <div className="space-y-1.5">
          {prompts.map((p) => (
            <button
              key={p.index}
              onClick={() => { setInput(p.text); textareaRef.current?.focus() }}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border text-left transition-colors hover:bg-accent"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="text-[10px] font-mono w-5 text-right" style={{ color: 'var(--muted-foreground)', opacity: 0.5 }}>0{p.index}</span>
              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{p.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Desktop Message Bubble: flat timeline style ── */
function isAiImageMetadata(value: unknown): value is AiImageMetadata {
  return Boolean(value && typeof value === 'object' && (value as AiImageMetadata).type === 'image')
}

function ReasoningTraceBlock({ block, active }: {
  block: Extract<EditorAiTraceBlock, { type: 'reasoning' }>
  active: boolean
}) {
  const [open, setOpen] = useState(active)
  const [userInteracted, setUserInteracted] = useState(false)
  const effectiveOpen = userInteracted ? open : active
  return (
    <div className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
      <button
        type="button"
        aria-expanded={effectiveOpen}
        onClick={() => { setUserInteracted(true); setOpen(previous => !previous) }}
        className="flex w-full items-center gap-2 py-1 text-left"
      >
        <Sparkles size={11} />
        <span>{active ? '思考中...' : '思考过程'}</span>
        <ChevronRight size={11} className={`ml-auto transition-transform ${effectiveOpen ? 'rotate-90' : ''}`} />
      </button>
      {effectiveOpen && <div className="whitespace-pre-wrap break-words pl-5 pt-1 leading-relaxed">{block.text}</div>}
    </div>
  )
}

function formatTraceValue(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

function getSkillIdFromTool(tool: Extract<EditorAiTraceBlock, { type: 'tool' }>): string | null {
  if (tool.name !== 'read_agent_skill') return null
  const input = tool.input && typeof tool.input === 'object' && !Array.isArray(tool.input)
    ? tool.input as Record<string, unknown>
    : null
  if (typeof input?.skillId === 'string' && input.skillId.trim()) return input.skillId
  if (tool.inputText) {
    try {
      const parsed = JSON.parse(tool.inputText) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const skillId = (parsed as Record<string, unknown>).skillId
        return typeof skillId === 'string' && skillId.trim() ? skillId : null
      }
    } catch { /* input is still streaming */ }
  }
  return null
}

function ToolTraceBlock({ tool, skills }: {
  tool: Extract<EditorAiTraceBlock, { type: 'tool' }>
  skills: AgentSkill[]
}) {
  const skillId = getSkillIdFromTool(tool)
  const skill = skillId ? skills.find(item => item.id === skillId) : undefined
  const label = skill ? `Skill: ${skill.name}` : skillId ? `Skill: ${skillId}` : tool.name || 'tool'
  const status = tool.status === 'preparing' ? 'preparing'
    : tool.status === 'running' ? 'running'
      : tool.status === 'completed' ? 'completed' : 'failed'
  return (
    <details className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
      <summary className="cursor-pointer select-none py-1">{label} · {status}</summary>
      <div className="space-y-1.5 pl-4 pt-1">
        {(tool.inputText || tool.input !== undefined) && (
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-black/5 p-2 text-[10px] dark:bg-white/5">
            {tool.input !== undefined ? formatTraceValue(tool.input) : tool.inputText}
          </pre>
        )}
        {tool.output !== undefined && <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-black/5 p-2 text-[10px] dark:bg-white/5">{formatTraceValue(tool.output)}</pre>}
        {tool.error && <div className="text-destructive">{tool.error}</div>}
      </div>
    </details>
  )
}

function AssistantTrace({ blocks, streaming, skills }: {
  blocks: EditorAiTraceBlock[]
  streaming: boolean
  skills: AgentSkill[]
}) {
  if (blocks.length === 0) return null
  const activeReasoningId = streaming && blocks.at(-1)?.type === 'reasoning' ? blocks.at(-1)?.id : null
  return (
    <div className="space-y-2">
      {blocks.map(block => block.type === 'reasoning' ? (
        <ReasoningTraceBlock key={block.id} block={block} active={block.id === activeReasoningId} />
      ) : block.type === 'tool' ? (
        <ToolTraceBlock key={block.id} tool={block} skills={skills} />
      ) : block.text ? (
        <div key={block.id} className="ai-markdown text-sm leading-relaxed break-words" style={{ color: 'var(--foreground)' }}>
          <Markdown remarkPlugins={[remarkGfm]}>{block.text}</Markdown>
          {streaming && blocks.at(-1)?.id === block.id && (
            <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse rounded-sm align-middle" style={{ backgroundColor: 'var(--foreground)' }} />
          )}
        </div>
      ) : null)}
    </div>
  )
}

function getGenerationDurationMs(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const durationMs = (metadata as { durationMs?: unknown }).durationMs
  return typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : null
}

function withGenerationDuration(metadata: EditorAiMessageDto['metadata'], durationMs: number): EditorAiMessageDto['metadata'] {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return { ...metadata, durationMs }
  }
  return { durationMs }
}

function formatGenerationDuration(durationMs: number): string {
  return durationMs < 1000 ? `${Math.round(durationMs)} ms` : `${(durationMs / 1000).toFixed(1)} s`
}

function DesktopMessageBubble({ message, persistedMessageId, trace, copiedId, onCopy, onQuote, onRetry, onBranch, branching, skills, t }: {
  message: EditorAiMessageDto
  persistedMessageId?: string
  trace?: EditorAiTraceBlock[]
  copiedId: string | null
  onCopy: (content: string, id: string) => void
  onQuote: (msg: EditorAiMessageDto) => void
  onRetry: (msg: EditorAiMessageDto) => void
  onBranch: (msg: EditorAiMessageDto) => void | Promise<void>
  branching: boolean
  skills: AgentSkill[]
  t: (key: string) => string
}) {
  const isUser = message.role === 'user'
  const imageMetadata = isAiImageMetadata(message.metadata) ? message.metadata : null
  const messageImages = getMessageImages(message.metadata)
  const saveMessageId = persistedMessageId || message.id
  const traceBlocks = trace ?? readEditorAiAssistantTrace(message.metadata)
  const hasTraceText = traceBlocks.some(block => block.type === 'text' && block.text)
  const generationDurationMs = getGenerationDurationMs(message.metadata)

  return (
    <div className={`group mb-3 ${isUser ? 'flex flex-row-reverse gap-2' : 'flex gap-2'}`}>
      {/* Avatar */}
      <div className="shrink-0 mt-1">
        {isUser ? (
          <div className="flex h-7 w-7 items-center justify-center rounded-md text-[9px] font-semibold"
            style={{ backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}>
            Me
          </div>
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-md"
            style={{ backgroundColor: '#f59e0b/10' }}>
            <Sparkles size={12} style={{ color: '#f59e0b' }} />
          </div>
        )}
      </div>

      {/* Message content */}
      <div className={`min-w-0 ${isUser ? 'max-w-[75%]' : 'max-w-[75%]'}`}>
        <div
          className="px-3.5 py-2.5 rounded-lg text-sm leading-relaxed"
          style={{
            backgroundColor: isUser ? 'var(--muted)' : 'var(--muted)/10',
            border: `1px solid var(--border)`,
          }}
        >
          {isUser ? (
            <>
              <div className="whitespace-pre-wrap break-words" style={{ color: 'var(--foreground)' }}>{message.content}</div>
              {messageImages.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {messageImages.map((image, index) => (
                    <MessageImage key={`${image.url}-${index}`} messageId={saveMessageId} image={image} t={t} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {!imageMetadata && <AssistantTrace blocks={traceBlocks} streaming={message.status === 'streaming'} skills={skills} />}
              {imageMetadata ? (
                <ImagePreview message={message} messageId={saveMessageId} metadata={imageMetadata} t={t} />
              ) : message.status === 'streaming' && !message.content && traceBlocks.length === 0 ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{t('admin.ai_thinking')}</span>
                  <span className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <span key={i} className="w-1 h-1 rounded-full animate-bounce" style={{ backgroundColor: 'var(--muted-foreground)', opacity: 0.45, animationDelay: `${i * 150}ms` }} />
                    ))}
                  </span>
                </div>
              ) : message.content && !hasTraceText ? (
                <div className="ai-markdown text-sm leading-relaxed break-words" style={{ color: 'var(--foreground)' }}>
                  <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
                  {message.status === 'streaming' && (
                    <span className="inline-block w-[2px] h-4 rounded-sm animate-pulse ml-0.5 align-middle" style={{ backgroundColor: 'var(--foreground)' }} />
                  )}
                </div>
              ) : null}
              {messageImages.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {messageImages.map((image, index) => (
                    <MessageImage key={`${image.url}-${index}`} messageId={saveMessageId} image={image} t={t} />
                  ))}
                </div>
              )}
              {message.status === 'failed' && message.error && (
                <div className="mt-2 rounded border px-2.5 py-1.5 text-[11px]"
                  style={{ borderColor: 'var(--destructive)/20', color: 'var(--destructive)', backgroundColor: 'var(--destructive)/5' }}>
                  {message.error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Message actions: show on hover */}
        {message.content && !isUser && (
          <div className="flex items-center gap-0.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onCopy(message.content, message.id)}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded hover:bg-accent"
              style={{ color: 'var(--muted-foreground)' }}>
              {copiedId === message.id ? <Check size={9} className="text-green-500" /> : <Copy size={9} />}
            </button>
            <button onClick={() => onQuote(message)}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded hover:bg-accent"
              style={{ color: 'var(--muted-foreground)' }}>
              <Quote size={9} />
            </button>
            {generationDurationMs !== null && (
              <span className="px-1.5 py-0.5 text-[9px] tabular-nums" style={{ color: 'var(--muted-foreground)', opacity: 0.6 }}>
                {formatGenerationDuration(generationDurationMs)}
              </span>
            )}
            <button onClick={() => onRetry(message)} disabled={branching || message.status === 'streaming'}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded hover:bg-accent disabled:opacity-40"
              style={{ color: 'var(--muted-foreground)' }}>
              <RotateCcw size={9} />
            </button>
            <button onClick={() => void onBranch(message)} disabled={branching || message.status === 'streaming'}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded hover:bg-accent disabled:opacity-40"
              style={{ color: 'var(--muted-foreground)' }}>
              {branching ? <Loader2 size={9} className="animate-spin" /> : <GitBranch size={9} />}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Image Preview ── */
function ImagePreview({ message, messageId, metadata, t }: {
  message: EditorAiMessageDto
  messageId: string
  metadata: AiImageMetadata
  t: (key: string) => string
}) {
  const [libraryDialogOpen, setLibraryDialogOpen] = useState(false)
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
  const selectLibrary = async (library: RecentLibrary) => {
    try {
      await localLibraryApi.open(library.path)
      setLibraryDialogOpen(true)
    } catch (cause) {
      toast.error(formatAiLibraryError(cause))
    }
  }

  useCachedPageEffect(() => {
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
        setImageSrc(dataUrl)
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : '图片加载失败')
      } finally {
        setLoadingImage(false)
      }
    }
    void loadImage()
  }, [messageId, metadata.uploadedUrl])

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: 'var(--foreground)' }}>{message.content || '已生成图片'}</p>
      <div className="rounded-lg border overflow-hidden max-w-md" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)/10' }}>
        {loadingImage ? (
          <div className="h-56 flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
            <Loader2 size={16} className="animate-spin" /> 加载中...
          </div>
        ) : loadError ? (
          <div className="h-32 flex items-center justify-center px-4 text-xs text-center" style={{ color: 'var(--destructive)' }}>{loadError}</div>
        ) : (
          <img
            src={imageSrc}
            alt="AI generated image"
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
        onSelectLibrary={selectLibrary}
        t={t}
      />
      {libraryDialogOpen && <LocalLibrarySaveDialog imageUrl={imageSrc} t={t} onClose={() => setLibraryDialogOpen(false)} onSaved={() => setLibraryDialogOpen(false)} />}
      <details className="text-[10px] leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
        <summary className="cursor-pointer select-none py-1">生成信息</summary>
        <div className="space-y-1.5 pt-1">
          <p className="whitespace-pre-wrap break-words">提示词: {metadata.prompt}</p>
          {metadata.revisedPrompt && <p className="whitespace-pre-wrap break-words">优化后: {metadata.revisedPrompt}</p>}
          {(metadata.provider || metadata.model || metadata.size) && <p>{[metadata.provider, metadata.model, metadata.size].filter(Boolean).join(' · ')}</p>}
        </div>
      </details>
    </div>
  )
}
