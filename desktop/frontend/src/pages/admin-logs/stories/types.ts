'use client'

import type { Dispatch, ReactNode, SetStateAction } from 'react'
import type { StoryDto } from '@/lib/api/types'
import type { StoryEditorDraftData } from '@/lib/client-db'
import type { UploadSettings } from '@/components/admin/ImageUploadSettingsModal'

export interface StoriesTabProps {
  token: string | null
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  editStoryId?: string
  editFromDraft?: StoryEditorDraftData | null
  onDraftConsumed?: () => void
  refreshKey?: number
  listPaneCollapsed?: boolean
  onToggleListPane?: () => void
  subTabNav?: ReactNode
  /** 当前子页签是否可见（沉浸模式仅在编辑器可见时保持） */
  active?: boolean
  isImmersiveMode: boolean
  setIsImmersiveMode: Dispatch<SetStateAction<boolean>>
}

export interface StorySnapshot {
  title: string
  content: string
  contentJson?: StoryDto['contentJson']
  isPublished: boolean
  createdAt: string
  storyDate: string
  photoIds: string[]
  coverPhotoId?: string
  coverCrop?: { x: number; y: number; width: number; height: number } | null
}

export interface DraftRestoreDialogState {
  isOpen: boolean
  draft: StoryEditorDraftData | null
  story: StoryDto | null
}

export interface UploadProgressState {
  current: number
  total: number
  currentFile: string
}

export interface PasteUploadState {
  settings: UploadSettings
  hasConfirmedSettings: boolean
}
