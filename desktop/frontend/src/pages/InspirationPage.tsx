import { useEffect, useMemo, useState } from 'react'
import {
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Camera,
  ChevronRight,
  CircleDot,
  Film,
  LayoutTemplate,
  Palette,
  Shuffle,
  Sparkles,
  Upload,
  WandSparkles,
} from 'lucide-react'

import { PageHeader } from '@/components/layout/PageHeader'
import { useAuth } from '@/contexts/AuthContext'
import { t, type Locale } from '@/lib/i18n'
import { usePreferences } from '@/store/preferences'
import { ListInspirationSubscriptions, RefreshInspirationFeeds, SubscribeInspirationFeed, UnsubscribeInspirationFeed } from '../../wailsjs/go/main/App'

interface FeedSubscription { id: string; url: string; title: string; siteUrl?: string; description?: string; lastFetched?: string; lastError?: string }
interface FeedItem { id: string; feedId: string; feedTitle: string; title: string; url: string; summary?: string; author?: string; publishedAt?: string; imageUrl?: string; sourceSiteUrl?: string }

type InspirationKind = 'all' | 'make' | 'edit' | 'sequence' | 'atmosphere'

interface InspirationItem {
  id: string
  kind: Exclude<InspirationKind, 'all'>
  eyebrow: string
  title: string
  description: string
  image?: string
  color: string
  icon: typeof Camera
  stat: string
}

const ITEMS: InspirationItem[] = [
  { id: 'one-roll-one-rule', kind: 'make', eyebrow: 'FIELD NOTE 01', title: 'One roll, one rule', description: '给一卷胶卷设定一个限制：只拍倒影、只拍蓝色，或只在同一条街完成。', image: '/film/general-120.png', color: '#D6A84D', icon: Film, stat: '12 min experiment' },
  { id: 'quiet-corners', kind: 'atmosphere', eyebrow: 'MOOD / QUIET', title: 'Quiet corners', description: '把注意力放在画面里没有发生的部分：留白、背影、还没被说完的动作。', image: '/film/koda-5207-135.png', color: '#88A89A', icon: CircleDot, stat: '6 framing prompts' },
  { id: 'sequence-by-temperature', kind: 'sequence', eyebrow: 'SEQUENCE / 03', title: 'Sequence by temperature', description: '不按时间排序。把一组照片按冷暖、密度和距离重新排成一条情绪曲线。', color: '#B8A5CE', icon: LayoutTemplate, stat: '8 spread moves' },
  { id: 'borrow-a-palette', kind: 'edit', eyebrow: 'COLOUR STUDY', title: 'Borrow a palette', description: '从一张旧电影海报或街边招牌里取三种颜色，再让整组照片围绕它呼吸。', image: '/film/koda-gold200.png', color: '#C97B62', icon: Palette, stat: '3 colour anchors' },
  { id: 'the-last-frame', kind: 'make', eyebrow: 'FIELD NOTE 05', title: 'Keep the last frame', description: '保留每次拍摄结束前的最后一张。它通常不完美，但最接近当天的真实节奏。', image: '/film/leka-c200.png', color: '#A5BDD0', icon: Camera, stat: '1 habit to keep' },
  { id: 'paper-before-pixels', kind: 'sequence', eyebrow: 'ZINE / MATERIAL', title: 'Paper before pixels', description: '先在纸上剪贴缩略图，再回到编辑器。手的速度会替你发现新的顺序。', color: '#D78B79', icon: WandSparkles, stat: '4 tactile steps' },
]

const PROMPTS = ['拍一张“差一点发生”的照片。', '把今天看到的红色，限制在画面的一角。', '用三张照片讲完一件没有名字的小事。', '从同一个位置，等待光线替你完成构图。', '把最不满意的一张放在整组的开头。']
const FILTERS: Array<{ id: InspirationKind; zh: string; en: string }> = [
  { id: 'all', zh: '全部', en: 'All' }, { id: 'make', zh: '去拍', en: 'Make' }, { id: 'edit', zh: '去调', en: 'Edit' }, { id: 'sequence', zh: '去排', en: 'Sequence' }, { id: 'atmosphere', zh: '去感受', en: 'Atmosphere' },
]

