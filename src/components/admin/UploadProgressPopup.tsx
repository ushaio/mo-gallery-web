'use client'

import React, { useState } from 'react'
import {
  X,
  ChevronDown,
  ChevronUp,
  Check,
  Loader2,
  AlertCircle,
  RefreshCw,
  Image as ImageIcon,
  Upload,
} from 'lucide-react'
import { UploadTask, UploadTaskStatus } from '@/contexts/UploadQueueContext'
import { AdminButton } from '@/components/admin/AdminButton'

interface UploadProgressPopupProps {
  tasks: UploadTask[]
  isMinimized: boolean
  onToggleMinimize: () => void
  onClose: () => void
  onRetry: (taskId: string) => void
  onRemoveTask: (taskId: string) => void
  t: (key: string) => string
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function UploadProgressPopup({
  tasks,
  isMinimized,
  onToggleMinimize,
  onClose,
  onRetry,
  onRemoveTask,
  t,
}: UploadProgressPopupProps) {
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null)

  if (tasks.length === 0) return null

  const completedCount = tasks.filter((t) => t.status === 'completed').length
  const failedCount = tasks.filter((t) => t.status === 'failed').length
  const uploadingCount = tasks.filter((t) => t.status === 'uploading').length
  const compressingCount = tasks.filter((t) => t.status === 'compressing').length
  const pendingCount = tasks.filter((t) => t.status === 'pending').length
  const totalCount = tasks.length

  const allCompleted = completedCount === totalCount
  const hasFailures = failedCount > 0
  const isUploading = uploadingCount > 0 || compressingCount > 0 || pendingCount > 0

  // Calculate overall progress
  const overallProgress = tasks.reduce((acc, task) => {
    if (task.status === 'completed') return acc + 100
    if (task.status === 'failed') return acc + 0
    return acc + task.progress
  }, 0) / totalCount

  const getStatusIcon = (status: UploadTaskStatus, progress: number) => {
    switch (status) {
      case 'completed':
        return (
          <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
            <Check className="w-3 h-3 text-green-500" />
          </div>
        )
      case 'failed':
        return (
          <div className="w-5 h-5 rounded-full bg-destructive/20 flex items-center justify-center">
            <AlertCircle className="w-3 h-3 text-destructive" />
          </div>
        )
      case 'compressing':
        return (
          <div className="relative w-5 h-5">
            <svg className="w-5 h-5 -rotate-90" viewBox="0 0 20 20">
              <circle
                cx="10"
                cy="10"
                r="8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-muted/30"
              />
              <circle
                cx="10"
                cy="10"
                r="8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={`${progress * 0.5} 50`}
                className="text-amber-500 transition-all duration-300"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-amber-500">
              {progress}
            </span>
          </div>
        )
      case 'uploading':
        return (
          <div className="relative w-5 h-5">
            <svg className="w-5 h-5 -rotate-90" viewBox="0 0 20 20">
              <circle
                cx="10"
                cy="10"
                r="8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-muted/30"
              />
              <circle
                cx="10"
                cy="10"
                r="8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={`${progress * 0.5} 50`}
                className="text-primary transition-all duration-300"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-primary">
              {progress}
            </span>
          </div>
        )
      default:
        return (
          <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
          </div>
        )
    }
  }

