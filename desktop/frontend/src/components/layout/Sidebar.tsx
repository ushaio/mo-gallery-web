import { NavLink } from 'react-router-dom'
import {
  Image, BookOpen, Film, Upload, BookMarked,
  Bot, HardDrive, Settings, Users, LogOut
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'

const navItems = [
  { path: '/photos', icon: Image, key: 'nav.photos' },
  { path: '/albums', icon: BookOpen, key: 'nav.albums' },
  { path: '/film-rolls', icon: Film, key: 'nav.filmRolls' },
  { path: '/upload', icon: Upload, key: 'nav.upload' },
  { path: '/photo-journal', icon: BookMarked, key: 'nav.photoJournal' },
  { path: '/ai-assistant', icon: Bot, key: 'nav.aiAssistant' },
  { path: '/storage', icon: HardDrive, key: 'nav.storage' },
  { path: '/settings', icon: Settings, key: 'nav.settings' },
  { path: '/friends', icon: Users, key: 'nav.friends' },
]

export function Sidebar() {
  const { user, logout } = useAuth()
  const { language } = usePreferences()

  return (
    <aside
      className="flex flex-col h-full border-r"
      style={{
        width: 'var(--sidebar-width)',
        backgroundColor: 'var(--card)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
          style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          M
        </div>
        <span className="font-semibold text-sm">MO Gallery</span>
      </div>

      {/* 导航 */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {navItems.map(({ path, icon: Icon, key }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors mb-0.5 ${
                isActive
                  ? 'font-medium'
                  : 'hover:opacity-80'
              }`
            }
            style={({ isActive }) => ({
              backgroundColor: isActive ? 'var(--accent)' : 'transparent',
              color: isActive ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
            })}
          >
            <Icon size={18} />
            <span>{t(key, language)}</span>
          </NavLink>
        ))}
      </nav>

      {/* 用户信息 */}
      <div className="border-t px-3 py-3" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0"
              style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}>
              {user?.username?.[0]?.toUpperCase() || 'A'}
            </div>
            <span className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>
              {user?.username || 'Admin'}
            </span>
          </div>
          <button
            onClick={logout}
            className="p-1.5 rounded-md transition-colors hover:opacity-80"
            style={{ color: 'var(--muted-foreground)' }}
            title={t('auth.logout', language)}
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  )
}