function localCopy(language: Locale) {
  const zh = language === 'zh'
  return {
    kicker: 'STUDIO / OPEN NOTES',
    title: zh ? `下一次创作，\n从一个小念头开始。` : `Let the next piece\nstart with a small idea.`,
    subtitle: zh ? '灵感不是收藏夹里的终点。这里有一些可以立刻带走、带去街上、带回编辑桌的创作起点。' : 'Inspiration is not a shelf of finished things. Take one of these starting points to the street, then back to your desk.',
    signal: zh ? '今日信号' : 'Signal of the day', signalTitle: zh ? '让限制替你打开一扇门。' : 'Let a constraint open the door.', signalBody: zh ? '今天只拍“边缘”：画面的边缘、故事的边缘、视线错开的边缘。' : 'Photograph the edges today: the edge of a frame, a story, a glance that does not quite meet.', signalMeta: zh ? '01 / 05  ·  适合散步时尝试' : '01 / 05  ·  Try this on a walk',
    browse: zh ? '浏览灵感' : 'Browse ideas', saved: zh ? '已保存' : 'Saved', save: zh ? '保存' : 'Save', deckTitle: 'Prompt deck', deckIntro: zh ? '不知道从哪里开始？抽一张，把它当成今天的拍摄约定。' : 'Not sure where to begin? Draw one and make it today’s shooting agreement.', draw: zh ? '再抽一张' : 'Draw again', deckLabel: zh ? '一张小小的约定' : 'A small agreement', closing: zh ? '把灵感带回你的图库。' : 'Bring the idea back to your library.', closingBody: zh ? '从一张照片、一段文字或一个版式开始，慢慢长成属于你的作品。' : 'Start with one photograph, a sentence, or a layout. Let it grow into something that is yours.', openZine: zh ? '打开 Zine 工作台' : 'Open Zine studio', share: zh ? '分享作品' : 'Share work', comingSoon: zh ? '分享功能即将开放' : 'Sharing is coming soon', count: zh ? '个灵感' : 'ideas',
  }
}

