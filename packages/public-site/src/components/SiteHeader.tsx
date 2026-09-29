'use client'

import Link from 'next/link'
import { memo, useEffect, useRef, useState } from 'react'

import type { SiteSettings } from '@mo-gallery/content-core'
import type { LinkAdapter } from '../adapters'
import type { PublicSiteLabels } from '../labels'

interface SiteHeaderProps {
  username: string
  settings: SiteSettings | null
  links: LinkAdapter
  labels: PublicSiteLabels
  /** 当前路径（用于导航高亮）；不传则不高亮。 */
  currentPath?: string
  /**
   * 固定定位（web Navbar 规格：fixed + 滚动后毛玻璃 + 下滑自动隐藏）。
   * 默认 true；组件会渲染同高占位避免内容被遮挡。宿主如需文档流内的
   * 传统头部（自行处理吸顶）可传 false。
   */
  fixed?: boolean
  /** 是否随下滚自动隐藏（fixed 模式下生效）；默认 true。 */
  autoHide?: boolean
  /**
   * 首页透明沉浸头（web Navbar 首页同款）：传入方保证仅首页为 true；
   * 未滚动时头部全透明、标题与导航反白，滚动后回落常规毛玻璃。
   */
  transparentAtTop?: boolean
  /**
   * 语言切换（web Navbar 同位置同视觉）：label 为按钮文案（如 'EN'/'中'），
   * onClick 由宿主实现（official 走 /user 子树 useLanguage 的 setLocale）。
   * 不传则不渲染。
   */
  languageToggle?: { label: string; onClick: () => void }
  /**
   * 主题切换（web Navbar 同位置同视觉）：onToggle 由宿主实现。
   * 图标显隐由 html.dark 类经 CSS 控制（见 web-theme.css），无水合不匹配。
   */
  themeToggle?: { onToggle: () => void }
  /**
   * 是否渲染「首页」导航项（默认 true）。宿主裁掉首页路由时传 false，
   * 避免导航指向已删除的页面（标题站名链接仍指向站点根）。
   */
  showHomeNav?: boolean
}

interface NavItem {
  key: string
  label: string
  href: string
  /** 二级下拉项（web Navbar 图库/胶片同款：hover 展开切换入口）。 */
  child?: { label: string; href: string }
}

/* lucide Sun/Moon（stroke: currentColor，web Navbar 主题键同款图形） */
function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  )
}

/**
 * 站点头部（web Navbar 的共享版规格）：
 * - fixed 顶栏，滚动后 bg-background/80 + backdrop-blur-xl 细分隔线；
 * - 标题 serif 大写字距 + hover 下划线展开；
 * - 导航项 12px 大写 tracking-[0.2em]，active/hover 下划线动画
 *   （CSS 实现，见 web-theme.css 的 .psw-nav-link）；
 * - 导航组合对齐 web Navbar：首页 / 画廊（hover 下拉切换胶片） / 叙事 / 他们，
 *   相册、博客、器材不进导航（页面仍可直达，web 同口径）；
 * - 右侧：分隔线 + 语言切换 + 主题切换（web Navbar 同位置同视觉）；
 * - 下滑超过 80px 自动隐藏、上滑立即恢复（translate-y + CSS transition）。
 * 导航项只渲染 LinkAdapter 上存在对应路由方法的项（能力缺席即隐藏）。
 */
