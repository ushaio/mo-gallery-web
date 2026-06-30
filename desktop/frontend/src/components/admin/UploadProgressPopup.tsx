import { useState } from 'react'
import {
  X, ChevronDown, ChevronUp, Check, AlertCircle,
  RefreshCw, Image as ImageIcon, Upload, Trash2,
} from 'lucide-react'
import { useUploadQueue } from '@/contexts/UploadQueueContext'
import type { UploadTask, UploadTaskStatus } from '@/contexts/UploadQueueContext'

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i]
}

function StatusIcon({ status, progress }: { status: UploadTaskStatus; progress: number }) {
  if (status === 'completed') return <Check size={14} className="text-green-500" />
  if (status === 'failed') return <AlertCircle size={14} className="text-red-500" />
  if (status === 'uploading') {
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
  return <Upload size={14} style={{ color: 'var(--muted-foreground)' }} />
}

function TaskRow({ task, onRetry }: { task: UploadTask; onRetry: (id: string) => void }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b last:border-b-0"
      style={{ borderColor: 'var(--border)' }}>
      {/* 缩略图 */}
      <div className="w-10 h-10 rounded overflow-hidden shrink-0 flex items-center justify-center"
        style={{ backgroundColor: 'var(--muted)' }}>
        <ImageIcon size={16} style={{ color: 'var(--muted-foreground)' }} />
      </div>

      {/* 文件信息 */}
      <div className="flex-1 min-w-0">
        <p className="text-xs truncate" style={{ color: 'var(--foreground)' }}>{task.fileName}</p>
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
          {formatFileSize(task.fileSize)}
          {task.status === 'uploading' && ` · ${task.progress}%`}
          {task.status === 'completed' && task.error && (
            <span className="text-amber-500 ml-1">{task.error}</span>
          )}
        </p>
      </div>

      {/* 状态 */}
      <div className="flex items-center gap-1.5 shrink-0">
        <StatusIcon status={task.status} progress={task.progress} />
        {task.status === 'failed' && (
          <button onClick={() => onRetry(task.id)}
            className="p-1 rounded hover:opacity-80"
            style={{ color: 'var(--muted-foreground)' }}
            title="重试">
            <RefreshCw size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

export function UploadProgressPopup() {
  const { tasks, isUploading, retryTask, retryAllFailed, removeTask, clearCompleted } = useUploadQueue()
  const [minimized, setMinimized] = useState(false)

  if (tasks.length === 0) return null

  const completedCount = tasks.filter(t => t.status === 'completed').length
  const failedCount = tasks.filter(t => t.status === 'failed').length
  const totalCount = tasks.length
  const allDone = !isUploading && failedCount === 0
  const hasFailed = failedCount > 0 && !isUploading

  const overallProgress = totalCount > 0
    ? Math.round(tasks.reduce((sum, t) => sum + (t.status === 'completed' ? 100 : t.progress), 0) / totalCount)
    : 0

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border shadow-xl overflow-hidden"
      style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
        style={{ backgroundColor: 'var(--muted)' }}
        onClick={() => setMinimized(!minimized)}>
        <Upload size={14} style={{ color: 'var(--foreground)' }} />
        <span className="text-xs font-medium flex-1" style={{ color: 'var(--foreground)' }}>
          上传中 {completedCount}/{totalCount}
          {failedCount > 0 && <span className="text-red-500 ml-1">({failedCount} 失败)</span>}
        </span>
        <button onClick={(e) => { e.stopPropagation(); setMinimized(!minimized) }}
          className="p-0.5 rounded hover:opacity-80"
          style={{ color: 'var(--muted-foreground)' }}>
          {minimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {(allDone || hasFailed) && (
          <button onClick={(e) => { e.stopPropagation(); clearCompleted() }}
            className="p-0.5 rounded hover:opacity-80"
            style={{ color: 'var(--muted-foreground)' }}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* Progress bar (always visible) */}
      <div className="h-1" style={{ backgroundColor: 'var(--muted)' }}>
        <div className="h-full transition-all duration-300"
          style={{
            width: `${overallProgress}%`,
            backgroundColor: failedCount > 0 ? 'var(--destructive)' : 'var(--primary)',
          }} />
      </div>

      {/* Task list */}
      {!minimized && (
        <div className="max-h-60 overflow-y-auto">
          {tasks.map(task => (
            <TaskRow key={task.id} task={task} onRetry={retryTask} />
          ))}
        </div>
      )}

      {/* Footer */}
      {!minimized && hasFailed && (
        <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={retryAllFailed}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-md hover:opacity-80"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
            <RefreshCw size={12} />
            重试全部失败 ({failedCount})
          </button>
        </div>
      )}
    </div>
  )
}
