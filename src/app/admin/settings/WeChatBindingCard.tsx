'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Link, Loader2, MessageCircle, Unlink } from 'lucide-react'
import { ApiUnauthorizedError } from '@/lib/api'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminInput } from '@/components/admin/AdminFormControls'
import { SimpleDeleteDialog } from '@/components/admin/SimpleDeleteDialog'
import {
  bindWeChatAccount,
  getWeChatBinding,
  unbindWeChatAccount,
  updateWeChatAccountName,
  type WeChatBindingView,
} from '@/lib/wechat-binding'

interface WeChatBindingCardProps {
  token: string | null
  t: (key: string) => string
  notify: (message: string, type?: 'success' | 'error' | 'info') => void
  onUnauthorized: () => void
}

function formatBoundAt(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

/**
 * 「系统设置 → 账号」里的微信公众号绑定卡片。
 *
 * 凭据录入在这里（而不是桌面端）：公众号 access_token 类接口要求调用方出口 IP
 * 在公众号后台白名单内，只有服务端能稳定满足；桌面端只负责展示服务端状态。
 */
export function WeChatBindingCard({ token, t, notify, onUnauthorized }: WeChatBindingCardProps) {
  const [binding, setBinding] = useState<WeChatBindingView | null>(null)
  const [loading, setLoading] = useState(true)
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [unbinding, setUnbinding] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmUnbind, setConfirmUnbind] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [savingName, setSavingName] = useState(false)

  const reportError = useCallback(
    (error: unknown, fallback: string) => {
      if (error instanceof ApiUnauthorizedError) {
        onUnauthorized()
        return
      }
      notify(error instanceof Error ? error.message : fallback, 'error')
    },
    [notify, onUnauthorized],
  )

  const loadBinding = useCallback(async () => {
    setLoading(true)
    try {
      setBinding(await getWeChatBinding(token))
    } catch (error) {
      reportError(error, t('admin.wechat_status_load_failed'))
    } finally {
      setLoading(false)
    }
  }, [reportError, t, token])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadBinding()
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleBind = async () => {
    if (!token) return
    const trimmedAppId = appId.trim()
    const trimmedSecret = appSecret.trim()
    if (!trimmedAppId || !trimmedSecret) {
      notify(t('admin.wechat_credentials_required'), 'error')
      return
    }

    setSubmitting(true)
    try {
      setBinding(await bindWeChatAccount(token, { appId: trimmedAppId, appSecret: trimmedSecret }))
      setAppId('')
      setAppSecret('')
      notify(t('admin.wechat_bind_success'), 'success')
    } catch (error) {
      reportError(error, t('admin.wechat_bind_failed'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleUnbind = async () => {
    if (!token) return
    setUnbinding(true)
    try {
      setBinding(await unbindWeChatAccount(token))
      setConfirmUnbind(false)
      notify(t('admin.wechat_unbind_success'), 'success')
    } catch (error) {
      reportError(error, t('admin.wechat_unbind_failed'))
    } finally {
      setUnbinding(false)
    }
  }

  const handleSaveName = async () => {
    if (!token) return
    setSavingName(true)
    try {
      const next = await updateWeChatAccountName(token, nameDraft)
      setBinding(next)
      setNameDraft(next.accountName)
      setEditingName(false)
      notify(t('admin.wechat_name_saved'), 'success')
    } catch (error) {
      reportError(error, t('admin.wechat_name_save_failed'))
    } finally {
      setSavingName(false)
    }
  }

  const handleCopyIp = async () => {
    const ip = binding?.egressIp?.trim()
    if (!ip) return
    try {
      await navigator.clipboard.writeText(ip)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      notify(t('admin.wechat_copy_ip_failed'), 'error')
    }
  }

  const egressIp = binding?.egressIp?.trim() ?? ''
  const unreadable = Boolean(binding?.bound && !binding.appId)
  const accountName = binding?.accountName?.trim() ?? ''
  // 个人主体无法微信认证时微信不返回名称，退回脱敏 AppID 兜底展示。
  const displayName =
    accountName ||
    (binding?.appId
      ? `${t('admin.wechat_name_fallback')}（${binding.appId}）`
      : t('admin.wechat_unnamed'))

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-border/50">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-[#07c160]" />
          <h4 className="text-[10px] font-bold text-foreground uppercase tracking-widest">
            {t('admin.wechat_binding')}
          </h4>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          {t('admin.wechat_binding_desc')}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : binding?.bound && !unreadable ? (
        <div className="p-6 border border-border bg-muted/10 space-y-6">
          <div className="flex items-center gap-4">
            {binding.avatarUrl ? (
              <img
                src={binding.avatarUrl}
                alt={binding.accountName || ''}
                className="w-12 h-12 rounded-full border border-border"
              />
            ) : (
              <div className="w-12 h-12 rounded-full border border-border bg-muted flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-bold text-foreground truncate">{displayName}</p>
              <p className="text-[10px] text-muted-foreground font-mono mt-1">
                AppID: {binding.appId}
              </p>
              {binding.boundAt && (
                <p className="text-[10px] text-muted-foreground/70 mt-1">
                  {t('admin.wechat_bound_at')}: {formatBoundAt(binding.boundAt)}
                </p>
              )}
            </div>
            <div className="ml-auto">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 text-primary text-[9px] font-bold uppercase tracking-widest border border-primary/20">
                <Check className="w-3 h-3" />
                {t('admin.wechat_bound')}
              </span>
            </div>
          </div>

          {!binding.profileAvailable && (
            <p className="text-[10px] text-muted-foreground/70">
              {t('admin.wechat_profile_unavailable')}
            </p>
          )}

          {editingName ? (
            <div className="flex items-center gap-2">
              <AdminInput
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                placeholder={t('admin.wechat_name_placeholder')}
                maxLength={60}
                autoComplete="off"
                spellCheck={false}
                disabled={savingName}
                className="flex-1"
              />
              <AdminButton
                onClick={handleSaveName}
                disabled={savingName}
                adminVariant="primary"
                size="none"
                className="px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50"
              >
                {savingName ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  t('admin.wechat_name_save')
                )}
              </AdminButton>
              <AdminButton
                onClick={() => {
                  setEditingName(false)
                  setNameDraft(accountName)
                }}
                disabled={savingName}
                adminVariant="unstyled"
                className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('admin.wechat_name_cancel')}
              </AdminButton>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <AdminButton
                onClick={() => {
                  setNameDraft(accountName)
                  setEditingName(true)
                }}
                adminVariant="unstyled"
                className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              >
                {t('admin.wechat_name_edit')}
              </AdminButton>
              <span className="text-[10px] text-muted-foreground/70">{t('admin.wechat_name_hint')}</span>
            </div>
          )}

          <AdminButton
            onClick={() => setConfirmUnbind(true)}
            disabled={unbinding}
            adminVariant="unstyled"
            className="w-full py-3 border border-destructive/50 text-destructive hover:bg-destructive/10 text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {unbinding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Unlink className="w-4 h-4" />
            )}
            {t('admin.wechat_unbind')}
          </AdminButton>
        </div>
      ) : (
        <div className="p-6 border border-dashed border-border space-y-5">
          {unreadable && (
            <div className="p-3 border border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400">
              {t('admin.wechat_unreadable')}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t('admin.wechat_not_bound')}</p>
            <p className="text-[10px] text-muted-foreground/70">{t('admin.wechat_bind_hint')}</p>
          </div>

          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="block text-[10px] font-bold text-foreground uppercase tracking-widest">
                {t('admin.wechat_app_id')}
              </span>
              <AdminInput
                value={appId}
                onChange={(event) => setAppId(event.target.value)}
                placeholder="wx1234567890abcdef"
                autoComplete="off"
                spellCheck={false}
                disabled={submitting}
              />
            </label>

            <label className="block space-y-2">
              <span className="block text-[10px] font-bold text-foreground uppercase tracking-widest">
                {t('admin.wechat_app_secret')}
              </span>
              <AdminInput
                type="password"
                value={appSecret}
                onChange={(event) => setAppSecret(event.target.value)}
                autoComplete="new-password"
                spellCheck={false}
                disabled={submitting}
              />
              <span className="block text-[10px] text-muted-foreground/70">
                {t('admin.wechat_secret_note')}
              </span>
            </label>
          </div>

          <AdminButton
            onClick={handleBind}
            disabled={submitting || !appId.trim() || !appSecret.trim()}
            adminVariant="primary"
            size="none"
            className="w-full py-3 text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
            {t('admin.wechat_bind')}
          </AdminButton>
        </div>
      )}

      {!loading && egressIp && (
        <div className="p-4 border border-border bg-muted/5 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-foreground uppercase tracking-widest">
              {binding?.egressIpObserved
                ? t('admin.wechat_egress_ip_observed')
                : t('admin.wechat_egress_ip_selfcheck')}
            </span>
            <code className="text-xs font-mono text-foreground">{egressIp}</code>
            <AdminButton
              onClick={handleCopyIp}
              adminVariant="unstyled"
              className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {t('admin.wechat_copy_ip')}
            </AdminButton>
          </div>
          {binding?.egressIpObserved && binding.egressIpObservedAt && (
            <p className="text-[10px] text-muted-foreground/70">
              {t('admin.wechat_egress_observed_at')}: {formatBoundAt(binding.egressIpObservedAt)}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground/70">{t('admin.wechat_ip_hint')}</p>
        </div>
      )}

      <SimpleDeleteDialog
        isOpen={confirmUnbind}
        title={t('admin.wechat_unbind')}
        message={t('admin.wechat_unbind_confirm')}
        onConfirm={handleUnbind}
        onCancel={() => setConfirmUnbind(false)}
        t={t}
      />
    </div>
  )
}
