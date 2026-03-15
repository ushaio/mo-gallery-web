'use client'

import Link from 'next/link'
import { LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { AdminButton } from '@/components/admin/AdminButton'
import type { AdminSidebarItem } from '@/components/admin/admin-sidebar-config'
import { cn } from '@/lib/utils'

type ThemeMode = 'light' | 'dark' | 'system'

interface AdminSidebarProps {
  siteTitle: string
  isSiteTitleLoading: boolean
  isMobileMenuOpen: boolean
  isCollapsed: boolean
  activeItemId: string
  user: { username?: string } | null
  locale: string
  mounted: boolean
  theme: ThemeMode
  onCloseMobileMenu: () => void
  onToggleTheme: () => void
  onToggleLanguage: () => void
  onLogout: () => void
  t: (key: string) => string
  items: AdminSidebarItem[]
}

export function AdminSidebar({
  siteTitle,
  isSiteTitleLoading,
  isMobileMenuOpen,
  isCollapsed,
  activeItemId,
  user,
  locale,
  mounted,
  theme,
  onCloseMobileMenu,
  onToggleTheme,
  onToggleLanguage,
  onLogout,
  t,
  items,
}: AdminSidebarProps) {
  const languageToggleLabel = locale === 'zh' ? 'Toggle language' : 'Toggle language'

  const collapsibleTextClass = cn(
    'block min-w-0 overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-300 ease-out motion-reduce:transition-none',
    isCollapsed ? 'md:max-w-0 md:opacity-0' : 'md:max-w-[180px] md:opacity-100'
  )

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 w-64 border-r border-border bg-background transform transition-[width,transform] duration-300 ease-out motion-reduce:transition-none md:translate-x-0',
        isCollapsed ? 'md:w-20' : 'md:w-64',
        isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      <div className="flex h-full flex-col">
        <div className="h-24 border-b border-border px-6 py-6">
          <div className="flex h-full items-start gap-3">
            <div className="min-w-0 flex-1 overflow-hidden">
              <h2
                className={cn(
                  'truncate whitespace-nowrap font-serif text-2xl font-bold tracking-tight transition-opacity duration-300 motion-reduce:transition-none',
                  isSiteTitleLoading ? 'opacity-0' : 'opacity-100',
                  isCollapsed && 'md:opacity-0'
                )}
              >
                {siteTitle || '\u00A0'}
              </h2>
              <p
                className={cn(
                  'mt-1 truncate whitespace-nowrap font-sans text-[10px] uppercase tracking-widest text-muted-foreground transition-opacity duration-300 motion-reduce:transition-none',
                  isCollapsed && 'md:opacity-0'
                )}
              >
                {t('admin.console')}
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-4" aria-label={t('admin.console')}>
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              onClick={onCloseMobileMenu}
              className={cn(
                'flex w-full items-center gap-3 overflow-hidden rounded-sm px-4 py-3 text-xs font-bold uppercase tracking-widest transition-all motion-reduce:transition-none',
                activeItemId === item.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
              title={isCollapsed ? item.label : undefined}
              aria-label={item.label}
              aria-current={activeItemId === item.id ? 'page' : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className={cn('truncate', collapsibleTextClass)}>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className={cn('space-y-3 border-t border-border p-4', isCollapsed && 'md:px-3')}>
          <div className={cn('flex items-center gap-2', isCollapsed && 'md:flex-col')}>
            <AdminButton
              onClick={onToggleTheme}
              adminVariant="outline"
              size="sm"
              className={cn(
                'flex flex-1 items-center gap-2 rounded-sm px-3 py-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                isCollapsed && 'md:w-full md:justify-center md:px-0'
              )}
              title={t('nav.toggle_theme')}
              aria-label={t('nav.toggle_theme')}
            >
              {!mounted ? (
                <Monitor className="w-4 h-4" />
              ) : theme === 'system' ? (
                <Monitor className="w-4 h-4" />
              ) : theme === 'light' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
              <span className={cn('truncate text-[10px] font-bold uppercase tracking-widest', collapsibleTextClass)}>
                {theme === 'system' ? t('nav.system') : theme === 'light' ? t('nav.light') : t('nav.dark')}
              </span>
            </AdminButton>

            <AdminButton
              onClick={onToggleLanguage}
              adminVariant="outline"
              size="sm"
              className={cn(
                'flex flex-1 items-center justify-center rounded-sm px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                isCollapsed && 'md:w-full md:px-0'
              )}
              title={languageToggleLabel}
              aria-label={languageToggleLabel}
            >
              {locale === 'zh' ? 'EN' : 'ZH'}
            </AdminButton>
          </div>

          <div className="-mx-4 border-t border-border" />

          <div className={cn('flex items-center px-2', isCollapsed ? 'md:justify-center md:px-0' : 'gap-3')}>
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary text-xs font-bold text-primary-foreground">
              {user?.username?.substring(0, 1).toUpperCase() || 'A'}
            </div>
            <div className={cn('min-w-0 flex-1 overflow-hidden', collapsibleTextClass)}>
              <p className="truncate whitespace-nowrap text-xs font-bold uppercase tracking-wider">
                {user?.username || 'ADMIN'}
              </p>
              <p className="truncate whitespace-nowrap text-[10px] uppercase tracking-widest text-muted-foreground">
                {t('admin.super_user')}
              </p>
            </div>
          </div>

          <AdminButton
            onClick={onLogout}
            adminVariant="destructiveOutline"
            size="lg"
            className={cn(
              'flex w-full items-center justify-center space-x-2 rounded-sm px-4 py-2.5 text-xs font-bold uppercase tracking-widest',
              isCollapsed && 'md:px-0'
            )}
            title={isCollapsed ? t('nav.logout') : undefined}
            aria-label={t('nav.logout')}
          >
            <LogOut className="w-4 h-4" />
            <span className={cn('truncate', collapsibleTextClass)}>{t('nav.logout')}</span>
          </AdminButton>
        </div>
      </div>
    </aside>
  )
}
