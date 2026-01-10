'use client'

import { useSettings } from '@/contexts/SettingsContext'
import { useLanguage } from '@/contexts/LanguageContext'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Footer() {
  const { settings, envConfig } = useSettings()
  const { t } = useLanguage()
  const pathname = usePathname()
  const siteTitle = settings?.site_title || 'MO GALLERY'
  const currentYear = new Date().getFullYear()

  // Hide footer completely on admin pages
  if (pathname?.startsWith('/admin/')) {
    return null
  }

  // Show only copyright bar on story detail pages
  const isStoryDetail = pathname?.startsWith('/story/')

  const navLinks = [
    { name: t('nav.home'), path: '/' },
    { name: t('nav.gallery'), path: '/gallery' },
    { name: t('nav.about'), path: '/about' },
    { name: t('nav.login'), path: '/login' },
  ]

  return (
    <footer className="relative bg-background text-foreground border-t border-border/50">
      {/* Main Footer Content - hidden on story detail pages */}
      {!isStoryDetail && (
      <div className="max-w-screen-2xl mx-auto px-4 md:px-8 lg:px-12 py-10">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-8">
          {/* Brand Section */}
          <div className="space-y-3 md:max-w-md">
            <h2 className="font-serif text-3xl md:text-4xl font-bold tracking-tight text-primary">
              {siteTitle}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t('footer.desc')}
            </p>
            
          </div>

          {/* Right Side: Navigation + Social */}
          <div className="flex gap-16">
            {/* Navigation Links */}
            <div>
              <h3 className="text-xs font-semibold tracking-[0.2em] mb-4 text-primary uppercase">
                {t('footer.navigation')}
              </h3>
              <nav>
                <ul className="space-y-2.5">
                  {navLinks.map((item) => (
                    <li key={item.path}>
                      <Link
                        href={item.path}
                        className="group relative inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-300"
                      >
                        <span className="absolute -left-4 w-0 h-px bg-primary transition-all duration-300 group-hover:w-3" />
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>

            {/* Social Links */}
            {envConfig.socialLinks.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold tracking-[0.2em] mb-4 text-primary uppercase">
                  {t('footer.social')}
                </h3>
                <ul className="space-y-2.5">
                  {envConfig.socialLinks.map((item) => (
                    <li key={item.title}>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-300"
                      >
                        <span className="absolute -left-4 w-0 h-px bg-primary transition-all duration-300 group-hover:w-3" />
                        {item.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Bottom Bar */}
      <div className="border-t border-border">
        <div className="max-w-[1920px] mx-auto px-4 md:px-12 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="font-sans text-xs text-muted-foreground">
              © {currentYear} {siteTitle}. All rights reserved.
            </p>
            
            <div className="flex items-center gap-6">
              <a
                href="https://github.com/ushaio/mo-gallery-web"
                target="_blank"
                rel="noopener noreferrer"
                className="font-sans text-xs text-muted-foreground hover:text-foreground transition-colors duration-300 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                GitHub
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}