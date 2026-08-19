import { Check, Copy, GitBranch, Loader2, Quote, RotateCcw, Sparkles } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { readEditorAiAssistantTrace, type EditorAiTraceBlock } from '@mo-gallery/ai-agent'
import type { AiImageMetadata, EditorAiMessageDto } from '@/lib/api/types'
import type { AgentSkill } from '@/lib/agent-extensions'
import { getMessageImages } from '@/lib/ai-assistant/images'
import {
  formatGenerationDuration,
  formatTokenCount,
  getGenerationDurationMs,
  getGenerationUsage,
} from '@/lib/ai-assistant/utils'
import { ImagePreview } from '../image/ImagePreview'
import { MessageImage } from '../image/MessageImage'
import { AssistantTrace } from './AssistantTrace'

function isAiImageMetadata(value: unknown): value is AiImageMetadata {
  return Boolean(value && typeof value === 'object' && (value as AiImageMetadata).type === 'image')
}

export function DesktopMessageBubble({ message, persistedMessageId, trace, copiedId, onCopy, onQuote, onRetry, onBranch, branching, skills, t }: {
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
  const generationUsage = getGenerationUsage(message.metadata)
  const cacheReadTokens = generationUsage?.cacheReadTokens

  if (!isUser && message.status === 'streaming' && !imageMetadata && !message.content && traceBlocks.length === 0) {
    return null
  }

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
              {!imageMetadata && (
                <AssistantTrace
                  blocks={traceBlocks}
                  streaming={message.status === 'streaming'}
                  skills={skills}
                  t={t}
                />
              )}
              {imageMetadata ? (
                <ImagePreview message={message} messageId={saveMessageId} metadata={imageMetadata} t={t} />
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

        {!isUser && (generationDurationMs !== null || cacheReadTokens !== undefined) && (
          <div className="mt-1 flex items-center gap-2 px-1 text-[9px] tabular-nums" style={{ color: 'var(--muted-foreground)', opacity: 0.65 }}>
            {generationDurationMs !== null && <span>{formatGenerationDuration(generationDurationMs)}</span>}
            {cacheReadTokens !== undefined && (
              <span>
                {cacheReadTokens > 0
                  ? `${t('admin.ai_cache_hit')} ${formatTokenCount(cacheReadTokens)}`
                  : t('admin.ai_cache_miss')}
              </span>
            )}
          </div>
        )}

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
