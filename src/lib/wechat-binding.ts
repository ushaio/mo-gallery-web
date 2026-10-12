import { apiRequestData } from '@/lib/api'

/**
 * 微信公众号绑定（自部署站点管理员配置）。
 *
 * 服务端契约见 `mo-gallery-web/hono/wechat.ts`：三条路由都在 `/api/wechat/binding`，
 * 且都需要管理员 token（`authMiddleware` 已强制 `isAdmin`）。
 *
 * 这里刻意不放进共享包 `@mo-gallery/api-client`：该能力目前只有 web 后台使用，
 * 加进共享包会牵动 `pnpm sync` 与两个消费方镜像。
 */
export interface WeChatBindingView {
  bound: boolean
  /** 脱敏后的 AppID（前 4 后 4）；不可解密时为空串。 */
  appId: string
  accountName: string
  avatarUrl: string
  boundAt: string | null
  /** 微信实际看到（或本端自检得到）的服务端调用来源 IP。 */
  egressIp: string
  /** true = egressIp 来自微信 40164 回包，权威；false = 服务端自检值，可能已经过时。 */
  egressIpObserved: boolean
  /** 观测到 egressIp 的时间（ISO8601）；从未观测过为 null。 */
  egressIpObservedAt: string | null
  profileAvailable: boolean
}

export function getWeChatBinding(token: string | null): Promise<WeChatBindingView> {
  return apiRequestData<WeChatBindingView>('/api/wechat/binding', {}, token)
}

export function bindWeChatAccount(
  token: string | null,
  input: { appId: string; appSecret: string },
): Promise<WeChatBindingView> {
  return apiRequestData<WeChatBindingView>(
    '/api/wechat/binding',
    { method: 'POST', body: JSON.stringify(input) },
    token,
  )
}

/**
 * 手动设置公众号显示名称（个人主体无法微信认证时微信不返回名称）。
 * 传空字符串表示清除手填名称。
 */
export function updateWeChatAccountName(
  token: string | null,
  accountName: string,
): Promise<WeChatBindingView> {
  return apiRequestData<WeChatBindingView>(
    '/api/wechat/binding',
    { method: 'PATCH', body: JSON.stringify({ accountName }) },
    token,
  )
}

export function unbindWeChatAccount(token: string | null): Promise<WeChatBindingView> {
  return apiRequestData<WeChatBindingView>('/api/wechat/binding', { method: 'DELETE' }, token)
}
