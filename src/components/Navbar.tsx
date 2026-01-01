'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { LogOut, Sun, Moon, Monitor, Menu, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useSettings } from '@/contexts/SettingsContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export default function Navbar() {
  const { isAuthenticated, logout, user } = useAuth()
  const { theme, setTheme, mounted } = useTheme()
  const { settings, isLoading: settingsLoading } = useSettings()
  const { t, locale, setLocale } = useLanguage()
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const prevPathnameRef = useRef(pathname)

  // Only show title after settings are loaded to prevent flash
  const siteTitle = settings?.site_title || ''
  const isHome = pathname === '/'

  // Close mobile menu on route change
  useEffect(() => {
    // Only close menu if pathname actually changed (not on initial render)
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname
      // Use queueMicrotask to avoid synchronous setState warning
      queueMicrotask(() => {
        setMobileMenuOpen(false)
      })
    }
  }, [pathname])

  // Handle scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileMenuOpen])

  // Hide navbar on admin pages
  if (pathname?.startsWith('/admin/')) {
    return null
  }

  // Check if a menu item is active
  const isMenuItemActive = (itemPath: string) => {
    if (itemPath === '/') {
      return pathname === '/'
    }
    return pathname.startsWith(itemPath)
  }

  const handleLogout = () => {
    logout()
    // 无感退出：不跳转页面，只清除登录状态，UI 会自动更新为未登录状态
  }

  const toggleTheme = () => {
    if (theme === 'system') setTheme('light')
    else if (theme === 'light') setTheme('dark')
    else setTheme('system')
  }

  const toggleLanguage = () => {
    setLocale(locale === 'zh' ? 'en' : 'zh')
  }

  // Generate login URL with return path
  const getLoginUrl = () => {
    // Don't include return URL if already on login page or home page
    if (pathname === '/login' || pathname === '/') {
      return '/login'
    }
    return `/login?returnUrl=${encodeURIComponent(pathname)}`
  }

  // Determine navbar styles based on state
  const isTransparent = isHome && !scrolled && !mobileMenuOpen
  const textColorClass = isTransparent ? 'text-white' : 'text-foreground'
  const hoverColorClass = isTransparent ? 'hover:text-white/70' : 'hover:text-primary'

  // Prevent hydration mismatch
  const themeIcon = !mounted ? (
    <Monitor className="w-4 h-4" />
  ) : theme === 'system' ? (
    <motion.div
      key="system"
      initial={{ opacity: 0, rotate: -90 }}
      animate={{ opacity: 1, rotate: 0 }}
      exit={{ opacity: 0, rotate: 90 }}
      transition={{ duration: 0.2 }}
    >
      <Monitor className="w-4 h-4" />
    </motion.div>
  ) : theme === 'light' ? (
    <motion.div
      key="light"
      initial={{ opacity: 0, rotate: -90 }}
      animate={{ opacity: 1, rotate: 0 }}
      exit={{ opacity: 0, rotate: 90 }}
      transition={{ duration: 0.2 }}
    >
      <Sun className="w-4 h-4" />
    </motion.div>
  ) : (
    <motion.div
      key="dark"
      initial={{ opacity: 0, rotate: -90 }}
      animate={{ opacity: 1, rotate: 0 }}
      exit={{ opacity: 0, rotate: 90 }}
      transition={{ duration: 0.2 }}
    >
      <Moon className="w-4 h-4" />
    </motion.div>
  )

  return (
    <>
      <nav
        className={cn(
          "fixed top-0 w-full z-50 transition-all duration-500",
          isTransparent 
            ? "bg-transparent border-transparent py-4" 
            : "bg-background/80 backdrop-blur-xl border-b border-border/50 py-0"
        )}
      >
        <div className="max-w-[1920px] mx-auto px-4 md:px-12">
          <div className="flex justify-between items-center h-16 md:h-20">
            {/* Logo Section */}
            <Link href="/" className="group relative">
              <span className={cn(
                "font-serif text-xl md:text-3xl font-bold tracking-widest transition-all duration-500",
                textColorClass,
                !isTransparent && "group-hover:text-primary",
                settingsLoading && "opacity-0"
              )}>
                {siteTitle ? siteTitle.toUpperCase() : '\u00A0'}
              </span>
              <span className={cn(
                "absolute -bottom-1 left-0 w-0 h-[1px] transition-all duration-500 group-hover:w-full",
                isTransparent ? "bg-white" : "bg-primary"
              )}></span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-12">
              <div className="flex space-x-8">
                {[
                  { name: t('nav.home'), path: '/' },
                  { name: t('nav.gallery'), path: '/gallery' },
                  { name: t('nav.story'), path: '/story' },
                  { name: t('nav.they'), path: '/they' },
                  { name: t('nav.about'), path: '/about' },
                ].map((item) => {
                  const isActive = isMenuItemActive(item.path)
                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      className={cn(
                        "font-sans text-xs font-medium tracking-[0.2em] transition-colors duration-300 uppercase relative group",
                        isActive 
                          ? (isTransparent ? "text-white" : "text-primary")
                          : textColorClass,
                        !isActive && hoverColorClass
                      )}
                    >
                      {item.name}
                      {/* Underline indicator */}
                      <motion.span 
                        className={cn(
                          "absolute -bottom-1 left-0 h-[1px]",
                          isTransparent ? "bg-white" : "bg-primary"
                        )}
                        initial={false}
                        animate={{ 
                          width: isActive ? '100%' : '0%',
                          opacity: isActive ? 1 : 0
                        }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                      />
                      {/* Hover underline (only when not active) */}
                      {!isActive && (
                        <span className={cn(
                          "absolute -bottom-1 left-0 w-0 h-[1px] transition-all duration-300 group-hover:w-full",
                          isTransparent ? "bg-white" : "bg-primary"
                        )} />
                      )}
                    </Link>
                  )
                })}
              </div>

              <div className={cn("h-4 w-[1px]", isTransparent ? "bg-white/30" : "bg-border")}></div>

              <div className={cn("flex items-center space-x-6", textColorClass)}>
                <button
                  onClick={toggleLanguage}
                  className={cn("font-sans text-[10px] font-bold tracking-widest flex items-center gap-1 transition-colors duration-300", hoverColorClass)}
                  aria-label="Toggle Language"
                >
                  {locale === 'zh' ? 'EN' : '中'}
                </button>

                <button
                  onClick={toggleTheme}
                  className={cn("transition-colors duration-300", hoverColorClass)}
                  aria-label="Toggle Theme"
                >
                  <AnimatePresence mode="wait">
                    {themeIcon}
                  </AnimatePresence>
                </button>

                {isAuthenticated && user?.isAdmin && (
                  <Link
                    href="/admin"
                    className={cn("font-sans text-xs font-medium tracking-[0.2em] uppercase transition-colors duration-300", hoverColorClass)}
                  >
                    {t('nav.admin')}
                  </Link>
                )}

                {isAuthenticated ? (
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={handleLogout}
                      className={cn("flex items-center space-x-2 font-sans text-xs font-medium tracking-[0.2em] uppercase transition-colors duration-300", isTransparent ? "hover:text-white/70" : "hover:text-destructive")}
                    >
                      <span>{t('nav.logout')}</span>
                      <LogOut className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <Link
                    href={getLoginUrl()}
                    className={cn("font-sans text-xs font-medium tracking-[0.2em] uppercase transition-colors duration-300", hoverColorClass)}
                  >
                    {t('nav.login')}
                  </Link>
                )}
              </div>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={cn("md:hidden p-2 transition-colors", textColorClass, hoverColorClass)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu - Outside nav element */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden fixed inset-0 top-0 z-40 bg-background border-t border-border overflow-y-auto pt-20"
          >
             {/* Close button inside mainly for safety if overlap issues occur */}
             
            <div className="px-6 py-8 flex flex-col">
              {/* Navigation Links */}
              <nav className="flex flex-col space-y-1">
                {[
                  { name: t('nav.home'), path: '/' },
                  { name: t('nav.gallery'), path: '/gallery' },
                  { name: t('nav.story'), path: '/story' },
                  { name: t('nav.they'), path: '/they' },
                  { name: t('nav.about'), path: '/about' },
                ].map((item, index) => {
                  const isActive = isMenuItemActive(item.path)
                  return (
                    <motion.div
                      key={item.path}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Link
                        href={item.path}
                        className={cn(
                          "block py-4 font-serif text-3xl tracking-tight transition-colors relative",
                          isActive 
                            ? 'text-primary' 
                            : 'text-foreground hover:text-primary'
                        )}
                      >
                        <span className="relative">
                          {item.name}
                          {/* Active indicator for mobile */}
                          {isActive && (
                            <motion.span
                              className="absolute -bottom-1 left-0 h-[2px] bg-primary"
                              initial={{ width: 0 }}
                              animate={{ width: '100%' }}
                              transition={{ duration: 0.3, ease: 'easeOut' }}
                            />
                          )}
                        </span>
                      </Link>
                    </motion.div>
                  )
                })}
              </nav>

              {/* Divider */}
              <div className="my-8 h-[1px] bg-border" />

              {/* Actions */}
              <div className="flex flex-col space-y-6">
                {/* Theme & Language Row */}
                <div className="flex items-center gap-6">
                  <button
                    onClick={toggleTheme}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <AnimatePresence mode="wait">
                      {themeIcon}
                    </AnimatePresence>
                    <span className="font-sans text-xs uppercase tracking-widest">
                      {theme === 'system' ? t('nav.system') : theme === 'light' ? t('nav.light') : t('nav.dark')}
                    </span>
                  </button>
                  <div className="h-4 w-[1px] bg-border" />
                  <button
                    onClick={toggleLanguage}
                    className="font-sans text-xs font-bold tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {locale === 'zh' ? 'English' : '中文'}
                  </button>
                </div>

                {/* Auth Actions */}
                {isAuthenticated ? (
                  <div className="flex flex-col space-y-4">
                    {user?.isAdmin && (
                      <Link
                        href="/admin"
                        className="font-sans text-sm font-medium tracking-[0.2em] text-primary hover:text-primary/80 transition-colors uppercase"
                      >
                        {t('nav.admin')}
                      </Link>
                    )}
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-2 font-sans text-sm font-medium tracking-[0.2em] text-muted-foreground hover:text-destructive transition-colors uppercase"
                    >
                      <LogOut className="w-4 h-4" />
                      {t('nav.logout')}
                    </button>
                  </div>
                ) : (
                  <Link
                    href={getLoginUrl()}
                    className="inline-flex items-center justify-center py-3 px-6 border border-primary text-primary font-sans text-xs font-bold tracking-[0.2em] uppercase hover:bg-primary hover:text-primary-foreground transition-all"
                  >
                    {t('nav.login')}
                  </Link>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
