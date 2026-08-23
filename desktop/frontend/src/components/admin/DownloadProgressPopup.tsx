import { useMemo, useState } from 'react'
import {
  X, ChevronDown, ChevronUp, Check, AlertCircle, SkipForward,
  Download as DownloadIcon,
} from 'lucide-react'
import { useDownloadQueue } from '@/contexts/DownloadQueueContext'
import type { DownloadTask, DownloadTaskStatus } from '@/contexts/DownloadQueueContext'
import { useTransferSpeed, formatSpeed } from '@/hooks/useTransferSpeed'

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i]
}

function StatusIcon({ status, progress }: { status: DownloadTaskStatus; progress: number }) {
  if (status === 'completed') return <Check size={14} className="text-green-500" />
  if (status === 'skipped') return <SkipForward size={14} style={{ color: 'var(--muted-foreground)' }} />
  if (status === 'failed') return <AlertCircle size={14} className="text-red-500" />
  if (status === 'downloading' || status === 'importing' || status === 'pending') {
    const r = 6
    const c = 2 * Math.PI * r
    const offset = c * (1 - progress / 100)
    return (
      <svg width={16} height={16} className="animate-spin">
        <circle cx={8} cy={8} r={r} fill="none" stroke="var(--muted)" strokeWidth={2} />
        <circle cx={8} cy={8} r={r} fill="none" stroke="var(--primary)" strokeWidth={2}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 8 8)" />
      </svg>
    )
  }
  return <DownloadIcon size={14} style={{ color: 'var(--muted-foreground)' }} />
}

function getTaskStatusLabel(task: DownloadTask): string {
  if (task.status === 'pending') return '准备中'
  if (task.status === 'downloading') return `下载中 · ${task.progress}%`
  if (task.status === 'importing') return '导入资源库中'
  if (task.status === 'completed') return '已完成'
  if (task.status === 'skipped') return '已跳过（同名文件已存在）'
  return '下载失败'
}

function TaskRow({ task, onRemove }: { task: DownloadTask; onRemove: (id: string) => void }) {
  const errorMessage = task.error || '下载失败'
  const statusLabel = getTaskStatusLabel(task)

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b last:border-b-0"
      style={{ borderColor: 'var(--border)' }}>
      <div className="w-10 h-10 rounded shrink-0 flex items-center justify-center"
        style={{ backgroundColor: 'var(--muted)' }}>
        <DownloadIcon size={16} style={{ color: 'var(--muted-foreground)' }} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs truncate" style={{ color: 'var(--foreground)' }}>{task.fileName}</p>
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
          {task.fileSize > 0 ? formatFileSize(task.fileSize) : '—'}
          <span className="ml-1">· {statusLabel}</span>
        </p>
        {task.status === 'failed' && (
          <p className="text-[10px] mt-0.5 truncate text-red-500" title={errorMessage}>
            {errorMessage}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <StatusIcon status={task.status} progress={task.progress} />
        {(task.status === 'completed' || task.status === 'skipped' || task.status === 'failed') && (
          <button onClick={() => onRemove(task.id)}
            className="p-1 rounded hover:opacity-80"
            style={{ color: 'var(--muted-foreground)' }}
            title="移除">
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

export function DownloadProgressPopup() {
  const { tasks, isDownloading, removeTask, clearCompleted } = useDownloadQueue()
  const [minimized, setMinimized] = useState(false)

  const hasActiveDownload = tasks.some(t => t.status === 'downloading')
  const speedSources = useMemo(() => tasks.map(t => ({
    id: t.id,
    bytes: t.downloaded ?? 0,
    active: t.status === 'downloading',
  })), [tasks])
  const speed = useTransferSpeed(speedSources, hasActiveDownload)

  if (tasks.length === 0) return null

  const completedCount = tasks.filter(t => t.status === 'completed').length
  const failedCount = tasks.filter(t => t.status === 'failed').length
  const totalCount = tasks.length
  const allDone = !isDownloading && failedCount === 0
  const hasFailed = failedCount > 0 && !isDownloading
  const hasCompletedOrFailed = completedCount > 0 || failedCount > 0

  const activeLabel = tasks.some(t => t.status === 'downloading')
    ? '下载中'
    : tasks.some(t => t.status === 'importing')
      ? '导入中'
      : tasks.some(t => t.status === 'pending')
        ? '准备中'
        : allDone
          ? '下载完成'
          : '下载队列'

  const overallProgress = totalCount > 0
    ? Math.round(tasks.reduce((sum, t) => sum + (t.status === 'completed' ? 100 : t.progress), 0) / totalCount)
    : 0

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border shadow-xl overflow-hidden"
      style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
        style={{ backgroundColor: 'var(--muted)' }}
        onClick={() => setMinimized(!minimized)}>
        <DownloadIcon size={14} style={{ color: 'var(--foreground)' }} />
        <span className="text-xs font-medium flex-1" style={{ color: 'var(--foreground)' }}>
          {activeLabel} {completedCount}/{totalCount}
          {failedCount > 0 && <span className="text-red-500 ml-1">({failedCount} 失败)</span>}
        </span>
        {speed > 0 && (
          <span className="text-[10px] font-normal shrink-0" style={{ color: 'var(--muted-foreground)' }}>
            {formatSpeed(speed)}
          </span>
        )}
        <button onClick={(e) => { e.stopPropagation(); setMinimized(!minimized) }}
          className="p-0.5 rounded hover:opacity-80"
          style={{ color: 'var(--muted-foreground)' }}>
          {minimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {hasCompletedOrFailed && (
          <button onClick={(e) => { e.stopPropagation(); clearCompleted() }}
            className="p-0.5 rounded hover:opacity-80"
            style={{ color: 'var(--muted-foreground)' }}>
            <X size={14} />
          </button>
        )}
      </div>

      <div className="h-1" style={{ backgroundColor: 'var(--muted)' }}>
        <div className="h-full transition-all duration-300"
          style={{
            width: `${overallProgress}%`,
            backgroundColor: failedCount > 0 ? 'var(--destructive)' : 'var(--primary)',
          }} />
      </div>

      {!minimized && (
        <div className="max-h-60 overflow-y-auto">
          {tasks.map(task => (
            <TaskRow key={task.id} task={task} onRemove={removeTask} />
          ))}
        </div>
      )}
    </div>
  )
}