export const SiteHeader = memo(function SiteHeader({
  username,
  settings,
  links,
  labels,
  currentPath,
  fixed = true,
  autoHide = true,
  transparentAtTop = false,
  languageToggle,
  themeToggle,
  showHomeNav = true,
}: SiteHeaderProps) {
  const [scrolled, setScrolled] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [galleryDropdownOpen, setGalleryDropdownOpen] = useState(false)
  const lastScrollY = useRef(0)

  useEffect(() => {
    if (!fixed) return
    const handleScroll = () => {
      const currentY = window.scrollY
      setScrolled(currentY > 20)
      if (autoHide && currentY > 80) {
        setHidden(currentY > lastScrollY.current)
      } else {
        setHidden(false)
      }
      lastScrollY.current = currentY
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [autoHide, fixed])

  // 高亮判定（web Navbar isMenuItemActive 同款）：首页（站点根路径）精确
  // 匹配——它的 href 是所有子页面的路径前缀，startsWith 会让首页恒高亮。
  const isActive = (href: string) => {
    if (!currentPath) return false
    if (href === links.home(username)) return currentPath === href
    return currentPath === href || currentPath.startsWith(`${href}/`)
  }

  // 图库组 active：画廊或胶片页（web isMenuItemActive('/gallery') 同口径）
  const filmHref = links.filmIndex?.(username)
  const galleryGroupActive = isActive(links.gallery(username)) || (filmHref ? isActive(filmHref) : false)

  // 导航组合对齐 web Navbar：首页（showHomeNav 可裁）/ 画廊（含胶片下拉） /
  // 叙事 / 关于（links.about 能力缺席即隐藏）/ 他们。
  // 主标签随当前页翻转（web 同款：胶片页主标签=胶片，下拉里是画廊）。
  const isFilmPage = filmHref ? isActive(filmHref) : false
  const navItems: NavItem[] = [
    ...(showHomeNav ? [{ key: 'home', label: labels.navHome, href: links.home(username) }] : []),
    {
      key: 'gallery',
      label: isFilmPage ? labels.navFilm : labels.navGallery,
      href: isFilmPage && filmHref ? filmHref : links.gallery(username),
      ...(links.filmIndex
        ? {
            child: {
              label: isFilmPage ? labels.navGallery : labels.navFilm,
              href: isFilmPage ? links.gallery(username) : filmHref!,
            },
          }
        : {}),
    },
    ...(links.articleIndex
      ? [{ key: 'story', label: labels.navStory, href: links.articleIndex(username, 'story') }]
      : []),
    ...(links.friends ? [{ key: 'friends', label: labels.navFriends, href: links.friends(username) }] : []),
    ...(links.about ? [{ key: 'about', label: labels.navAbout, href: links.about(username) }] : []),
  ]

  const siteTitle = settings?.siteTitle?.trim() || `@${username}`
  const isHidden = hidden && fixed
  // 首页顶部沉浸态（web Navbar isTransparent 同语义：仅首页未滚动时生效）
  const transparent = transparentAtTop && fixed && !scrolled && !isHidden
  const itemColorClass = (active: boolean) =>
    active
      ? transparent
        ? 'text-white'
        : 'text-primary'
      : transparent
        ? 'text-white hover:text-white/70'
        : 'text-foreground hover:text-primary'

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 w-full border-b transition-all duration-500 ${
          isHidden ? '-translate-y-full' : 'translate-y-0'
        } ${
          transparent
            ? 'border-transparent bg-transparent'
            : 'border-border/50 bg-background/80 backdrop-blur-xl'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-[1920px] items-center justify-between gap-4 px-4 md:h-20 md:px-12">
          <Link href={links.home(username)} className="group relative shrink-0">
            <span
              className={`font-serif text-xl font-bold uppercase tracking-widest transition-colors duration-300 md:text-3xl ${
                transparent ? 'text-white group-hover:text-white/70' : 'text-foreground group-hover:text-primary'
              }`}
            >
              {siteTitle}
            </span>
            <span
              className={`absolute -bottom-1 left-0 h-px w-0 transition-all duration-500 group-hover:w-full ${
                transparent ? 'bg-white' : 'bg-primary'
              }`}
            />
          </Link>
          {/* overflow-x 滚动仅供窄屏横滚导航；md+ 必须放回 visible——滚动容器
              会裁掉画廊项的 hover 下拉（绝对定位子元素被 overflow 裁切） */}
          <nav className="flex min-w-0 items-center gap-6 overflow-x-auto scrollbar-hide md:gap-8 md:overflow-x-visible" aria-label="site navigation">
            <ul className="flex items-center gap-6 md:gap-8">
              {navItems.map((item) => {
                const active = item.key === 'gallery' ? galleryGroupActive : isActive(item.href)
                return (
                  <li key={item.key} className={item.child ? 'relative' : undefined}>
                    {item.child ? (
                      <div
                        className="relative"
                        onMouseEnter={() => setGalleryDropdownOpen(true)}
                        onMouseLeave={() => setGalleryDropdownOpen(false)}
                      >
                        <Link
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          className={`psw-nav-link flex items-center gap-1 whitespace-nowrap text-xs font-medium uppercase tracking-[0.2em] transition-colors duration-300 ${itemColorClass(active)}`}
                        >
                          {item.label}
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`h-3 w-3 transition-transform duration-200 ${galleryDropdownOpen ? 'rotate-180' : ''}`}
                            aria-hidden="true"
                          >
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                          <span
                            className="psw-nav-link__bar"
                            style={transparent ? { background: '#ffffff' } : undefined}
                          />
                        </Link>
                        {galleryDropdownOpen ? (
                          <div className="absolute left-0 top-full z-50 pt-3">
                            <div className="min-w-[120px] border border-border/50 bg-background/95 py-1 shadow-lg backdrop-blur-xl">
                              <Link
                                href={item.child.href}
                                className="block px-4 py-2 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground transition-colors duration-200 hover:bg-muted/40 hover:text-primary"
                              >
                                {item.child.label}
                              </Link>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={`psw-nav-link whitespace-nowrap text-xs font-medium uppercase tracking-[0.2em] transition-colors duration-300 ${itemColorClass(active)}`}
                      >
                        {item.label}
                        <span
                          className="psw-nav-link__bar"
                          style={transparent ? { background: '#ffffff' } : undefined}
                        />
                      </Link>
                    )}
                  </li>
                )
              })}
              {/* 胶片直达项（仅窄屏）：窄屏导航是横向滚动、无 hover 下拉，
                  触屏没有悬停语义，胶片必须给直达入口保证可达。 */}
              {filmHref ? (
                <li className="md:hidden">
                  <Link
                    href={filmHref}
                    aria-current={isActive(filmHref) ? 'page' : undefined}
                    className={`psw-nav-link whitespace-nowrap text-xs font-medium uppercase tracking-[0.2em] transition-colors duration-300 ${itemColorClass(isActive(filmHref))}`}
                  >
                    {labels.navFilm}
                    <span
                      className="psw-nav-link__bar"
                      style={transparent ? { background: '#ffffff' } : undefined}
                    />
                  </Link>
                </li>
              ) : null}
            </ul>

            {/* 右侧工具区：分隔线 + 语言切换 + 主题切换（web Navbar 同款） */}
            {(languageToggle || themeToggle) && (
              <>
                <span className={`h-4 w-[1px] ${transparent ? 'bg-white/30' : 'bg-border'}`} aria-hidden="true" />
                {languageToggle && (
                  <button
                    type="button"
                    onClick={languageToggle.onClick}
                    className={`whitespace-nowrap text-ui-micro font-bold tracking-widest transition-colors duration-300 ${
                      transparent ? 'text-white hover:text-white/70' : 'text-foreground hover:text-primary'
                    }`}
                    aria-label={labels.toggleLanguage}
                  >
                    {languageToggle.label}
                  </button>
                )}
                {themeToggle && (
                  <button
                    type="button"
                    onClick={themeToggle.onToggle}
                    className={`transition-colors duration-300 ${
                      transparent ? 'text-white hover:text-white/70' : 'text-foreground hover:text-primary'
                    }`}
                    aria-label={labels.toggleTheme}
                  >
                    {/* 图标显隐由 html.dark 经 CSS 控制，无水合不匹配 */}
                    <span className="psw-theme-icon psw-theme-icon--sun"><SunIcon /></span>
                    <span className="psw-theme-icon psw-theme-icon--moon"><MoonIcon /></span>
                  </button>
                )}
              </>
            )}
          </nav>
        </div>
      </header>
      {/* fixed 模式的等高占位（隐藏态仍占位，与 web 页面级 padding 行为一致） */}
      {fixed ? <div aria-hidden="true" className="h-16 md:h-20" /> : null}
    </>
  )
})
