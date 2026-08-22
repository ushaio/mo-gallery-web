// 系统设置 · 账户（与 Web 端一致：Linux DO 绑定）

import { useState } from 'react'
import { toast } from 'sonner'
import { useCachedPageEffect } from '@/hooks/useCachedPageEffect'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import {
  GetLinuxDoAuthUrl,
  GetLinuxDoBinding,
  IsLinuxDoEnabled,
  UnbindLinuxDoAccount,
} from '../../../wailsjs/go/main/App'
import { type services } from '../../../wailsjs/go/models'
import {
  Loader2,
  User,
  Check,
  Unlink,
  Link,
} from 'lucide-react'
import { getErrorMessage, Badge, Section } from './shared'
// ─── Tab 5: 账户（与 Web 端一致：Linux DO 绑定） ────────────

export function AccountTab() {
  const { language } = usePreferences()
  const [linuxDoEnabled, setLinuxDoEnabled] = useState(false)
  const [linuxDoBinding, setLinuxDoBinding] = useState<services.LinuxDoBindingDTO | null>(null)
  const [linuxDoLoading, setLinuxDoLoading] = useState(false)
  const [linuxDoBindLoading, setLinuxDoBindLoading] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState(false)

  const loadLinuxDoStatus = async () => {
    setLinuxDoLoading(true)
    try {
      const enabled = await IsLinuxDoEnabled()
      setLinuxDoEnabled(enabled)
      if (enabled) {
        const binding = await GetLinuxDoBinding()
        setLinuxDoBinding(binding)
      } else {
        setLinuxDoBinding(null)
      }
    } catch (err: unknown) {
      toast.error('加载 Linux DO 状态失败: ' + getErrorMessage(err))
    } finally {
      setLinuxDoLoading(false)
    }
  }

  useCachedPageEffect(() => { void loadLinuxDoStatus() }, [])

  const handleLinuxDoBind = async () => {
    try {
      setLinuxDoBindLoading(true)
      const { url, state } = await GetLinuxDoAuthUrl()
      // 保存 state 和当前路径到 sessionStorage
      sessionStorage.setItem('linuxdo_oauth_state', state)
      sessionStorage.setItem('linuxdo_redirect', window.location.pathname)
      // 跳转到 Linux DO 授权页
      window.location.href = url
    } catch (err: unknown) {
      toast.error('获取授权 URL 失败: ' + getErrorMessage(err))
      setLinuxDoBindLoading(false)
    }
  }

  const handleLinuxDoUnbind = async () => {
    try {
      await UnbindLinuxDoAccount()
      toast.success('已解绑 Linux DO 账户')
      setDeleteDialog(false)
      loadLinuxDoStatus()
    } catch (err: unknown) {
      toast.error('解绑失败: ' + getErrorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <Section title="Linux DO 绑定">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-[#f8d568]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
            <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--foreground)' }}>
              Linux DO
            </h4>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            绑定 Linux DO 账户后，可以使用 Linux DO 登录。
          </p>
        </div>

        {!linuxDoEnabled ? (
          <div className="p-6 rounded-lg border border-dashed text-center" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              Linux DO 未配置
            </p>
            <p className="mt-2 font-mono text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
              请在 .env 中配置 LINUXDO_CLIENT_ID 和 LINUXDO_CLIENT_SECRET
            </p>
          </div>
        ) : linuxDoLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : linuxDoBinding ? (
          <div className="space-y-6 rounded-lg border p-6" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-4">
              {linuxDoBinding.avatarUrl ? (
                <img
                  src={linuxDoBinding.avatarUrl}
                  alt={linuxDoBinding.username || ''}
                  className="h-12 w-12 rounded-full border"
                  style={{ borderColor: 'var(--border)' }}
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full border bg-muted" style={{ borderColor: 'var(--border)' }}>
                  <User size={20} className="text-muted-foreground" />
                </div>
              )}
              <div>
                <p className="font-medium" style={{ color: 'var(--foreground)' }}>
                  {linuxDoBinding.username}
                </p>
                {linuxDoBinding.trustLevel !== null && (
                  <p className="mt-0.5 font-mono text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                    Trust Level: {linuxDoBinding.trustLevel}
                  </p>
                )}
              </div>
              <div className="ml-auto">
                <Badge tone="green"><Check size={10} /> 已绑定</Badge>
              </div>
            </div>
            <button
              onClick={() => setDeleteDialog(true)}
              disabled={linuxDoBindLoading}
              className="flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors hover:bg-secondary disabled:opacity-50"
              style={{ borderColor: 'color-mix(in srgb, var(--destructive) 40%, transparent)', color: 'var(--destructive)' }}
            >
              {linuxDoBindLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Unlink size={14} />
              )}
              解绑 Linux DO
            </button>
          </div>
        ) : (
          <div className="space-y-4 rounded-lg border border-dashed p-6 text-center" style={{ borderColor: 'var(--border)' }}>
            <div className="space-y-2">
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                未绑定 Linux DO 账户
              </p>
              <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                绑定后可以使用 Linux DO 登录
              </p>
            </div>
            <button
              onClick={handleLinuxDoBind}
              disabled={linuxDoBindLoading}
              className="mx-auto flex items-center justify-center gap-2 rounded-md px-5 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#f8d568', color: '#1a1a1a' }}
            >
              {linuxDoBindLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Link size={14} />
              )}
              绑定 Linux DO
            </button>
          </div>
        )}
      </Section>

      <SimpleDeleteDialog
        isOpen={deleteDialog}
        title="解绑 Linux DO"
        message="确定要解绑 Linux DO 账户吗？解绑后无法使用 Linux DO 登录。"
        onConfirm={handleLinuxDoUnbind}
        onCancel={() => setDeleteDialog(false)}
        t={(key) => t(key, language)}
      />
    </div>
  )
}
