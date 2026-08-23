'use client'

import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Check, FileText } from 'lucide-react'
import type { BlogDto } from '@/lib/api/types'
import type { NarrativeTipTapEditorHandle } from '@/components/NarrativeTipTapEditor'
import NarrativeTipTapEditor from '@/components/NarrativeTipTapEditor'
import { EditorShell } from './shared/EditorShell'
import { BlogPreviewModal } from './shared/BlogPreviewModal'

export interface BlogFormData {
  id?: string
  title: string
  content: string
  contentJson?: BlogDto['contentJson']
  category: string
  tags: string
  isPublished: boolean
}

export interface BlogEditorHandle {
  insertMarkdown: (markdown: string) => void
}

interface BlogEditorViewProps {
  blog: BlogFormData
  onChange: (patch: Partial<BlogFormData>) => void
  editorRevision?: number
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
  const editorRef = useRef<NarrativeTipTapEditorHandle>(null)
  const [showPreview, setShowPreview] = useState(false)

  useImperativeHandle(ref, () => ({
    insertMarkdown: (markdown: string) => {
      if (isAiTaskLocked) return
      if (editorRef.current) {
        editorRef.current.insertMarkdown(markdown)
        const nextValue = editorRef.current.getValue()
        const nextJsonValue = editorRef.current.getJsonValue()
        onChange({ content: nextValue, contentJson: nextJsonValue })
      } else {
        onChange({ content: blog.content + markdown })
      }
    },
  }), [isAiTaskLocked, onChange, blog.content])

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
        saveDisabled={saving || isAiTaskLocked}
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
        bottomBar={
          <div className="flex w-full items-center justify-between">
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              {blog.content.length} {t('admin.characters')}
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
              {draftSaved ? (
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <Check className="h-3 w-3" />
                  {t('story.draft_saved')}
                </span>
              ) : null}
            </span>
          </div>
        }
        t={t}
      >
        <div className="relative flex min-h-0 flex-1 gap-0 overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-border/80 bg-card/50 shadow-[0_16px_40px_-28px_rgba(0,0,0,0.25)]">
            <NarrativeTipTapEditor
              contentVersion={`${documentId}-${editorRevision ?? 0}`}
              ref={editorRef}
              value={blog.content}
              jsonValue={blog.contentJson ?? null}
              onChange={(content) => onChange({ content })}
              onJsonChange={(contentJson) => onChange({ contentJson })}
              placeholder={t('ui.markdown_placeholder')}
              className="overflow-hidden bg-background"
              documentId={documentId}
              documentKind="blog"
              onAiTaskLockChange={onAiTaskLockChange}
              aiOptions={{
                enabled: Boolean(token),
                token,
                scopeId: documentId,
                title: blog.title,
              }}
            />
          </div>
        </div>
      </EditorShell>

      {showPreview && (
        <BlogPreviewModal
          blog={{ title: blog.title, content: blog.content, category: blog.category, tags: blog.tags }}
          updatedAt={undefined}
          t={t}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  )
})