  const getStatusText = () => {
    if (allCompleted) return `${t('admin.upload_complete')} ${completedCount}/${totalCount}`
    if (compressingCount > 0) return `${t('admin.compressing')} ${completedCount}/${totalCount}`
    if (uploadingCount > 0) return `${t('admin.uploading')} ${completedCount}/${totalCount}`
    if (hasFailures && pendingCount === 0 && uploadingCount === 0 && compressingCount === 0) {
      return `${completedCount}/${totalCount} · ${failedCount} ${t('admin.failed')}`
    }
    return `${t('admin.pending')} ${completedCount}/${totalCount}`
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 bg-background border border-border shadow-2xl overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggleMinimize}
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            {isUploading ? (
              <div className="relative">
                <Upload className="w-5 h-5 text-primary" />
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse" />
              </div>
            ) : hasFailures ? (
              <AlertCircle className="w-5 h-5 text-destructive" />
            ) : allCompleted ? (
              <Check className="w-5 h-5 text-green-500" />
            ) : (
              <Upload className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider">
              {getStatusText()}
            </p>
            {!isMinimized && isUploading && (
              <p className="text-[10px] text-muted-foreground font-mono">
                {Math.round(overallProgress)}% · {totalCount} {t('admin.items')}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <AdminButton
            onClick={(e) => {
              e.stopPropagation()
              onToggleMinimize()
            }}
            adminVariant="icon"
            className="p-1.5 hover:bg-background"
          >
            {isMinimized ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </AdminButton>
          {(allCompleted || (hasFailures && !isUploading)) && (
            <AdminButton
              onClick={(e) => {
                e.stopPropagation()
                onClose()
              }}
              adminVariant="icon"
              className="p-1.5 hover:bg-background"
            >
              <X className="w-4 h-4" />
            </AdminButton>
          )}
        </div>
      </div>

      {/* Overall Progress Bar */}
      {!isMinimized && (
        <div className="h-1 bg-muted">
          <div
            className={`h-full transition-all duration-300 ease-out ${
              hasFailures && !isUploading ? 'bg-destructive' : allCompleted ? 'bg-green-500' : 'bg-primary'
            }`}
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      )}

      {/* Task List */}
      {!isMinimized && (
        <div className="max-h-80 overflow-y-auto custom-scrollbar">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="group flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-b-0 hover:bg-muted/20 transition-colors"
              onMouseEnter={() => setHoveredTaskId(task.id)}
              onMouseLeave={() => setHoveredTaskId(null)}
            >
              {/* Thumbnail */}
              <div className="w-12 h-12 bg-muted flex-shrink-0 overflow-hidden border border-border/50">
                {task.preview ? (
                  <img
                    src={task.preview}
                    alt={task.fileName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-5 h-5 text-muted-foreground/50" />
                  </div>
                )}
              </div>

              {/* File Info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate mb-0.5">{task.fileName}</p>
                <div className="flex items-center gap-2">
                  {/* Show compression info if compressed */}
                  {task.compressedSize && task.compressedSize < task.originalSize ? (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {formatFileSize(task.originalSize)} → {formatFileSize(task.compressedSize)}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {formatFileSize(task.originalSize)}
                    </span>
                  )}
                  {task.status === 'compressing' && (
                    <span className="text-[10px] text-amber-500 font-bold">
                      {t('admin.compressing')} {task.progress}%
                    </span>
                  )}
                  {task.status === 'uploading' && (
                    <span className="text-[10px] text-primary font-bold">
                      {task.progress}%
                    </span>
                  )}
                  {task.status === 'failed' && task.error && (
                    <span className="text-[10px] text-destructive truncate max-w-[120px]">
                      {task.error}
                    </span>
                  )}
                </div>
                {/* Individual Progress Bar */}
                {(task.status === 'compressing' || task.status === 'uploading') && (
                  <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ease-out ${
                        task.status === 'compressing' ? 'bg-amber-500' : 'bg-primary'
                      }`}
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Status / Actions */}
              <div className="flex-shrink-0 w-8 flex justify-center">
                {task.status === 'failed' && hoveredTaskId === task.id ? (
                  <AdminButton
                    onClick={() => onRetry(task.id)}
                    adminVariant="iconPrimary"
                    className="p-1.5 text-primary hover:bg-primary/10"
                    title={t('admin.retry')}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </AdminButton>
                ) : (
                  getStatusIcon(task.status, task.progress)
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer Actions */}
      {!isMinimized && hasFailures && !isUploading && (
        <div className="px-4 py-3 border-t border-border bg-muted/20">
          <AdminButton
            onClick={() => {
              tasks
                .filter((t) => t.status === 'failed')
                .forEach((t) => onRetry(t.id))
            }}
            adminVariant="primarySoft"
            size="md"
            className="w-full flex items-center justify-center gap-2 border border-primary/30 hover:border-primary"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t('admin.retry_all_failed')} ({failedCount})
          </AdminButton>
        </div>
      )}

      {/* Minimized Progress Indicator */}
      {isMinimized && isUploading && (
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      )}
    </div>
  )
}

