import { useEffect, useState } from 'react'
import { ArrowRight, BookOpen, Grid2X2, ImagePlus, Plus, Sparkles, X, Clock3, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime'

import { PageHeader } from '@/components/layout/PageHeader'
import { DESIGN_TOOLS } from '@/features/design-studio/catalog'
import { ToolPreview } from '@/features/design-studio/DesignPreview'
import { CanvasTemplateBrowser } from '@/features/design-studio/canvas/CanvasTemplateBrowser'
import { ZineTemplateBrowser } from '@/features/design-studio/zine/ZineTemplateBrowser'
import { listCanvasProjects } from '@/lib/design-canvas/project'
import type { CanvasProject } from '@/lib/design-canvas/types'
import { listZineProjects } from '@/lib/zine/project'
import type { ZineProject } from '@/lib/zine/types'
import { useDataRevision } from '@/hooks/useDataRevision'
import { fetchOfficialAiCatalog, type OfficialAiSkill } from '@/lib/official-ai'
import { t } from '@/lib/i18n'
import { usePreferences } from '@/store/preferences'

export function DesignStudioPage() {
  const navigate = useNavigate()
  const { language } = usePreferences()
  const [skills, setSkills] = useState<OfficialAiSkill[]>([])
  const [selectedSkill, setSelectedSkill] = useState<OfficialAiSkill | null>(null)
  const [skillImageExpanded, setSkillImageExpanded] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [createKind, setCreateKind] = useState<'all' | 'zine' | 'collage'>('all')
  const [zineProjects, setZineProjects] = useState<ZineProject[]>([])
  const [canvasProjects, setCanvasProjects] = useState<CanvasProject[]>([])
  const revision = useDataRevision('zine-projects') + useDataRevision('canvas-projects')

  useEffect(() => { void fetchOfficialAiCatalog().then(result => setSkills(result.skills)).catch(() => setSkills([])) }, [])
  useEffect(() => { void Promise.all([listZineProjects(), listCanvasProjects()]).then(([zines, canvases]) => { setZineProjects(zines); setCanvasProjects(canvases.filter(project => project.kind === 'collage')) }).catch(() => undefined) }, [revision])

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="设计台"
        actions={(
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex h-8 items-center gap-2 rounded-md px-3 text-xs font-medium transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            <Plus size={14} />
            {t('admin.design_new', language)}
          </button>
        )}
      />

      <main className="min-h-0 flex-1 overflow-auto">
        <section className="mx-auto max-w-6xl px-8 py-8">
          <div className="mb-5 flex justify-end"><span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{zineProjects.length + canvasProjects.length} 个文件</span></div>
          <div className="grid gap-3 md:grid-cols-3">
            {[...zineProjects.map(project => ({ ...project, kind: 'zine' as const })), ...canvasProjects.map(project => ({ ...project, kind: 'collage' as const }))].map(project => <button key={project.id} type="button" onClick={() => navigate(project.kind === 'zine' ? `/design/zine/editor/${project.id}` : `/design/canvas/editor/${project.id}`)} className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-secondary" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}><div className="flex size-10 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}>{project.kind === 'zine' ? <BookOpen size={17} /> : <Grid2X2 size={17} />}</div><span className="min-w-0"><span className="block truncate text-sm font-medium">{project.title || '未命名设计'}</span><span className="mt-1 block text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{new Date(project.updatedAt).toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN')}</span></span></button>)}
            <button type="button" onClick={() => setShowCreate(true)} className="flex min-h-[66px] items-center justify-center gap-2 rounded-lg border border-dashed text-xs font-medium" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}><Plus size={15} />新建设计</button>
          </div>
          {zineProjects.length + canvasProjects.length === 0 && <p className="mt-5 text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>还没有设计文件，从新建设计开始。</p>}
        </section>
        <section className="hidden">
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {DESIGN_TOOLS.map((tool) => {
              const Icon = tool.icon
              return (
                <button
                  key={tool.id}
                  type="button"
                  disabled={!tool.available}
                  onClick={() => tool.path && navigate(tool.path)}
                  className="group overflow-hidden rounded-xl border text-left transition-all hover:-translate-y-0.5 hover:border-foreground/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}
                >
                  <div className="h-36 overflow-hidden border-b" style={{ borderColor: 'var(--border)' }}>
                    <ToolPreview variant={tool.preview} />
                  </div>
                  <div className="flex min-h-[92px] items-start gap-3 p-4">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--muted)' }}>
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2 text-sm font-medium">
                        {t(tool.titleKey, language)}
                        {tool.available ? <ArrowRight size={14} className="opacity-45 transition-transform group-hover:translate-x-0.5" /> : (
                          <span className="text-[10px] font-normal" style={{ color: 'var(--muted-foreground)' }}>
                            {t('admin.design_coming_soon', language)}
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>
                        {t(tool.descriptionKey, language)}
                      </span>
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <section className="hidden"><div className="mx-auto max-w-6xl">
          <div className="mb-5 flex items-end justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--muted-foreground)' }}>RECENT</p><h2 className="mt-1 text-xl font-semibold">最近的作品</h2></div><Clock3 size={16} style={{ color: 'var(--muted-foreground)' }} /></div>
          <div className="grid gap-3 md:grid-cols-3"><button type="button" onClick={() => navigate('/design/zine')} className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-secondary" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}><div className="flex size-10 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}><BookOpen size={17} /></div><span><span className="block text-sm font-medium">未命名 Zine</span><span className="mt-1 block text-[11px]" style={{ color: 'var(--muted-foreground)' }}>刚刚编辑</span></span></button><button type="button" onClick={() => navigate('/design/canvas')} className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-secondary" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}><div className="flex size-10 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}><Grid2X2 size={17} /></div><span><span className="block text-sm font-medium">周末拼贴</span><span className="mt-1 block text-[11px]" style={{ color: 'var(--muted-foreground)' }}>昨天编辑</span></span></button><div className="flex items-center gap-3 rounded-lg border border-dashed p-3" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}><div className="flex size-10 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--muted)' }}><ImagePlus size={17} /></div><span className="text-xs">作品会显示在这里</span></div></div></div>
        </section>

        <section className="border-t px-8 py-7" style={{ borderColor: 'var(--border)' }}>
          <div className="mb-4 flex items-center gap-2"><Sparkles size={16} /><div><h2 className="text-sm font-semibold">AI 创作</h2><p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>官方 Skill 灵感与参考照片。</p></div></div>
          {skills.length === 0 ? <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>暂无可用 Skill，或官方站暂时不可用。</p> : <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">{skills.map(skill => <button key={skill.id} type="button" onClick={() => { setSelectedSkill(skill); setSkillImageExpanded(false) }} className="group overflow-hidden rounded-lg border text-left" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>{skill.coverImage ? <img src={skill.coverImage} alt="" className="h-28 w-full object-cover" /> : <div className="flex h-28 items-center justify-center" style={{ backgroundColor: 'var(--muted)' }}><Sparkles size={24} className="opacity-45" /></div>}<div className="p-4"><div className="flex items-center justify-between gap-2 text-sm font-medium"><span className="truncate">{skill.name}</span><ArrowRight size={14} className="opacity-45 transition-transform group-hover:translate-x-0.5" /></div><p className="mt-1 line-clamp-2 text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>{skill.description || '官方 AI 创作 Skill'}</p></div></button>)}</div>}
        </section>
      </main>
      {showCreate && <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-6" onClick={() => setShowCreate(false)}><div className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border" role="dialog" aria-modal="true" aria-labelledby="new-design-title" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)' }} onClick={event => event.stopPropagation()}><div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: 'var(--border)' }}><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--muted-foreground)' }}>NEW DESIGN</p><h2 id="new-design-title" className="mt-1 text-xl font-semibold">新建设计</h2></div><button type="button" onClick={() => setShowCreate(false)} aria-label="关闭" className="rounded-md p-1 hover:bg-secondary"><X size={18} /></button></div><div className="flex items-center gap-1 border-b px-6 py-3" style={{ borderColor: 'var(--border)' }}>{[['all', '全部模板'], ['zine', 'Zine'], ['collage', '拼图']].map(([id, label]) => <button key={id} type="button" onClick={() => setCreateKind(id as 'all' | 'zine' | 'collage')} className="rounded-md px-3 py-1.5 text-xs font-medium" style={{ backgroundColor: createKind === id ? 'var(--primary)' : 'transparent', color: createKind === id ? 'var(--primary-foreground)' : 'var(--muted-foreground)' }}>{label}</button>)}</div><div className="min-h-0 overflow-auto px-6 py-5">{(createKind === 'all' || createKind === 'zine') && <ZineTemplateBrowser query="" showEmptyState={false} />}{(createKind === 'all' || createKind === 'collage') && <div className={createKind === 'all' ? 'mt-8' : ''}><CanvasTemplateBrowser query="" showEmptyState={false} /></div>}</div></div></div>}
      {selectedSkill && (() => {
        const effectPhoto = selectedSkill.coverImage || selectedSkill.referencePhotos[0]?.thumbnailUrl || selectedSkill.referencePhotos[0]?.imageUrl || ''
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => { setSelectedSkill(null); setSkillImageExpanded(false) }}>
            <div className={skillImageExpanded ? 'flex h-[92vh] w-full max-w-6xl overflow-hidden rounded-lg border' : 'flex h-[min(86vh,900px)] w-full max-w-3xl overflow-hidden rounded-lg border'} style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }} onClick={event => event.stopPropagation()}>
              <div className={skillImageExpanded ? 'relative block w-full cursor-zoom-out sm:block' : 'relative hidden w-[44%] shrink-0 cursor-zoom-in sm:block'} style={{ backgroundColor: 'var(--muted)' }} onClick={() => setSkillImageExpanded(!skillImageExpanded)}>
                {effectPhoto
                  ? <img src={effectPhoto} alt={selectedSkill.name} className="absolute inset-0 h-full w-full object-contain" />
                  : <div className="absolute inset-0 flex items-center justify-center"><Sparkles size={32} className="opacity-45" /></div>}
                {skillImageExpanded && (
                  <button type="button" aria-label="关闭" className="absolute right-3 top-3 rounded-md bg-black/45 p-1.5 text-white transition-colors hover:bg-black/65" onClick={event => { event.stopPropagation(); setSelectedSkill(null); setSkillImageExpanded(false) }}><X size={17} /></button>
                )}
              </div>
              <div className={skillImageExpanded ? 'hidden' : 'flex min-w-0 flex-1 flex-col p-6'}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--muted-foreground)' }}>OFFICIAL SKILL</p>
                    <h2 className="mt-1 text-xl font-semibold">{selectedSkill.name}</h2>
                    {(selectedSkill.platform?.name || selectedSkill.authorName || selectedSkill.author?.username || selectedSkill.linkUrl) && (
                      <p className="mt-1 flex items-center gap-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        <span>来源：{selectedSkill.platform?.name || '官方'}{selectedSkill.authorName || selectedSkill.author?.username ? ` · ${selectedSkill.authorName || selectedSkill.author?.username}` : ''}</span>
                        {selectedSkill.linkUrl && (
                          <button type="button" aria-label="打开来源链接" className="rounded p-0.5 transition-opacity hover:opacity-80" style={{ color: 'var(--muted-foreground)' }} onClick={() => { if (selectedSkill.linkUrl) BrowserOpenURL(selectedSkill.linkUrl) }}>
                            <ExternalLink size={12} />
                          </button>
                        )}
                      </p>
                    )}
                  </div>
                  <button type="button" onClick={() => { setSelectedSkill(null); setSkillImageExpanded(false) }} aria-label="关闭" className="rounded-md p-1 hover:bg-secondary"><X size={17} /></button>
                </div>
                <div className="mt-4 min-h-0 flex-1 overflow-auto">
                  <p className="whitespace-pre-wrap text-sm leading-6" style={{ color: 'var(--muted-foreground)' }}>{selectedSkill.description || selectedSkill.instructions}</p>
                  {selectedSkill.referencePhotos.length > 0 && <div className="mt-5"><p className="mb-2 text-xs font-medium">参考照片</p><div className="flex gap-2 overflow-x-auto pb-1">{selectedSkill.referencePhotos.map(photo => <img key={photo.id} src={photo.thumbnailUrl || photo.imageUrl} alt={photo.title} className="size-16 shrink-0 rounded object-cover" />)}</div></div>}
                </div>
                <button type="button" onClick={() => navigate(`/design/ai-image?skill=${encodeURIComponent(selectedSkill.id)}`)} className="mt-5 flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}><Sparkles size={15} />生图</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
