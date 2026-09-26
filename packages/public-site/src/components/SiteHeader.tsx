'use client'

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
}

interface NavItem {
  key: string
  label: string
  href: string
}

/**
 * 站点头部（web Navbar 的共享版规格）：
 * - fixed 顶栏，滚动超过 20px 后切 bg-background/80 + backdrop-blur-xl 细分隔线；
 * - 标题 serif 大写字距 + hover 下划线展开；
 * - 导航项 12px 大写 tracking-[0.2em]，active/hover 下划线动画
 *   （CSS 实现，见 web-theme.css 的 .psw-nav-link）；
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
}: SiteHeaderProps) {
  const [scrolled, setScrolled] = useState(false)
  const [hidden, setHidden] = useState(false)
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

  const navItems: NavItem[] = [
    { key: 'gallery', label: labels.navGallery, href: links.gallery(username) },
    ...(links.albumIndex ? [{ key: 'albums', label: labels.navAlbums, href: links.albumIndex(username) }] : []),
    ...(links.articleIndex
      ? [
          { key: 'blog', label: labels.navBlog, href: links.articleIndex(username, 'blog') },
          { key: 'story', label: labels.navStory, href: links.articleIndex(username, 'story') },
        ]
      : []),
    ...(links.filmIndex ? [{ key: 'film', label: labels.navFilm, href: links.filmIndex(username) }] : []),
    ...(links.friends ? [{ key: 'friends', label: labels.navFriends, href: links.friends(username) }] : []),
    ...(links.gear ? [{ key: 'gear', label: labels.navGear, href: links.gear(username) }] : []),
  ]

  const siteTitle = settings?.siteTitle?.trim() || `@${username}`
  const isHidden = hidden && fixed

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 w-full border-b transition-all duration-500 ${
          isHidden ? '-translate-y-full' : 'translate-y-0'
        } ${
          scrolled || !fixed
            ? 'border-border/50 bg-background/80 backdrop-blur-xl'
            : 'border-transparent bg-background/95 backdrop-blur-sm'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-[1920px] items-center justify-between gap-4 px-4 md:h-20 md:px-12">
          <a href={links.home(username)} className="group relative shrink-0">
            <span className="font-serif text-xl font-bold tracking-widest text-foreground transition-colors duration-300 group-hover:text-primary md:text-2xl">
              {siteTitle}
            </span>
            <span className="absolute -bottom-1 left-0 h-px w-0 bg-primary transition-all duration-500 group-hover:w-full" />
          </a>
          <nav className="min-w-0 overflow-x-auto scrollbar-hide" aria-label="site navigation">
            <ul className="flex items-center gap-6 md:gap-8">
              {navItems.map((item) => {
                const active = currentPath ? currentPath === item.href || currentPath.startsWith(`${item.href}/`) : false
                return (
                  <li key={item.key}>
                    <a
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={`psw-nav-link whitespace-nowrap text-xs font-medium uppercase tracking-[0.2em] transition-colors duration-300 ${
                        active ? 'text-primary' : 'text-muted-foreground hover:text-primary'
                      }`}
                    >
                      {item.label}
                      <span className="psw-nav-link__bar" />
                    </a>
                  </li>
                )
              })}
            </ul>
          </nav>
        </div>
      </header>
      {/* fixed 模式的等高占位（隐藏态仍占位，与 web 页面级 padding 行为一致） */}
      {fixed ? <div aria-hidden="true" className="h-16 md:h-20" /> : null}
    </>
  )
})
