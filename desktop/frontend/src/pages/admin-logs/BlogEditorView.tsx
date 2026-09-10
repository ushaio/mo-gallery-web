'use client'

import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Check, FileText } from 'lucide-react'
import { EditorContentPrompt } from '@mo-gallery/milkdown/editor-content'
import { convertToMilkdown } from '@mo-gallery/milkdown/migration'
import type { ArticleContentDto } from '@/lib/api/types'
import { usePreferences } from '@/store/preferences'
import type { NarrativeMilkdownEditorHandle } from '@/components/NarrativeMilkdownEditor'
import NarrativeMilkdownEditor from '@/components/NarrativeMilkdownEditor'
import { EditorShell } from './shared/EditorShell'
import { BlogPreviewModal } from './shared/BlogPreviewModal'
import { cn } from '@/lib/utils'

export interface BlogFormData extends ArticleContentDto {
  id?: string
  title: string
  category: string
  tags: string
  isPublished: boolean
}

export interface BlogEditorHandle {
  insertMarkdown: (markdown: string) => void
  getValue: () => string
}

interface BlogEditorViewProps {
  blog: BlogFormData
  onChange: (patch: Partial<BlogFormData>) => void
  editorRevision?: number
  editorSessionId?: string
  saving: boolean
  draftSaved: boolean
  lastSavedAt: number | null
  isAiTaskLocked: boolean
  onAiTaskLockChange: (locked: boolean) => void
  onSave: () => void
  onClose: () => void
  token: string | null
  documentId: string
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  listPaneCollapsed?: boolean
  onToggleListPane?: () => void
  isImmersiveMode: boolean
  setIsImmersiveMode: Dispatch<SetStateAction<boolean>>
}

export const BlogEditorView = forwardRef<BlogEditorHandle, BlogEditorViewProps>(function BlogEditorView({
  blog,
  onChange,
  editorRevision,
  editorSessionId,
  saving,
  draftSaved,
  lastSavedAt,
  isAiTaskLocked,
  onAiTaskLockChange,
  onSave,
  onClose,
  token,
  documentId,
  t,
  notify,
  listPaneCollapsed,
  onToggleListPane,
  isImmersiveMode,
  setIsImmersiveMode,
}, ref) {
  const editorRef = useRef<NarrativeMilkdownEditorHandle>(null)
  const [showPreview, setShowPreview] = useState(false)
  const language = usePreferences((state) => state.language)
  const hasMilkdownContent = blog.contentEditorTypes.includes('milkdown')
  const canEdit = blog.editorType === 'milkdown' && hasMilkdownContent

  useImperativeHandle(ref, () => ({
    getValue: () => editorRef.current?.getValue() ?? blog.milkContent ?? '',
    insertMarkdown: (markdown: string) => {
      if (isAiTaskLocked || !canEdit) return
      if (editorRef.current) {
        editorRef.current.insertMarkdown(markdown)
        const nextValue = editorRef.current.getValue()
        onChange({ milkContent: nextValue })
      } else {
        onChange({ milkContent: (blog.milkContent ?? '') + markdown })
      }
    },
  }), [isAiTaskLocked, canEdit, onChange, blog.milkContent])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <EditorShell
        title={blog.title}
        onTitleChange={(value) => onChange({ title: value })}
        titlePlaceholder={t('blog.title_placeholder')}
        onClose={onClose}
        disabled={isAiTaskLocked}
        draftSaved={draftSaved}
        lastSavedAt={lastSavedAt}
        saving={saving}
        isPublished={blog.isPublished}
        onTogglePublished={() => onChange({ isPublished: !blog.isPublished })}
        publishedLabel={t('admin.published')}
        draftLabel={t('admin.draft')}
        onSave={onSave}
        saveDisabled={saving || isAiTaskLocked || !canEdit}
        saveLabel={t('admin.save')}
        savingLabel={t('ui.saving')}
        onPreview={() => setShowPreview(true)}
        previewLabel={t('admin.preview')}
        isImmersiveMode={isImmersiveMode}
        onToggleImmersive={() => setIsImmersiveMode((prev) => !prev)}
        immersiveLabel={t('ui.immersive')}
        listPaneCollapsed={listPaneCollapsed}
        onToggleListPane={onToggleListPane}
        metaLeft={
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              disabled={isAiTaskLocked}
              value={blog.category || ''}
              onChange={(e) => onChange({ category: e.target.value })}
              placeholder={t('ui.category_filter')}
              className="w-36 rounded-md border px-2.5 py-1 text-xs outline-none transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}
            />
            <input
              type="text"
              disabled={isAiTaskLocked}
              value={blog.tags || ''}
              onChange={(e) => onChange({ tags: e.target.value })}
              placeholder="Tags"
              className="w-36 rounded-md border px-2.5 py-1 text-xs outline-none transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}
            />
          </div>
        }
        metaRight={null}
        t={t}
      >
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* 右侧分隔线由素材库面板自身边框提供（沉浸模式除外）；列表栏折叠后卡片贴住应用菜单栏，
              左侧由菜单栏 border-r 作为唯一分隔线，避免相邻边框叠加显粗 */}
          <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-border/80 bg-card/50 shadow-[0_16px_40px_-28px_rgba(0,0,0,0.25)]', isImmersiveMode && 'shadow-none')}>
            {canEdit ? <NarrativeMilkdownEditor
              contentVersion={`${editorSessionId ?? documentId}-${editorRevision ?? 0}`}
              ref={editorRef}
              value={blog.milkContent ?? ''}
              onChange={(milkContent) => onChange({ milkContent })}
              className="overflow-hidden bg-background"
              token={token}
              onBusyChange={onAiTaskLockChange}
              onError={(error) => notify(error.message, 'error')}
            /> : <EditorContentPrompt
              language={language}
              targetEditor="Milkdown"
              sourceEditor="TipTap"
              scenario={hasMilkdownContent ? 'use-existing' : blog.contentEditorTypes.includes('tiptap') ? 'convert' : 'unavailable'}
              onAction={() => onChange({
                editorType: 'milkdown',
                contentEditorTypes: [...new Set([...blog.contentEditorTypes, 'milkdown' as const])],
                milkContent: hasMilkdownContent ? blog.milkContent ?? '' : convertToMilkdown(blog),
              })}
            />}
            <div className="flex shrink-0 items-center justify-between border-t border-border px-3 py-1.5">
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground"><FileText className="h-3.5 w-3.5" />Milkdown</span>
              {draftSaved ? <span className="flex items-center gap-1 font-mono text-[10px] text-green-600 dark:text-green-400"><Check className="h-3 w-3" />{t('story.draft_saved')}</span> : <span />}
            </div>
          </div>
        </div>
      </EditorShell>

      {showPreview && (
        <BlogPreviewModal
          blog={{ title: blog.title, editorType: blog.editorType, tiptapContent: blog.tiptapContent, milkContent: blog.milkContent, category: blog.category, tags: blog.tags }}
          updatedAt={undefined}
          t={t}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  )
})