function InspirationCard({ item, language, saved, onToggle }: { item: InspirationItem; language: Locale; saved: boolean; onToggle: () => void }) {
  const isZh = language === 'zh'; const Icon = item.icon
  return <article className="group relative flex min-h-[17.5rem] flex-col overflow-hidden rounded-[1.35rem] border bg-card transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_22px_50px_-32px_rgb(0_0_0/0.75)]" style={{ borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)' }}>
    <div className="relative h-36 overflow-hidden" style={{ backgroundColor: item.color }}>
      {item.image ? <img src={item.image} alt="" className="h-full w-full object-cover mix-blend-multiply opacity-85 transition-transform duration-700 group-hover:scale-105" /> : <div className="absolute inset-0 opacity-70" style={{ backgroundImage: `linear-gradient(135deg, transparent 0 42%, rgb(255 255 255 / 0.28) 42% 44%, transparent 44% 100%), repeating-linear-gradient(90deg, transparent 0 22px, rgb(255 255 255 / 0.18) 22px 23px)` }} />}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-black/65"><span>{item.eyebrow}</span><Icon size={15} strokeWidth={1.7} /></div>
      <button type="button" onClick={onToggle} className="absolute bottom-3 right-3 flex size-8 items-center justify-center rounded-full border border-black/15 bg-white/70 text-black/75 backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/50" aria-label={saved ? (isZh ? '取消保存' : 'Remove from saved') : (isZh ? '保存灵感' : 'Save idea')}>{saved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}</button>
    </div>
    <div className="flex flex-1 flex-col p-4"><h3 className="font-serif text-[1.35rem] leading-[1.05] tracking-tight">{item.title}</h3><p className="mt-2 line-clamp-3 text-[11px] leading-[1.65]" style={{ color: 'var(--muted-foreground)' }}>{item.description}</p><div className="mt-auto flex items-center justify-between pt-4 text-[10px] uppercase tracking-[0.12em]" style={{ color: 'var(--muted-foreground)' }}><span>{item.stat}</span><ArrowUpRight size={13} className="opacity-0 transition-opacity group-hover:opacity-100" /></div></div>
  </article>
}

export function InspirationPage() {
  const { language } = usePreferences(); const { isAuthenticated } = useAuth(); const copy = localCopy(language)
  const [filter, setFilter] = useState<InspirationKind>('all'); const [saved, setSaved] = useState<Set<string>>(new Set()); const [promptIndex, setPromptIndex] = useState(0)
  const [subscriptions, setSubscriptions] = useState<FeedSubscription[]>([])
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [feedURL, setFeedURL] = useState('')
  const [feedBusy, setFeedBusy] = useState(false)
  const [feedError, setFeedError] = useState('')
  const visibleItems = useMemo(() => filter === 'all' ? ITEMS : ITEMS.filter((item) => item.kind === filter), [filter]); const currentPrompt = PROMPTS[promptIndex]
  const toggleSaved = (id: string) => setSaved((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const drawPrompt = () => setPromptIndex((current) => (current + 1) % PROMPTS.length)
  const loadFeeds = async () => {
    setFeedBusy(true); setFeedError('')
    try {
      const nextSubscriptions = await ListInspirationSubscriptions()
      const nextItems = await RefreshInspirationFeeds()
      setSubscriptions((nextSubscriptions ?? []) as FeedSubscription[])
      setFeedItems((nextItems ?? []) as FeedItem[])
    }
    catch (error) { setFeedError(error instanceof Error ? error.message : String(error)) }
    finally { setFeedBusy(false) }
  }
  const subscribe = async () => {
    if (!feedURL.trim()) return
    setFeedBusy(true); setFeedError('')
    try { await SubscribeInspirationFeed(feedURL.trim()); setFeedURL(''); await loadFeeds() }
    catch (error) { setFeedError(error instanceof Error ? error.message : String(error)); setFeedBusy(false) }
  }
  const removeFeed = async (id: string) => { setFeedBusy(true); try { await UnsubscribeInspirationFeed(id); await loadFeeds() } catch (error) { setFeedError(error instanceof Error ? error.message : String(error)); setFeedBusy(false) } }
  useEffect(() => { void loadFeeds() }, [])

  return <div className="flex h-full flex-col" style={{ backgroundColor: 'color-mix(in srgb, var(--background) 96%, var(--secondary))' }}>
    <PageHeader title={t('admin.inspiration', language)} actions={<button type="button" disabled title={copy.comingSoon} className="flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-medium opacity-55" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}><Upload size={14} />{copy.share}</button>} />
    <main className="flex-1 overflow-auto px-5 py-6 sm:px-8 lg:px-10"><div className="mx-auto max-w-[86rem]">
      <section className="relative grid overflow-hidden rounded-[1.75rem] border bg-[#151512] text-[#F4F0E8] shadow-[0_30px_80px_-45px_rgb(0_0_0/0.9)] lg:grid-cols-[1.15fr_0.85fr]" style={{ borderColor: 'color-mix(in srgb, var(--foreground) 20%, transparent)' }}>
        <div className="relative px-6 pb-10 pt-8 sm:px-10 sm:pb-12 sm:pt-10"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#D6A84D]"><Sparkles size={13} />{copy.kicker}</div><h1 className="mt-7 max-w-2xl whitespace-pre-line font-serif text-[clamp(2.75rem,6vw,5.8rem)] font-medium leading-[0.89] tracking-[-0.045em]">{copy.title}</h1><p className="mt-7 max-w-lg text-[13px] leading-6 text-white/60">{copy.subtitle}</p><a href="#ideas" className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#F4F0E8] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#151512] transition hover:bg-[#D6A84D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D6A84D]">{copy.browse}<ChevronRight size={14} /></a></div>
        <div className="relative min-h-[20rem] overflow-hidden border-t border-white/10 bg-[#D6A84D] p-5 text-[#151512] lg:border-l lg:border-t-0"><div className="absolute -right-16 -top-16 size-56 rounded-full border-[28px] border-[#151512]/10" /><div className="relative flex h-full flex-col justify-between"><div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em]"><span>{copy.signal}</span><span>30.08.26</span></div><div className="max-w-xs self-end pb-3 lg:max-w-sm"><div className="mb-5 h-px w-14 bg-[#151512]/50" /><h2 className="font-serif text-[2.55rem] leading-[0.9] tracking-[-0.035em]">{copy.signalTitle}</h2><p className="mt-4 text-xs leading-5 text-[#151512]/70">{copy.signalBody}</p><p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#151512]/55">{copy.signalMeta}</p></div></div></div>
      </section>
      <section id="ideas" className="mt-12 scroll-mt-6"><div className="flex flex-col gap-5 border-b pb-4 sm:flex-row sm:items-end sm:justify-between" style={{ borderColor: 'var(--border)' }}><div><div className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--muted-foreground)' }}>INDEX / 06</div><h2 className="mt-2 font-serif text-3xl tracking-tight">{isAuthenticated ? (language === 'zh' ? '给今天的自己，一点偏见。' : 'A bias for making today.') : (language === 'zh' ? '拿一个念头，去做点什么。' : 'Take an idea. Make something.')}</h2></div><div className="flex flex-wrap gap-1.5">{FILTERS.map((item) => <button key={item.id} type="button" onClick={() => setFilter(item.id)} className="rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ borderColor: filter === item.id ? 'var(--foreground)' : 'var(--border)', backgroundColor: filter === item.id ? 'var(--foreground)' : 'transparent', color: filter === item.id ? 'var(--background)' : 'var(--muted-foreground)' }}>{language === 'zh' ? item.zh : item.en}</button>)}</div></div><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visibleItems.map((item) => <InspirationCard key={item.id} item={item} language={language} saved={saved.has(item.id)} onToggle={() => toggleSaved(item.id)} />)}</div><div className="mt-4 text-right text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>{visibleItems.length} {copy.count}{saved.size > 0 ? ` · ${saved.size} ${copy.saved}` : ''}</div></section>
      <section className="mt-14 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]"><div className="rounded-[1.5rem] border bg-card p-6 sm:p-8" style={{ borderColor: 'var(--border)' }}><div className="flex items-center justify-between"><div><div className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--muted-foreground)' }}>PROMPT DECK</div><h2 className="mt-2 font-serif text-3xl tracking-tight">{copy.deckTitle}</h2></div><button type="button" onClick={drawPrompt} className="flex size-10 items-center justify-center rounded-full border transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ borderColor: 'var(--border)' }} aria-label={copy.draw}><Shuffle size={16} /></button></div><p className="mt-3 max-w-md text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>{copy.deckIntro}</p><div className="mt-7 rounded-xl border-l-4 px-5 py-5" style={{ borderColor: '#D6A84D', backgroundColor: 'color-mix(in srgb, #D6A84D 14%, var(--card))' }}><div className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--muted-foreground)' }}>{copy.deckLabel}</div><p className="mt-3 font-serif text-[1.75rem] leading-tight tracking-tight">{currentPrompt}</p></div><button type="button" onClick={drawPrompt} className="mt-5 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-opacity hover:opacity-65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{copy.draw}<ArrowUpRight size={14} /></button></div><div className="relative overflow-hidden rounded-[1.5rem] bg-[#88A89A] p-6 text-[#151512] sm:p-8"><div className="absolute -bottom-16 -right-12 size-48 rounded-full border-[24px] border-[#151512]/10" /><div className="relative flex h-full min-h-[15rem] flex-col justify-between"><div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.2em]"><span>RETURN / 07</span><WandSparkles size={15} /></div><div><h2 className="max-w-sm font-serif text-[2.75rem] leading-[0.9] tracking-[-0.035em]">{copy.closing}</h2><p className="mt-4 max-w-sm text-xs leading-5 text-[#151512]/65">{copy.closingBody}</p><a href="/zine" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#151512] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#F4F0E8] transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#151512]">{copy.openZine}<ArrowUpRight size={14} /></a></div></div></div></section>
      <section className="mt-14 rounded-[1.5rem] border bg-card p-6 sm:p-8" style={{ borderColor: 'var(--border)' }}><div className="flex items-center justify-between"><div><div className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--muted-foreground)' }}>READ / RSS + ATOM</div><h2 className="mt-2 font-serif text-3xl tracking-tight">{language === 'zh' ? '把别人的更新，带进灵感流。' : 'Bring other voices into your inspiration stream.'}</h2><p className="mt-2 max-w-2xl text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>{language === 'zh' ? '输入网站主页或 RSS / Atom 地址。MO Gallery 会自动发现使用该 Web 端的内容源，也支持其他博客。' : 'Paste a site homepage or RSS / Atom URL. MO Gallery discovers feeds from MO Gallery sites and other blogs.'}</p></div><button type="button" onClick={() => void loadFeeds()} disabled={feedBusy} className="rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] disabled:opacity-50" style={{ borderColor: 'var(--border)' }}>{feedBusy ? 'Syncing…' : 'Refresh'}</button></div><div className="mt-5 flex gap-2"><input value={feedURL} onChange={(event) => setFeedURL(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void subscribe() }} placeholder="https://example.com or /feed.xml" className="h-10 min-w-0 flex-1 rounded-lg border bg-transparent px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ borderColor: 'var(--border)' }} /><button type="button" onClick={() => void subscribe()} disabled={feedBusy || !feedURL.trim()} className="h-10 rounded-lg bg-foreground px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-background disabled:opacity-50">Subscribe</button></div>{feedError && <p className="mt-3 text-xs" style={{ color: 'var(--destructive)' }}>{feedError}</p>}{subscriptions.length > 0 && <div className="mt-5 space-y-1">{feedItems.slice(0, 8).map((item) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-secondary"><ArrowUpRight size={13} /><span className="truncate text-xs">{item.title}</span><span className="ml-auto truncate text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{item.feedTitle}</span></a>)}</div>}</section>
    </div></main>
  </div>
}
