'use client'

import { Loader2 } from 'lucide-react'
import dynamic from 'next/dynamic'

export const STORY_PHOTO_PANEL_COLLAPSED_KEY = 'admin-story-photo-panel-collapsed'
export const STORY_PHOTO_ORDER_KEY = 'story_photo_order'
export const STORY_UPLOAD_SETTINGS_KEY = 'story_upload_settings'
export const STORY_PASTE_UPLOAD_SETTINGS_KEY = 'story_paste_upload_settings'
export const AUTO_SAVE_DELAY = 2000

export const NarrativeTipTapEditor = dynamic(() => import('@/components/NarrativeTipTapEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center border border-border bg-card/30">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  ),
})
