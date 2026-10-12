import 'server-only'
import { db } from '~/server/lib/db'
import { decryptStoredSecret, encryptStoredSecret } from '~/server/lib/stored-secrets'

/**
 * 微信公众号绑定（站点级）。
 *
 * 公众号 access_token 类接口要求调用方出口 IP 在公众号后台的 IP 白名单内，
 * 所以凭据必须由服务端持有并校验：桌面端只提交 AppID / AppSecret，
 * 服务端校验成功后把 JSON 加密（`enc:v1:`）落到 Setting KV。
 * AppSecret 永不回显、永不写日志。
 */

export const WECHAT_BINDING_SETTING_KEY = 'wechat_binding'

/**
 * 微信 40164 回包里「微信实际看到的调用来源 IP」的落库键。
 *
 * 出口 IP 会变（多出口 NAT / 国内外分流 / 换机房），所以这里只留**最近一次**微信
 * 亲口告诉我们的值，作为权威 IP 供界面展示；本地自检值（WECHAT_EGRESS_IP / ipify）
 * 只在还没有观测值时兜底。
 */
export const WECHAT_EGRESS_OBSERVED_SETTING_KEY = 'wechat_egress_observed'

/** @internal 微信接口基址（素材模块复用）。 */
export const WECHAT_API_BASE = 'https://api.weixin.qq.com'
/** @internal 普通接口（JSON 且体量小）的超时。 */
export const WECHAT_REQUEST_TIMEOUT_MS = 10_000
const EGRESS_IP_TIMEOUT_MS = 5_000
const EGRESS_IP_TTL_MS = 60 * 60 * 1000
const EGRESS_IP_FAILURE_TTL_MS = 5 * 60 * 1000

const INVALID_CREDENTIAL_ERRCODES = new Set([40001, 40013, 40125, 41004])
const RATE_LIMITED_ERRCODES = new Set([45009, -1])

export class WeChatBindingError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'WeChatBindingError'
    this.code = code
    this.status = status
  }
}

interface WeChatAccessTokenResponse {
  access_token?: string
  expires_in?: number
  errcode?: number
  errmsg?: string
}

interface WeChatAccountBasicInfoResponse {
  nick_name?: string
  head_img?: string
  errcode?: number
  errmsg?: string
}

export interface WeChatBindingRecord {
  appId: string
  appSecret: string
  accountName: string
  avatarUrl: string
  boundAt: string
}

export interface WeChatBindingView {
  bound: boolean
  appId: string
  accountName: string
  avatarUrl: string
  boundAt: string | null
  egressIp: string
  /** true = egressIp 来自微信回包（权威）；false = 服务端自检值（可能过时，仅供参考）。 */
  egressIpObserved: boolean
  /** 观测到 egressIp 的时间（ISO8601）；从未观测过为 null。 */
  egressIpObservedAt: string | null
  profileAvailable: boolean
}

/** 出口 IP 的展示状态：微信观测值优先，本地自检兜底。 */
interface WeChatEgressIpState {
  ip: string
  observed: boolean
  observedAt: string | null
}

interface WeChatObservedEgressIp {
  ip: string
  at: string
}

let egressIpCache: { value: string; expiresAt: number } | null = null

/** AppID 只在读取接口里以脱敏形式出现：长度大于 8 时保留前 4 后 4。 */
export function maskAppId(appId: string): string {
  if (appId.length > 8) return `${appId.slice(0, 4)}****${appId.slice(-4)}`
  return '****'
}

/**
 * 服务端**自检**出口 IP（仅供参考的兜底值）。
 *
 * 它不等于微信看到的来源 IP：WECHAT_EGRESS_IP 只是显式配置的展示值（不会改变真实出口），
 * ipify 与 api.weixin.qq.com 也可能走不同出口。权威值只从微信 40164 回包里取，
 * 见 readObservedEgressIp / resolveEgressIpState。
 */
export async function getWeChatEgressIp(): Promise<string> {
  const configured = process.env.WECHAT_EGRESS_IP?.trim()
  if (configured) return configured

  const now = Date.now()
  if (egressIpCache && egressIpCache.expiresAt > now) return egressIpCache.value

  try {
    const response = await fetch('https://api.ipify.org?format=json', {
      cache: 'no-store',
      signal: AbortSignal.timeout(EGRESS_IP_TIMEOUT_MS),
    })
    const body = await response.json() as { ip?: unknown }
    const ip = typeof body.ip === 'string' ? body.ip.trim() : ''
    egressIpCache = {
      value: ip,
      expiresAt: now + (ip ? EGRESS_IP_TTL_MS : EGRESS_IP_FAILURE_TTL_MS),
    }
    return ip
  } catch {
    egressIpCache = { value: '', expiresAt: now + EGRESS_IP_FAILURE_TTL_MS }
    return ''
  }
}

