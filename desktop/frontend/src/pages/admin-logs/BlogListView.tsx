'use client'

import { useMemo, useState } from 'react'
import { BookText, Edit3, FileText, History, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react'
import type { SelectOption } from '@/components/admin/AdminFormControls'
import { SelectDropdown } from '@/components/ui/SelectDropdown'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/ContextMenu'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminLoading } from '@/components/admin/AdminLoading'
import type { BlogDto } from '@/lib/api/types'
import { formatRelativeTimeLabel } from '@/lib/utils'

interface BlogListViewProps {
  blogs: BlogDto[]
  loading: boolean
  statusFilter: string
  onStatusFilterChange: (value: string) => void
  selectedBlogId?: string | null
  onCreateBlog: () => void
  onSelectBlog: (blog: BlogDto) => void
  onRequestDelete: (blogId: string) => void
  onRefresh: () => void
  t: (key: string) => string
}

/**
 * 博客左栏列表（master-detail）：搜索 / 状态筛选 / 新建 / 行选中高亮。
 * 搜索为内部状态，状态筛选由父级控制（与叙事列表一致）。
 */
export function BlogListView({
  blogs,
  loading,
  statusFilter,
  onStatusFilterChange,
  selectedBlogId,
  onCreateBlog,
  onSelectBlog,
  onRequestDelete,
  onRefresh,
  t,
}: BlogListViewProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const statusOptions: SelectOption[] = [
    { value: '', label: t('admin.all_status') || '全部状态' },
    { value: 'published', label: t('admin.published') || '已发布' },
    { value: 'draft', label: t('admin.draft') || '草稿' },
  ]

  const filteredBlogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return blogs.filter((blog) => {
      const matchesStatus =
        !statusFilter ||
        (statusFilter === 'published' ? blog.isPublished : !blog.isPublished)
      const matchesQuery =
        !query ||
        [blog.title, blog.content, blog.category, blog.tags].some((value) =>
          value?.toLowerCase().includes(query),
        )
      return matchesStatus && matchesQuery
    })
  }, [blogs, searchQuery, statusFilter])

  const hasActiveFilters = !!searchQuery.trim() || !!statusFilter
  const hasNoBlogs = blogs.length === 0
  const hasNoMatches = blogs.length > 0 && filteredBlogs.length === 0

  const timeGroups = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - today.getDay())
    const groups: { today: BlogDto[]; week: BlogDto[]; earlier: BlogDto[] } = { today: [], week: [], earlier: [] }
    for (const blog of filteredBlogs) {
      const date = new Date(blog.updatedAt)
      const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
      if (day >= today) groups.today.push(blog)
      else if (day >= startOfWeek) groups.week.push(blog)
      else groups.earlier.push(blog)
    }
    return groups
  }, [filteredBlogs])

  const timeSectionLabels = [
    { key: 'today' as const, label: t('story.today') },
    { key: 'week' as const, label: t('story.this_week') },
    { key: 'earlier' as const, label: t('story.earlier') },
  ]

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      {/* 工具栏：搜索 ｜ 筛选 / 刷新 / 新建 全部在搜索框右侧（单行） */}
      <div className="flex shrink-0 items-center gap-1.5 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
        <div className="relative min-w-0 flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--muted-foreground)' }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('admin.search_placeholder') || '搜索...'}
            className="w-full rounded-md border py-1.5 pl-8 pr-3 text-xs outline-none transition-colors focus:border-primary"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}
          />
        </div>
        <SelectDropdown
          value={statusFilter}
          options={statusOptions}
          onChange={(value) => onStatusFilterChange(value as string)}
          placeholder={t('admin.all_status') || '全部状态'}
          className="w-28 shrink-0"
        />
        <AdminButton
          onClick={onRefresh}
          adminVariant="outline"
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md p-0"
          title={t('common.refresh')}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </AdminButton>
        <AdminButton
          onClick={onCreateBlog}
          adminVariant="primary"
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md p-0"
          title={t('ui.create_blog')}
        >
          <Plus className="h-4 w-4" />
        </AdminButton>
      </div>

      {/* 列表 */}
      <div className="custom-scrollbar flex-1 overflow-y-auto px-3">
        {loading ? (
          <AdminLoading text={t('common.loading')} className="min-h-[240px]" />
        ) : hasNoBlogs || hasNoMatches ? (
          <div
            className="flex flex-col items-center justify-center rounded-lg border border-dashed px-4 py-16 text-center"
            style={{ borderColor: 'var(--border)', backgroundColor: 'color-mix(in srgb, var(--card) 50%, transparent)' }}
          >
            <div
              className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)' }}
            >
              {hasNoBlogs ? (
                <BookText className="h-5 w-5" style={{ color: 'var(--muted-foreground)' }} />
              ) : (
                <Search className="h-5 w-5" style={{ color: 'var(--muted-foreground)' }} />
              )}
            </div>
            {hasNoBlogs ? (
              <>
                <h3 className="mb-1 text-sm font-semibold">{t('ui.no_blog')}</h3>
                <AdminButton
                  onClick={onCreateBlog}
                  adminVariant="outline"
                  size="sm"
                  className="mt-4 flex items-center gap-1.5 rounded-md"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('ui.create_blog')}
                </AdminButton>
              </>
            ) : (
              <>
                <h3 className="mb-1 text-sm font-semibold">{t('common.search')}</h3>
                <p className="mb-4 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  {t('admin.no_albums_match_filters') || 'No blogs match the current filters'}
                </p>
                {hasActiveFilters && (
                  <AdminButton
                    onClick={() => {
                      setSearchQuery('')
                      onStatusFilterChange('')
                    }}
                    adminVariant="outline"
                    size="sm"
                    className="flex items-center gap-1.5 rounded-md"
                  >
                    <X className="h-3.5 w-3.5" />
                    {t('admin.clear_filters')}
                  </AdminButton>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2 pb-2">
            {timeSectionLabels.map(({ key, label }) => {
              const items = timeGroups[key]
              if (items.length === 0) return null
              return (
                <div key={key}>
                  <div className="mb-2 flex items-center gap-2 px-1 pt-1">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">{label}</span>
                    <div className="h-px flex-1 bg-border/40" />
                  </div>
                  {items.map((blog) => {
              const isSelected = selectedBlogId === blog.id
              return (
                <ContextMenu key={blog.id}>
                  <ContextMenuTrigger asChild>
                    <div
                      className="group relative flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors"
                      style={{
                        borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                        backgroundColor: isSelected
                          ? 'color-mix(in srgb, var(--primary) 7%, transparent)'
                          : 'var(--card)',
                        boxShadow: isSelected ? '0 0 0 1px var(--primary)' : undefined,
                      }}
                    >
                      {/* 状态徽标：固定右上角 */}
                      <span
                        className="absolute right-2 top-2 z-10 shrink-0 rounded px-1.5 py-0.5 text-[10px]"
                        style={
                          blog.isPublished
                            ? { backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }
                            : { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }
                        }
                      >
                        {blog.isPublished ? t('admin.published') : t('admin.draft')}
                      </span>
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                        style={{ backgroundColor: 'color-mix(in srgb, var(--muted) 60%, transparent)' }}
                      >
                        <BookText className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
                      </div>
                      <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onSelectBlog(blog)}>
                        <div className="mb-1 flex items-center gap-2">
                          <h4 className="truncate pr-12 font-serif text-sm transition-colors group-hover:text-primary">
                            {blog.title || t('admin.untitled')}
                          </h4>
                        </div>
                        <div
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wide"
                          style={{ color: 'var(--muted-foreground)' }}
                        >
                          <span className="flex items-center gap-1.5">
                            <History className="h-3 w-3" />
                            {formatRelativeTimeLabel(new Date(blog.updatedAt).getTime(), t, 'datetime')}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <FileText className="h-3 w-3" />
                            {blog.content.length} {t('admin.characters')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuLabel className="max-w-56 truncate">
                      {blog.title || t('admin.untitled')}
                    </ContextMenuLabel>
                    <ContextMenuSeparator />
                    <ContextMenuItem onSelect={() => onSelectBlog(blog)}>
                      <Edit3 className="size-3.5" />
                      {t('common.edit')}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem variant="destructive" onSelect={() => onRequestDelete(blog.id)}>
                      <Trash2 className="size-3.5" />
                      {t('common.delete')}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              )
            })}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
