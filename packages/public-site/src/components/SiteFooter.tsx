import { memo } from 'react'

import type { SiteFriendLink, SiteSettings } from '@mo-gallery/content-core'
import type { LinkAdapter } from '../adapters'
import { DEFAULT_PUBLIC_SITE_LABELS, type PublicSiteLabels } from '../labels'

interface SiteFooterProps {
  username: string
  settings: SiteSettings | null
  links: LinkAdapter
  /** 友链（they 页与页脚共用数据；宿主经 provider.listFriendLinks 取得后传入）。 */
  friendLinks?: SiteFriendLink[]
  /** 界面文案（可选；缺省用中文默认值，友链栏标题取 labels.navFriends）。 */
  labels?: PublicSiteLabels
}

/**
 * 站点页脚（web Footer 规格）：品牌 serif 标题区 + 分栏链接区 +
 * 底部版权条（border-t 分隔）。所有区块按数据缺席自动隐藏；
 * 全部数据缺席时整体不渲染。
 */
export const SiteFooter = memo(function SiteFooter({
  username,
  settings,
  links,
  friendLinks,
  labels = DEFAULT_PUBLIC_SITE_LABELS,
}: SiteFooterProps) {
  const socialLinks = settings?.socialLinks ?? []
  const footerText = settings?.footerText?.trim() || ''
  const siteTitle = settings?.siteTitle?.trim() || `@${username}`

  if (!footerText && socialLinks.length === 0 && (!friendLinks || friendLinks.length === 0)) {
    return null
  }

  return (
    <footer className="mt-20 border-t border-border/50 bg-background">
      <div className="mx-auto max-w-screen-2xl px-4 py-10 md:px-8 lg:px-12">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-start">
          {/* 品牌区：serif 标题 + 页脚文案 */}
          <div className="space-y-3 md:max-w-md">
            <h2 className="font-serif text-3xl font-bold tracking-tight text-primary md:text-4xl">
              {siteTitle}
            </h2>
            {footerText ? (
              <p className="text-sm leading-relaxed text-muted-foreground">{footerText}</p>
            ) : null}
          </div>

          {/* 链接区：社交 + 友链（分栏，web Footer 的 heading + 列表规格） */}
          {(socialLinks.length > 0 || (friendLinks && friendLinks.length > 0)) ? (
            <div className="flex flex-wrap gap-12 md:gap-16">
              {socialLinks.length > 0 ? (
                <div>
                  <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                    Links
                  </h3>
                  <ul className="space-y-2.5">
                    {socialLinks.map((link) => (
                      <li key={`${link.title}-${link.url}`}>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors duration-300 hover:text-foreground"
                        >
                          {link.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {friendLinks && friendLinks.length > 0 ? (
                <div>
                  <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                    {labels.navFriends}
                  </h3>
                  <ul className="space-y-2.5">
                    {friendLinks.map((friend) => (
                      <li key={friend.id}>
                        <a
                          href={friend.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          title={friend.description || friend.name}
                          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors duration-300 hover:text-foreground"
                        >
                          {friend.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={friend.avatarUrl}
                              alt={friend.name}
                              className="h-4 w-4 rounded-full object-cover"
                              loading="lazy"
                            />
                          ) : null}
                          <span>{friend.name}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* 底部版权条 */}
      <div className="border-t border-border">
        <div className="mx-auto max-w-[1920px] px-4 py-6 md:px-12">
          <p className="text-center font-sans text-xs text-muted-foreground md:text-left">
            © {new Date().getFullYear()} {siteTitle} ·{' '}
            <a href={links.home(username)} className="transition-colors duration-300 hover:text-foreground">
              {links.home(username)}
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
})