async function readObservedEgressIp(): Promise<WeChatObservedEgressIp | null> {
  try {
    const row = await db.setting.findUnique({ where: { key: WECHAT_EGRESS_OBSERVED_SETTING_KEY } })
    if (!row?.value) return null

    const parsed = JSON.parse(row.value) as Partial<WeChatObservedEgressIp>
    const ip = typeof parsed.ip === 'string' ? parsed.ip.trim() : ''
    if (!ip) return null
    return { ip, at: typeof parsed.at === 'string' ? parsed.at : '' }
  } catch (error) {
    console.warn('Stored WeChat egress IP cannot be read:', error)
    return null
  }
}

/** 记录微信回包里观测到的来源 IP。纯诊断信息：写失败不能影响绑定流程。 */
async function writeObservedEgressIp(ip: string): Promise<void> {
  const value = JSON.stringify({ ip, at: new Date().toISOString() } satisfies WeChatObservedEgressIp)
  try {
    await db.setting.upsert({
      where: { key: WECHAT_EGRESS_OBSERVED_SETTING_KEY },
      update: { value },
      create: { key: WECHAT_EGRESS_OBSERVED_SETTING_KEY, value },
    })
  } catch (error) {
    console.warn('Save WeChat egress IP failed:', error)
  }
}

/** 出口 IP 展示值：微信观测值（权威）优先，从未观测过才退回本地自检。 */
async function resolveEgressIpState(): Promise<WeChatEgressIpState> {
  const observed = await readObservedEgressIp()
  if (observed) return { ip: observed.ip, observed: true, observedAt: observed.at || null }
  return { ip: await getWeChatEgressIp(), observed: false, observedAt: null }
}

/** @internal 统一超时 / 网络错误 / JSON 解析错误的微信请求封装（素材模块复用）。 */
export async function requestWeChatApi<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(WECHAT_REQUEST_TIMEOUT_MS),
      ...init,
    })
  } catch {
    throw new WeChatBindingError('WECHAT_UNREACHABLE', '无法连接微信服务器，请检查服务端网络后重试', 502)
  }

  try {
    return await response.json() as T
  } catch {
    throw new WeChatBindingError('WECHAT_UNREACHABLE', '微信服务器返回了无法解析的响应，请稍后重试', 502)
  }
}

/**
 * 从微信 errmsg 里取出「微信实际看到的调用来源 IP」，形如：
 * `invalid ip 1.2.3.4, not in whitelist hint: [...]`
 * `invalid ip 8.149.x.x ipv6 ::ffff:8.149.x.x, not in whitelist rid: ...`
 * 这是权威值：本服务端自检的出口 IP（WECHAT_EGRESS_IP / ipify）可能因分流、代理或多出口 NAT 而不同于微信所见。
 */
function observedIpFromErrmsg(errmsg: string): string {
  const matched = /invalid ip\s+([0-9a-fA-F:.]+)/.exec(errmsg)
  if (!matched) return ''
  const raw = matched[1].trim()
  const ipv4Mapped = /^::ffff:(.+)$/i.exec(raw)
  return ipv4Mapped ? ipv4Mapped[1] : raw
}

/** @internal 按微信 errcode 归类错误（40164 / 凭据 / 限流 / 其他），素材模块复用。 */
export function weChatErrorFromCode(errcode: number, errmsg: string, egressIp: string): WeChatBindingError {
  if (errcode === 40164) {
    const observed = observedIpFromErrmsg(errmsg)
    const target = observed || egressIp
    const notes: string[] = []
    if (observed && egressIp && observed !== egressIp) {
      notes.push(
        `微信实际看到的调用来源 IP 是 ${observed}，与本服务端自检得到的 ${egressIp} 不一致，请以微信返回的 IP 为准，并核对 WECHAT_EGRESS_IP 是否配错`,
      )
    } else if (observed) {
      notes.push(`微信实际看到的调用来源 IP 是 ${observed}`)
    }
    const hint = target
      ? `，请把 ${target} 加入公众平台「设置与开发 → 基本配置 → IP白名单」后重试`
      : '，请把本服务端出口 IP 加入公众平台「设置与开发 → 基本配置 → IP白名单」后重试'
    const suffix = notes.length > 0 ? `（${notes.join('；')}）` : ''
    return new WeChatBindingError('WECHAT_IP_NOT_WHITELISTED', `调用来源 IP 未加入该公众号的 IP 白名单${hint}${suffix}`, 403)
  }

  if (INVALID_CREDENTIAL_ERRCODES.has(errcode)) {
    return new WeChatBindingError(
      'WECHAT_CREDENTIALS_INVALID',
      'AppID 或 AppSecret 不正确，请到公众平台「开发 → 基本配置」核对',
      400,
    )
  }

  if (RATE_LIMITED_ERRCODES.has(errcode)) {
    return new WeChatBindingError('WECHAT_RATE_LIMITED', '微信接口频率受限，请稍后重试', 429)
  }

  return new WeChatBindingError(
    'WECHAT_API_ERROR',
    `微信接口返回错误（${errcode}：${errmsg || '未知错误'}）`,
    502,
  )
}

