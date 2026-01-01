'use client'

import { useSettings } from '@/contexts/SettingsContext'
import { useLanguage } from '@/contexts/LanguageContext'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Footer() {
  const { settings } = useSettings()
  const { t } = useLanguage()
  const pathname = usePathname()
  const siteTitle = settings?.site_title || 'MO GALLERY'
  const currentYear = new Date().getFullYear()

  // Hide footer on admin pages
  if (pathname?.startsWith('/admin/')) {
    return null
  }

  const navLinks = [
    { name: t('nav.home'), path: '/' },
    { name: t('nav.gallery'), path: '/gallery' },
    { name: t('nav.about'), path: '/about' },
    { name: t('nav.login'), path: '/login' },
  ]

  const socialLinks = [
    { name: 'Instagram', href: '#', icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
      </svg>
    )},
    { name: 'Twitter', href: '#', icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    )},
    { name: 'Behance', href: '#', icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M22 7h-7v-2h7v2zm1.726 10c-.442 1.297-2.029 3-5.101 3-3.074 0-5.564-1.729-5.564-5.675 0-3.91 2.325-5.92 5.466-5.92 3.082 0 4.964 1.782 5.375 4.426.078.506.109 1.188.095 2.14h-8.027c.13 3.211 3.483 3.312 4.588 2.029h3.168zm-7.686-4h4.965c-.105-1.547-1.136-2.219-2.477-2.219-1.466 0-2.277.768-2.488 2.219zm-9.574 6.988h-6.466v-14.967h6.953c5.476.081 5.58 5.444 2.72 6.906 3.461 1.26 3.577 8.061-3.207 8.061zm-3.466-8.988h3.584c2.508 0 2.906-3-.312-3h-3.272v3zm3.391 3h-3.391v3.016h3.341c3.055 0 2.868-3.016.05-3.016z"/>
      </svg>
    )},
  ]

  return (
    <footer className="relative bg-background text-foreground border-t border-border overflow-hidden">
      {/* Main Footer Content */}
      <div className="max-w-[1920px] mx-auto px-4 md:px-12 py-12 md:py-20">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-8">
          {/* Brand Section */}
          <div className="md:col-span-5 space-y-6">
            <div className="space-y-4">
              <h2 className="font-serif text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight text-primary">
                {siteTitle}
              </h2>
              <div className="w-16 h-0.5 bg-primary/30" />
            </div>
            <p className="font-sans text-sm md:text-base text-muted-foreground leading-relaxed max-w-md">
              {t('footer.desc')}
            </p>
            
            {/* Social Icons */}
            <div className="flex items-center gap-4 pt-2">
              {socialLinks.map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary transition-all duration-300 hover:scale-110"
                  aria-label={social.name}
                >
                  {social.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Spacer */}
          <div className="hidden md:block md:col-span-3" />

          {/* Navigation Links */}
          <div className="md:col-span-2">
            <h3 className="font-sans text-xs font-semibold tracking-[0.2em] mb-6 text-primary uppercase">
              {t('footer.navigation')}
            </h3>
            <nav>
              <ul className="space-y-4">
                {navLinks.map((item) => (
                  <li key={item.path}>
                    <Link 
                      href={item.path} 
                      className="group flex items-center gap-2 font-sans text-sm text-muted-foreground hover:text-foreground transition-colors duration-300"
                    >
                      <span className="w-0 h-px bg-primary transition-all duration-300 group-hover:w-4" />
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          {/* Contact Section */}
          <div className="md:col-span-2">
            <h3 className="font-sans text-xs font-semibold tracking-[0.2em] mb-6 text-primary uppercase">
              {t('footer.social')}
            </h3>
            <ul className="space-y-4">
              {socialLinks.map((item) => (
                <li key={item.name}>
                  <a 
                    href={item.href} 
                    className="group flex items-center gap-2 font-sans text-sm text-muted-foreground hover:text-foreground transition-colors duration-300"
                  >
                    <span className="w-0 h-px bg-primary transition-all duration-300 group-hover:w-4" />
                    {item.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

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
              <span className="text-border">|</span>
              <p className="font-sans text-xs text-muted-foreground">
                {t('footer.designed_by')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}