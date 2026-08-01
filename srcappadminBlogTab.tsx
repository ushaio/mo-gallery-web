'use client'

import React, { useState } from 'react'
import {
  BookText,
  Plus,
  History,
  FileText,
  Edit3,
  Trash2,
  ChevronLeft,
  Save,
  ImageIcon,
  X,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { PhotoDto, resolveAssetUrl, PublicSettingsDto } from '@/lib/api'

interface PhotoLog {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
  status: 'draft' | 'published'
}

interface BlogTabProps {
  photos: PhotoDto[]
  settings: PublicSettingsDto | null
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
}

export function BlogTab({ photos, settings, t, notify }: BlogTabProps) {
  const [photoLogs, setPhotoLogs] = useState<PhotoLog[]>([
    {
      id: '1',
      title: 'Winter in Tokyo',
      content: 'Morning walk in Shibuya...',
      createdAt: '2025-12-20',
      updatedAt: '2025-12-21',
      status: 'published',
    },
    {
      id: '2',
      title: 'Draft: Mountain Peak',
      content: 'Gear used: Leica M11...',
      createdAt: '2025-12-22',
      updatedAt: '2025-12-22',
      status: 'draft',
    },
  ])
  const [currentLog, setCurrentLog] = useState<PhotoLog | null>(null)
  const [logEditMode, setLogEditMode] = useState<'list' | 'editor'>('list')
  const [logPreviewActive, setLogPreviewActive] = useState(false)
  const [isLogInsertingPhoto, setIsLogInsertingPhoto] = useState(false)

  const handleCreateLog = () => {
    setCurrentLog({
      id: crypto.randomUUID(),
      title: '',
      content: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'draft',
    })
    setLogEditMode('editor')
    setLogPreviewActive(false)
  }

  const handleEditLog = (log: PhotoLog) => {
    setCurrentLog({ ...log })
    setLogEditMode('editor')
    setLogPreviewActive(false)
  }

  const handleDeleteLog = (id: string) => {
    if (!window.confirm(t('common.confirm') + '?')) return
    setPhotoLogs((prev) => prev.filter((l) => l.id !== id))
    notify(t('admin.notify_log_deleted'))
  }

  const handleSaveLog = () => {
    if (!currentLog) return
    setPhotoLogs((prev) => {
      const idx = prev.findIndex((l) => l.id === currentLog.id)
      if (idx !== -1) {
        const next = [...prev]
        next[idx] = { ...currentLog, updatedAt: new Date().toISOString() }
        return next
      }
      return [
        ...prev,
        { ...currentLog, updatedAt: new Date().toISOString() },
      ]
    })
    setLogEditMode('list')
    setCurrentLog(null)
    notify(t('admin.notify_log_saved'))
  }

  const insertPhotoIntoLog = (photo: PhotoDto) => {
    const markdown = `\n![${photo.title}](${resolveAssetUrl(
      photo.url,
      settings?.cdn_domain
    )})\n`
    if (currentLog) {
      setCurrentLog({ ...currentLog, content: currentLog.content + markdown })
    }
    setIsLogInsertingPhoto(false)
    notify(t('admin.notify_photo_inserted'), 'info')
  }

  const resolvedCdnDomain = settings?.cdn_domain?.trim() || undefined

  return (
    <div className="h-full flex flex-col gap-6 overflow-hidden">
      {logEditMode === 'list' ? (
        <div className="space-y-8 flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border pb-4 flex-shrink-0">
            <div className="flex items-center gap-4">
              <BookText className="w-6 h-6 text-primary" />
              <h3 className="font-serif text-2xl uppercase tracking-tight">
                {t('admin.logs')}
              </h3>
            </div>
            <button
              onClick={handleCreateLog}
              className="flex items-center px-6 py-2 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('admin.new_log')}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-1 gap-4">
              {photoLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-6 border border-border hover:border-primary transition-all group"
                >
                  <div
                    className="flex-1 min-w-0"
                    onClick={() => handleEditLog(log)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="flex items-center gap-3 mb-1">
                      <h4 className="font-serif text-xl group-hover:text-primary transition-colors">
                        {log.title || t('admin.untitled')}
                      </h4>
                      <span
                        className={`text-[8px] font-black uppercase px-1.5 py-0.5 border ${
                          log.status === 'published'
                            ? 'border-primary text-primary'
                            : 'border-muted-foreground text-muted-foreground'
                        }`}
                      >
                        {log.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-mono uppercase">
                      <span className="flex items-center gap-1">
                        <History className="w-3 h-3" />{' '}
                        {new Date(log.updatedAt).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" /> {log.content.length}{' '}
                        {t('admin.characters')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEditLog(log)}
                      className="p-2 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteLog(log.id)}
                      className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {photoLogs.length === 0 && (
                <div className="py-24 text-center border border-dashed border-border">
                  <BookText className="w-12 h-12 mx-auto mb-4 opacity-10" />
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    {t('admin.no_logs')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-6 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border pb-4 flex-shrink-0">
            <button
              onClick={() => setLogEditMode('list')}
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest hover:text-primary transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> {t('admin.back_list')}
            </button>
            <div className="flex items-center gap-4">
              <div className="flex bg-muted p-1 border border-border">
                <button
                  onClick={() => setLogPreviewActive(false)}
                  className={`p-1.5 transition-all text-[10px] font-black uppercase px-3 ${
                    !logPreviewActive
                      ? 'bg-background text-primary'
                      : 'text-muted-foreground'
                  }`}
                >
                  {t('admin.edit_log')}
                </button>
                <button
                  onClick={() => setLogPreviewActive(true)}
                  className={`p-1.5 transition-all text-[10px] font-black uppercase px-3 ${
                    logPreviewActive
                      ? 'bg-background text-primary'
                      : 'text-muted-foreground'
                  }`}
                >
                  {t('admin.preview')}
                </button>
              </div>
              <button
                onClick={handleSaveLog}
                className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all"
              >
                <Save className="w-4 h-4" />
                <span>{t('admin.save')}</span>
              </button>
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-4 overflow-hidden relative">
            {logPreviewActive ? (
              <div className="flex-1 overflow-y-auto custom-scrollbar border border-border bg-background p-12 prose prose-invert max-w-none prose-gold prose-serif">
                <h1 className="font-serif text-5xl mb-12 border-b border-border pb-6">
                  {currentLog?.title || t('admin.untitled')}
                </h1>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {currentLog?.content || ''}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                <input
                  type="text"
                  value={currentLog?.title || ''}
                  onChange={(e) =>
                    setCurrentLog((prev) => ({
                      ...prev!,
                      title: e.target.value,
                    }))
                  }
                  placeholder={t('admin.log_title')}
                  className="w-full p-6 bg-transparent border border-border focus:border-primary outline-none text-2xl font-serif rounded-none"
                />
                <div className="flex-1 relative border border-border bg-card/30">
                  <textarea
                    value={currentLog?.content || ''}
                    onChange={(e) =>
                      setCurrentLog((prev) => ({
                        ...prev!,
                        content: e.target.value,
                      }))
                    }
                    placeholder={t('admin.log_content')}
                    className="w-full h-full p-8 bg-transparent outline-none resize-none font-mono text-sm leading-relaxed custom-scrollbar"
                  />
                  <button
                    onClick={() => setIsLogInsertingPhoto(true)}
                    className="absolute bottom-6 right-6 p-4 bg-background border border-border hover:border-primary text-primary transition-all shadow-2xl z-10"
                    title={t('admin.associate_photos')}
                  >
                    <ImageIcon className="w-6 h-6" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Archive Selection Modal for Logs (moved inside BlogTab) */}
      {isLogInsertingPhoto && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 md:p-12 bg-background/95 backdrop-blur-sm">
          <div className="w-full h-full max-w-6xl bg-background border border-border flex flex-col overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h3 className="font-serif text-2xl uppercase tracking-tight">
                {t('admin.insert_photo')}
              </h3>
              <button
                onClick={() => setIsLogInsertingPhoto(false)}
                className="p-2 hover:bg-muted"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    onClick={() => insertPhotoIntoLog(photo)}
                    className="group relative aspect-square bg-muted cursor-pointer overflow-hidden border border-transparent hover:border-primary transition-all"
                  >
                    <img
                      src={resolveAssetUrl(
                        photo.thumbnailUrl || photo.url,
                        resolvedCdnDomain
                      )}
                      alt=""
                      className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all"
                    />
                    <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Plus className="w-8 h-8 text-white" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