async function fetchStableAccessToken(appId: string, appSecret: string, egressIp: string): Promise<string> {
  const body = await requestWeChatApi<WeChatAccessTokenResponse>(
    `${WECHAT_API_BASE}/cgi-bin/stable_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credential',
        appid: appId,
        secret: appSecret,
        force_refresh: false,
      }),
    },
  )

  if (typeof body.errcode === 'number' && body.errcode !== 0) {
    const errmsg = body.errmsg ?? ''
    console.warn(`[wechat] stable_token 失败：errcode=${body.errcode} errmsg=${errmsg}`)
    // 40164 的 errmsg 自带「微信实际看到的来源 IP」，这是唯一权威来源，记下来供界面展示。
    const observed = observedIpFromErrmsg(errmsg)
    if (observed) await writeObservedEgressIp(observed)
    throw weChatErrorFromCode(body.errcode, errmsg, egressIp)
  }

  const accessToken = body.access_token?.trim()
  if (!accessToken) {
    throw new WeChatBindingError('WECHAT_API_ERROR', '微信接口未返回 access_token，请稍后重试', 502)
  }
  return accessToken
}

/**
 * 取当前绑定的 access_token（素材等业务接口共用）。
 *
 * 用 stable_token（`force_refresh: false`）：微信侧会复用未过期的 token，不必自己做缓存，
 * 也就不会出现「本地缓存一个已被微信作废的 token」这类状态。40164 的观测 IP 记录在
 * fetchStableAccessToken 内完成，因此素材请求同样会刷新权威出口 IP。
 */
export async function getWeChatAccessToken(): Promise<string> {
  const stored = await readBindingRecord()
  if (!stored.record) {
    throw new WeChatBindingError('WECHAT_BINDING_NOT_FOUND', '尚未绑定微信公众号', 404)
  }
  const egressIp = await getWeChatEgressIp()
  return fetchStableAccessToken(stored.record.appId, stored.record.appSecret, egressIp)
}

/**
 * 当前绑定的公众号 AppID（明文）。
 *
 * 只给「按公众号分键」的缓存 / 归档类需求用（AppID 本身不是密钥，脱敏只发生在对外视图里）；
 * AppSecret 依旧不出这个模块。
 */
export async function getWeChatAppId(): Promise<string> {
  const stored = await readBindingRecord()
  if (!stored.record) {
    throw new WeChatBindingError('WECHAT_BINDING_NOT_FOUND', '尚未绑定微信公众号', 404)
  }
  return stored.record.appId
}

/**
 * 公众号名称 / 头像属于锦上添花：未认证订阅号等常常没有该接口权限（48001），
 * 这类失败不阻塞绑定，绑定成立但 profileAvailable=false。
 */
async function fetchAccountProfile(accessToken: string): Promise<{ accountName: string; avatarUrl: string } | null> {
  try {
    const body = await requestWeChatApi<WeChatAccountBasicInfoResponse>(
      `${WECHAT_API_BASE}/cgi-bin/account/getaccountbasicinfo?access_token=${encodeURIComponent(accessToken)}`,
    )
    if (typeof body.errcode === 'number' && body.errcode !== 0) {
      console.warn('WeChat account profile unavailable:', body.errcode, body.errmsg ?? '')
      return null
    }
    return {
      accountName: body.nick_name?.trim() ?? '',
      avatarUrl: body.head_img?.trim() ?? '',
    }
  } catch (error) {
    if (error instanceof WeChatBindingError) {
      console.warn('WeChat account profile request failed:', error.message)
      return null
    }
    throw error
  }
}

async function readBindingRecord(): Promise<{ record: WeChatBindingRecord | null; undecryptable: boolean }> {
  const row = await db.setting.findUnique({ where: { key: WECHAT_BINDING_SETTING_KEY } })
  if (!row?.value) return { record: null, undecryptable: false }

  try {
    const plaintext = decryptStoredSecret(row.value)
    if (!plaintext) return { record: null, undecryptable: true }

    const parsed = JSON.parse(plaintext) as Partial<WeChatBindingRecord>
    if (!parsed.appId || !parsed.appSecret) return { record: null, undecryptable: true }

    return {
      record: {
        appId: parsed.appId,
        appSecret: parsed.appSecret,
        accountName: parsed.accountName ?? '',
        avatarUrl: parsed.avatarUrl ?? '',
        boundAt: parsed.boundAt ?? '',
      },
      undecryptable: false,
    }
  } catch (error) {
    console.warn('Stored WeChat binding cannot be read:', error)
    return { record: null, undecryptable: true }
  }
}

async function writeBindingRecord(record: WeChatBindingRecord): Promise<void> {
  const encrypted = encryptStoredSecret(JSON.stringify(record))
  if (!encrypted) {
    throw new WeChatBindingError('WECHAT_STORE_FAILED', '绑定信息保存失败，请重试', 500)
  }

  try {
    await db.setting.upsert({
      where: { key: WECHAT_BINDING_SETTING_KEY },
      update: { value: encrypted },
      create: { key: WECHAT_BINDING_SETTING_KEY, value: encrypted },
    })
  } catch (error) {
    console.error('Save WeChat binding error:', error)
    throw new WeChatBindingError('WECHAT_STORE_FAILED', '绑定信息保存失败，请重试', 500)
  }
}

function toBindingView(
  record: WeChatBindingRecord | null,
  egress: WeChatEgressIpState,
  undecryptable = false,
): WeChatBindingView {
  const egressFields = {
    egressIp: egress.ip,
    egressIpObserved: egress.observed,
    egressIpObservedAt: egress.observedAt,
  }

  if (!record) {
    return {
      bound: undecryptable,
      appId: '',
      accountName: '',
      avatarUrl: '',
      boundAt: null,
      ...egressFields,
      profileAvailable: false,
    }
  }

  return {
    bound: true,
    appId: maskAppId(record.appId),
    accountName: record.accountName,
    avatarUrl: record.avatarUrl,
    boundAt: record.boundAt || null,
    ...egressFields,
    profileAvailable: Boolean(record.accountName || record.avatarUrl),
  }
}

export async function getWeChatBinding(): Promise<WeChatBindingView> {
  const [stored, egress] = await Promise.all([readBindingRecord(), resolveEgressIpState()])
  return toBindingView(stored.record, egress, stored.undecryptable)
}

export async function bindWeChatAccount(input: { appId: string; appSecret: string }): Promise<WeChatBindingView> {
  const appId = input.appId.trim()
  const appSecret = input.appSecret.trim()

  if (!appId) throw new WeChatBindingError('WECHAT_APP_ID_REQUIRED', '请填写公众号 AppID', 400)
  if (!appSecret) throw new WeChatBindingError('WECHAT_APP_SECRET_REQUIRED', '请填写公众号 AppSecret', 400)

  const egressIp = await getWeChatEgressIp()
  const accessToken = await fetchStableAccessToken(appId, appSecret, egressIp)
  const profile = await fetchAccountProfile(accessToken)

  const record: WeChatBindingRecord = {
    appId,
    appSecret,
    accountName: profile?.accountName ?? '',
    avatarUrl: profile?.avatarUrl ?? '',
    boundAt: new Date().toISOString(),
  }

  await writeBindingRecord(record)
  return toBindingView(record, await resolveEgressIpState())
}

/**
 * 手动设置公众号显示名称。
 *
 * 个人主体的公众号无法开通微信认证，`cgi-bin/account/getaccountbasicinfo` 恒返回 48001，
 * 名称与头像在服务端永远取不到，只能由管理员手填一个展示名。
 * 传空字符串表示清除手填名称，回落到微信返回值（若有）与前端兜底展示。
 */
export async function updateWeChatAccountName(accountName: string): Promise<WeChatBindingView> {
  const name = accountName.trim()
  if (name.length > 60) {
    throw new WeChatBindingError('WECHAT_ACCOUNT_NAME_TOO_LONG', '公众号名称过长（最多 60 字）', 400)
  }

  const stored = await readBindingRecord()
  if (!stored.record) {
    throw new WeChatBindingError('WECHAT_BINDING_NOT_FOUND', '尚未绑定微信公众号', 404)
  }

  const record: WeChatBindingRecord = { ...stored.record, accountName: name }
  await writeBindingRecord(record)
  return toBindingView(record, await resolveEgressIpState())
}

export async function unbindWeChatAccount(): Promise<WeChatBindingView> {
  try {
    await db.setting.deleteMany({ where: { key: WECHAT_BINDING_SETTING_KEY } })
  } catch (error) {
    console.error('Delete WeChat binding error:', error)
    throw new WeChatBindingError('WECHAT_STORE_FAILED', '解绑失败，请重试', 500)
  }
  return toBindingView(null, await resolveEgressIpState())
}
