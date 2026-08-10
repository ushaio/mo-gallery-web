import { Loader2, MessageSquare, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { EditorAiConversationDto } from '@/lib/api/types'
import type { ConversationRenameTarget } from '@/lib/ai-assistant/types'
import { formatConversationDate } from '@/lib/ai-assistant/utils'

export function ConversationSidebar({
  conversations,
  hasMoreConversations,
  loadingMoreConversations,
  activeConversation,
  deletingConversationId,
  pendingDeleteId,
  renameTarget,
  conversationTitleDraft,
  generatingTitleId,
  activeModelLabel,
  t,
  onNew,
  onSwitch,
  onLoadMore,
  onStartRename,
  onCommitTitle,
  onTitleDraftChange,
  onCancelRename,
  onDeleteClick,
  onConversationMenu,
}: {
  conversations: EditorAiConversationDto[]
  hasMoreConversations: boolean
  loadingMoreConversations: boolean
  activeConversation: string | null
  deletingConversationId: string | null
  pendingDeleteId: string | null
  renameTarget: ConversationRenameTarget | null
  conversationTitleDraft: string
  generatingTitleId: string | null
  activeModelLabel: string
  t: (key: string) => string
  onNew: () => void
  onSwitch: (id: string) => void
  onLoadMore: () => void
  onStartRename: (id: string, surface: ConversationRenameTarget['surface']) => void
  onCommitTitle: (id: string) => void
  onTitleDraftChange: (value: string) => void
  onCancelRename: () => void
  onDeleteClick: (id: string) => void
  onConversationMenu: (menu: { id: string; x: number; y: number }) => void
}) {
  return (
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
          onClick={onNew}
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
                  onKeyDown={e => { if (e.key === 'Enter') onSwitch(convo.id) }}
                  onClick={() => onSwitch(convo.id)}
                  onContextMenu={event => {
                    event.preventDefault()
                    onConversationMenu({
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
                        onChange={event => onTitleDraftChange(event.target.value)}
                        onFocus={event => event.currentTarget.select()}
                        onClick={event => event.stopPropagation()}
                        onPointerDown={event => event.stopPropagation()}
                        onBlur={() => void onCommitTitle(convo.id)}
                        onKeyDown={event => {
                          event.stopPropagation()
                          if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
                          else if (event.key === 'Escape') { event.preventDefault(); onCancelRename() }
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
                      onClick={e => { e.stopPropagation(); onStartRename(convo.id, 'sidebar') }}
                      className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-background/80"
                      style={{ color: 'var(--muted-foreground)' }}
                      aria-label={t('admin.ai_rename_conversation')}
                      title={t('admin.ai_rename_conversation')}
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      disabled={deletingConversationId !== null}
                      onClick={e => { e.stopPropagation(); onDeleteClick(convo.id) }}
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
                onClick={() => void onLoadMore()}
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
  )
}
