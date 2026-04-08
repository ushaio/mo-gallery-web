'use client'

import {
  BookText,
  Film,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  Settings,
  Upload as UploadIcon,
  Users,
  type LucideIcon,
} from 'lucide-react'

export interface AdminSidebarItemDefinition {
  id: string
  href: string
  labelKey: string
  icon: LucideIcon
}

export interface AdminSidebarItem extends AdminSidebarItemDefinition {
  label: string
}

const ADMIN_SIDEBAR_ITEMS: AdminSidebarItemDefinition[] = [
  { id: 'photos', href: '/admin/photos', labelKey: 'admin.library', icon: ImageIcon },
  { id: 'albums', href: '/admin/albums', labelKey: 'admin.albums', icon: FolderOpen },
  { id: 'film-rolls', href: '/admin/film-rolls', labelKey: 'admin.film_rolls', icon: Film },
  { id: 'upload', href: '/admin/upload', labelKey: 'admin.upload', icon: UploadIcon },
  { id: 'logs', href: '/admin/logs', labelKey: 'admin.logs', icon: BookText },
  { id: 'storage', href: '/admin/storage', labelKey: 'admin.storage_cleanup', icon: HardDrive },
  { id: 'settings', href: '/admin/settings', labelKey: 'admin.config', icon: Settings },
  { id: 'friends', href: '/admin/friends', labelKey: 'admin.friends', icon: Users },
]

export function getAdminSidebarItems(t: (key: string) => string): AdminSidebarItem[] {
  return ADMIN_SIDEBAR_ITEMS.map((item) => ({
    ...item,
    label: t(item.labelKey),
  }))
}

export function getActiveAdminSidebarItem(pathname: string): AdminSidebarItemDefinition {
  return (
    ADMIN_SIDEBAR_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ??
    ADMIN_SIDEBAR_ITEMS[0]
  )
}
