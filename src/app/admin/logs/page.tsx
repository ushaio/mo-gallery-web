/**
 * 日志管理页面 - 聚合博客、故事和草稿管理的入口页
 */
'use client'

import { useSearchParams } from 'next/navigation'
import { useAdmin } from '../layout'
import { LogsTab } from './LogsTab'

export default function LogsPage() {
  const searchParams = useSearchParams()
  const editStoryId = searchParams.get('editStory')
  const {
    token,
    photos,
    settings,
    t,
    notify,
  } = useAdmin()

  return (
    <LogsTab
      token={token}
      photos={photos}
      settings={settings}
      t={t}
      notify={notify}
      initialTab={editStoryId ? 'stories' : undefined}
      editStoryId={editStoryId || undefined}
    />
  )
}
