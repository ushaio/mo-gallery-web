'use client'

import React, { useState, useEffect } from 'react'
import {
  Users,
  Plus,
  Edit3,
  Trash2,
  Star,
  StarOff,
  ExternalLink,
  GripVertical,
  Loader2,
  X,
  Save,
  Eye,
  EyeOff,
} from 'lucide-react'
import {
  FriendLinkDto,
  getAdminFriendLinks,
  createFriendLink,
  updateFriendLink,
  deleteFriendLink,
  reorderFriendLinks,
  ApiUnauthorizedError,
} from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminLoading } from '@/components/admin/AdminLoading'
import { useAdmin } from '../layout'

// 友链表单数据接口
interface FriendFormData {
  id?: string
  name: string
  url: string
  description: string
  avatar: string
  featured: boolean
  sortOrder: number
  isActive: boolean
}

// 默认表单数据
const defaultFormData: FriendFormData = {
  name: '',
  url: '',
  description: '',
  avatar: '',
  featured: false,
  sortOrder: 0,
  isActive: true,
}

export default function FriendsPage() {
  const { t, notify } = useAdmin()
  const { token, logout } = useAuth()
  const router = useRouter()

  // 状态管理
  const [friends, setFriends] = useState<FriendLinkDto[]>([]) // 友链列表
  const [loading, setLoading] = useState(true) // 加载状态
  const [saving, setSaving] = useState(false) // 保存状态
  const [showModal, setShowModal] = useState(false) // 模态框显示状态
  const [editingFriend, setEditingFriend] = useState<FriendFormData | null>(null) // 正在编辑的友链
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null) // 删除确认对话框
  const [draggedId, setDraggedId] = useState<string | null>(null) // 拖拽中的友链ID

  // 处理未授权情况
  const handleUnauthorized = () => {
    logout()
    router.push('/login')
  }

  // 获取友链列表
  const fetchFriends = async () => {
    if (!token) return
    setLoading(true)
    try {
      const data = await getAdminFriendLinks(token)
      setFriends(data)
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized()
        return
      }
      notify(t('common.error'), 'error')
      console.error('Failed to fetch friends:', error)
    } finally {
      setLoading(false)
    }
  }

  // 初始化加载友链列表
  useEffect(() => {
    fetchFriends()
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  // 创建新友链
  const handleCreate = () => {
    setEditingFriend({ ...defaultFormData, sortOrder: friends.length })
    setShowModal(true)
  }

  // 编辑友链
  const handleEdit = (friend: FriendLinkDto) => {
    setEditingFriend({
      id: friend.id,
      name: friend.name,
      url: friend.url,
      description: friend.description || '',
      avatar: friend.avatar || '',
      featured: friend.featured,
      sortOrder: friend.sortOrder,
      isActive: friend.isActive,
    })
    setShowModal(true)
  }

  // 保存友链（创建或更新）
  const handleSave = async () => {
    if (!editingFriend || !token) return
    if (!editingFriend.name.trim()) {
      notify(t('admin.friends_name_required'), 'error')
      return
    }
    if (!editingFriend.url.trim()) {
      notify(t('admin.friends_url_required'), 'error')
      return
    }

    // 验证URL格式
    try {
      new URL(editingFriend.url)
    } catch {
      notify(t('admin.friends_url_invalid'), 'error')
      return
    }

    setSaving(true)
    try {
      const data = {
        name: editingFriend.name,
        url: editingFriend.url,
        description: editingFriend.description || undefined,
        avatar: editingFriend.avatar || undefined,
        featured: editingFriend.featured,
        sortOrder: editingFriend.sortOrder,
        isActive: editingFriend.isActive,
      }

      if (editingFriend.id) {
        await updateFriendLink(token, editingFriend.id, data)
        notify(t('admin.friends_updated'))
      } else {
        await createFriendLink(token, data)
        notify(t('admin.friends_created'))
      }
      await fetchFriends()
      setShowModal(false)
      setEditingFriend(null)
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized()
        return
      }
      notify(t('common.error'), 'error')
      console.error('Failed to save friend:', error)
    } finally {
      setSaving(false)
    }
  }

  // 删除友链
  const handleDelete = async (id: string) => {
    if (!token) return
    try {
      await deleteFriendLink(token, id)
      await fetchFriends()
      notify(t('admin.friends_deleted'))
      setDeleteConfirm(null)
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized()
        return
      }
      notify(t('common.error'), 'error')
      console.error('Failed to delete friend:', error)
    }
  }

  // 切换精选状态
  const handleToggleFeatured = async (friend: FriendLinkDto) => {
    if (!token) return
    try {
      await updateFriendLink(token, friend.id, { featured: !friend.featured })
      setFriends((prev) =>
        prev.map((f) =>
          f.id === friend.id ? { ...f, featured: !f.featured } : f
        )
      )
      notify(friend.featured ? t('admin.friends_unfeatured') : t('admin.friends_featured'))
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized()
        return
      }
      notify(t('common.error'), 'error')
    }
  }

  // 切换启用/禁用状态
  const handleToggleActive = async (friend: FriendLinkDto) => {
    if (!token) return
    try {
      await updateFriendLink(token, friend.id, { isActive: !friend.isActive })
      setFriends((prev) =>
        prev.map((f) =>
          f.id === friend.id ? { ...f, isActive: !f.isActive } : f
        )
      )
      notify(friend.isActive ? t('admin.friends_disabled') : t('admin.friends_enabled'))
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized()
        return
      }
      notify(t('common.error'), 'error')
    }
  }

  // 拖拽排序处理函数
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!draggedId || draggedId === targetId || !token) return

    const draggedIndex = friends.findIndex((f) => f.id === draggedId)
    const targetIndex = friends.findIndex((f) => f.id === targetId)

    if (draggedIndex === -1 || targetIndex === -1) return

    // 先在本地重新排序
    const newFriends = [...friends]
    const [removed] = newFriends.splice(draggedIndex, 1)
    newFriends.splice(targetIndex, 0, removed)

    // 更新排序顺序
    const updatedFriends = newFriends.map((f, index) => ({
      ...f,
      sortOrder: index,
    }))

    setFriends(updatedFriends)
    setDraggedId(null)

    // 保存到服务器
    try {
      await reorderFriendLinks(
        token,
        updatedFriends.map((f) => ({ id: f.id, sortOrder: f.sortOrder }))
      )
      notify(t('admin.friends_reordered'))
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        handleUnauthorized()
        return
      }
      // 出错时恢复原状态
      await fetchFriends()
      notify(t('common.error'), 'error')
    }
  }

  if (loading) {
    return <AdminLoading text={t('common.loading')} />
  }

  return (
    <div className="h-full flex flex-col gap-6 overflow-hidden">
      {/* 页面头部 */}
      <div className="flex items-center justify-between border-b border-border pb-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <Users className="w-6 h-6 text-primary" />
          <h3 className="font-serif text-2xl uppercase tracking-tight">
            {t('admin.friends')}
          </h3>
          <span className="text-xs text-muted-foreground">
            {friends.length} {t('admin.items')}
          </span>
        </div>
        <AdminButton
          onClick={handleCreate}
          adminVariant="primary"
          size="lg"
          className="flex items-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          {t('admin.friends_add')}
        </AdminButton>
      </div>

      {/* 友链列表 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {friends.length === 0 ? (
          <div className="py-24 text-center border border-dashed border-border">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-10" />
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {t('admin.friends_empty')}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {friends.map((friend) => (
              <div
                key={friend.id}
                draggable
                onDragStart={(e) => handleDragStart(e, friend.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, friend.id)}
                className={`flex items-center gap-4 p-4 border border-border hover:border-primary transition-all group ${
                  draggedId === friend.id ? 'opacity-50' : ''
                } ${!friend.isActive ? 'opacity-60' : ''}`}
              >
                {/* 拖拽手柄 */}
                <div className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
                  <GripVertical className="w-4 h-4" />
                </div>

                {/* 头像 */}
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                  {friend.avatar ? (
                    <img
                      src={friend.avatar}
                      alt={friend.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-primary/10">
                      <span className="text-lg font-bold text-primary">
                        {friend.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>

                {/* 友链信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-serif text-lg truncate">{friend.name}</h4>
                    {friend.featured && (
                      <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                    )}
                    {!friend.isActive && (
                      <span className="text-[8px] font-black uppercase px-1.5 py-0.5 border border-muted-foreground text-muted-foreground">
                        {t('admin.friends_inactive')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ExternalLink className="w-3 h-3" />
                    <span className="truncate">{friend.url}</span>
                  </div>
                  {friend.description && (
                    <p className="text-xs text-muted-foreground/70 mt-1 truncate">
                      {friend.description}
                    </p>
                  )}
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <AdminButton
                    onClick={() => handleToggleActive(friend)}
                    adminVariant="icon"
                    title={friend.isActive ? t('admin.friends_disable') : t('admin.friends_enable')}
                  >
                    {friend.isActive ? (
                      <Eye className="w-4 h-4" />
                    ) : (
                      <EyeOff className="w-4 h-4" />
                    )}
                  </AdminButton>
                  <AdminButton
                    onClick={() => handleToggleFeatured(friend)}
                    adminVariant="icon"
                    className="hover:text-yellow-500"
                    title={friend.featured ? t('admin.friends_unfeature') : t('admin.friends_feature')}
                  >
                    {friend.featured ? (
                      <StarOff className="w-4 h-4" />
                    ) : (
                      <Star className="w-4 h-4" />
                    )}
                  </AdminButton>
                  <AdminButton
                    onClick={() => handleEdit(friend)}
                    adminVariant="iconPrimary"
                  >
                    <Edit3 className="w-4 h-4" />
                  </AdminButton>
                  <AdminButton
                    onClick={() => setDeleteConfirm(friend.id)}
                    adminVariant="iconDestructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </AdminButton>
                  <a
                    href={friend.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 编辑/创建模态框 */}
      {showModal && editingFriend && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-background/95 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-background border border-border shadow-2xl">
            {/* 模态框头部 */}
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h3 className="font-serif text-2xl uppercase tracking-tight">
                {editingFriend.id ? t('admin.friends_edit') : t('admin.friends_add')}
              </h3>
              <AdminButton
                onClick={() => {
                  setShowModal(false)
                  setEditingFriend(null)
                }}
                adminVariant="icon"
              >
                <X className="w-5 h-5" />
              </AdminButton>
            </div>

            {/* 模态框内容 */}
            <div className="p-6 space-y-4">
              {/* 名称 */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest mb-2">
                  {t('admin.friends_name')} *
                </label>
                <input
                  type="text"
                  value={editingFriend.name}
                  onChange={(e) =>
                    setEditingFriend({ ...editingFriend, name: e.target.value })
                  }
                  placeholder={t('admin.friends_name_placeholder')}
                  className="w-full p-3 bg-transparent border border-border focus:border-primary outline-none text-sm"
                />
              </div>

              {/* 网址 */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest mb-2">
                  {t('admin.friends_url')} *
                </label>
                <input
                  type="url"
                  value={editingFriend.url}
                  onChange={(e) =>
                    setEditingFriend({ ...editingFriend, url: e.target.value })
                  }
                  placeholder="https://example.com"
                  className="w-full p-3 bg-transparent border border-border focus:border-primary outline-none text-sm"
                />
              </div>

              {/* 描述 */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest mb-2">
                  {t('admin.friends_description')}
                </label>
                <input
                  type="text"
                  value={editingFriend.description}
                  onChange={(e) =>
                    setEditingFriend({ ...editingFriend, description: e.target.value })
                  }
                  placeholder={t('admin.friends_description_placeholder')}
                  className="w-full p-3 bg-transparent border border-border focus:border-primary outline-none text-sm"
                />
              </div>

              {/* 头像URL */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest mb-2">
                  {t('admin.friends_avatar')}
                </label>
                <input
                  type="url"
                  value={editingFriend.avatar}
                  onChange={(e) =>
                    setEditingFriend({ ...editingFriend, avatar: e.target.value })
                  }
                  placeholder="https://example.com/avatar.png"
                  className="w-full p-3 bg-transparent border border-border focus:border-primary outline-none text-sm"
                />
              </div>

              {/* 选项 */}
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingFriend.featured}
                    onChange={(e) =>
                      setEditingFriend({ ...editingFriend, featured: e.target.checked })
                    }
                    className="w-4 h-4"
                  />
                  <span className="font-bold uppercase tracking-widest text-xs">
                    {t('admin.friends_featured')}
                  </span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingFriend.isActive}
                    onChange={(e) =>
                      setEditingFriend({ ...editingFriend, isActive: e.target.checked })
                    }
                    className="w-4 h-4"
                  />
                  <span className="font-bold uppercase tracking-widest text-xs">
                    {t('admin.friends_active')}
                  </span>
                </label>
              </div>
            </div>

            {/* 模态框底部 */}
            <div className="p-6 border-t border-border flex justify-end gap-3">
              <AdminButton
                onClick={() => {
                  setShowModal(false)
                  setEditingFriend(null)
                }}
                adminVariant="outline"
                size="lg"
              >
                {t('common.cancel')}
              </AdminButton>
              <AdminButton
                onClick={handleSave}
                disabled={saving}
                adminVariant="primary"
                size="lg"
                className="flex items-center gap-2"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>{t('common.save')}</span>
              </AdminButton>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认对话框 */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-background/95 backdrop-blur-sm">
          <div className="w-full max-w-md bg-background border border-border shadow-2xl p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-destructive/10 flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-destructive" />
              </div>
              <div>
                <h3 className="font-serif text-xl font-light uppercase tracking-tight">
                  {t('common.delete')}
                </h3>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
                  {t('common.confirm')}
                </p>
              </div>
            </div>

            <p className="text-sm text-foreground leading-relaxed mb-6">
              {t('admin.friends_delete_confirm')}
            </p>

            <div className="flex gap-3">
              <AdminButton
                onClick={() => setDeleteConfirm(null)}
                adminVariant="outline"
                size="xl"
                className="flex-1"
              >
                {t('common.cancel')}
              </AdminButton>
              <AdminButton
                onClick={() => handleDelete(deleteConfirm)}
                adminVariant="destructive"
                size="xl"
                className="flex-1"
              >
                {t('common.delete')}
              </AdminButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
