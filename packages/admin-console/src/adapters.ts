import type { ReactNode } from 'react'

/**
 * 后台管理台宿主适配器（`@mo-gallery/admin-console` 冻结契约）。
 *
 * 设计原则（与 `@mo-gallery/public-site` 同款）：
 * 1. 共享包只提供**结构 + 观感**，不内嵌任何宿主的取数、路由、鉴权与 i18n；
 * 2. 端与端之间的差异只能落在四处登记点——① `AdminNavItem[]` 导航配置
 *    ② `AdminCapabilities` 能力实现 ③ 组件 props（含 className/schema）
 *    ④ `AdminShell` 插槽；共享包内部**禁止**出现 `if (host === '...')` 分支；
 * 3. 契约只做加法：新增能力一律以**可选成员**追加，缺席即降级（导航项隐藏 /
 *    整块 UI 不渲染）。
 */

/** 当前登录管理员的最小形状；宿主从自己的会话里取。 */
export interface AdminUser {
  username?: string
  role?: string
  displayName?: string
}

/**
 * 一条后台导航项。链接模式与选中回调二选一：
 * - 宿主传 `href`（web 的 `/admin/library` 这类路由）→ 外壳渲染链接；
 * - 宿主传 `onSelectNav`（official 的单页 tab 模式）→ 外壳渲染按钮并回调 id。
 */
export interface AdminNavItem {
  id: string
  label: string
  description?: string
  /** 图标由宿主传入（共享包不锁死图标库） */
  icon?: ReactNode
  /** 右侧计数徽标；`null` / `undefined` 表示不显示 */
  count?: number | null
  /** 强制隐藏计数徽标（如「系统设置」这类没有数量概念的项） */
  hideCount?: boolean
  /** 链接模式的目标地址 */
  href?: string
  /**
   * 能力开关：取值必须是 `AdminCapabilities` 的键，宿主**没有**实现该能力时
   * 该项自动隐藏——"official 没有存储整理菜单"就是靠这条表达的。
   */
  capability?: string
}

/**
 * 端能力表：宿主实现了某项能力就点亮对应 UI，缺席即降级。
 *
 * 现阶段（阶段 0）外壳不消费任何具体能力，只按 `AdminNavItem.capability`
 * 判定导航项显隐；后续下沉面板时在这里以**可选**字段追加数据通道，
 * 例如 `storage?: { listSources(): Promise<StorageSource[]> }`。
 */
export interface AdminCapabilities {
  [capability: string]: unknown
}

/** 共享外壳内置文案；宿主可整份或逐条覆盖（web 有 zh/en，official 目前只有中文）。 */
export interface AdminLabels {
  online: string
  admin: string
  currentUser: string
  logout: string
  toggleRail: string
  openRail: string
  closeRail: string
  closeDialog: string
  loading: string
}

export const DEFAULT_ADMIN_LABELS: AdminLabels = {
  online: '在线',
  admin: 'ADMIN',
  currentUser: '当前登录',
  logout: '退出',
  toggleRail: '收起/展开侧栏',
  openRail: '展开侧栏',
  closeRail: '关闭侧栏',
  closeDialog: '关闭',
  loading: '加载中',
}

export function resolveAdminLabels(labels?: Partial<AdminLabels>): AdminLabels {
  return { ...DEFAULT_ADMIN_LABELS, ...(labels ?? {}) }
}

/** 宿主链接渲染器：共享包不直接依赖 `next/link`，由宿主注入实现。 */
export type AdminLinkRenderer = (props: {
  href: string
  className?: string
  title?: string
  children: ReactNode
  'aria-current'?: 'page'
  onClick?: () => void
}) => ReactNode

/** 宿主注入的运行期上下文。全部成员可选，缺失时共享组件走最保守的分支。 */
export interface AdminHostAdapter {
  /** 当前登录管理员；缺失则顶栏不渲染身份胶囊 */
  user?: AdminUser | null
  /** 站内跳转（抽屉/弹窗内导航用）；缺失时只渲染链接 */
  navigate?: (href: string) => void
  /** 链接渲染器；缺失时回落原生 `<a>` */
  renderLink?: AdminLinkRenderer
  /** 文案覆盖 */
  labels?: Partial<AdminLabels>
}
