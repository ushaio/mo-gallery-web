/**
 * @mo-gallery/admin-console — 后台管理台共享外壳与设计系统。
 *
 * 架构约束（与 `@mo-gallery/public-site` 同款，改代码前先读 README）：
 * 1. 共享包只提供**结构 + 观感**：导航配置（`AdminNavItem[]`）、能力表
 *    （`AdminCapabilities`）、用户身份、链接渲染与文案全部由宿主注入；
 * 2. 共享包内部**禁止**出现宿主判断（`if (official)`）、`@/` 别名、直接
 *    `next/navigation` 与 `next/link`、`server-only`；
 * 3. 端特有 UI 走插槽（`brand`/`topbar`/`topbarActions`/`railHeader`/
 *    `railFooter`/`banner`/`footer`/`overlay`），永远不需要改共享包；
 * 4. 契约只做加法：新增能力一律可选，缺席即降级（导航项隐藏 / UI 不渲染）。
 *
 * 视觉：令牌与外壳样式在 `src/styles/admin-theme.css`，全部 scope 在 `.mgac`
 * 根类下，经 package.json 的 `./theme.css` 导出；消费方以
 * `import '@mo-gallery/admin-console/theme.css'` 引入一次即可。
 */

export type {
  AdminCapabilities,
  AdminHostAdapter,
  AdminLabels,
  AdminLinkRenderer,
  AdminNavItem,
  AdminUser,
} from './adapters'
export { DEFAULT_ADMIN_LABELS, resolveAdminLabels } from './adapters'

export { AdminRuntimeProvider, useAdminRuntime } from './runtime/AdminRuntimeProvider'
export type { AdminRuntime, AdminRuntimeProviderProps } from './runtime/AdminRuntimeProvider'

export { AdminShell } from './shell/AdminShell'
export type { AdminShellProps } from './shell/AdminShell'
export { AdminRail, isCapabilityAvailable } from './shell/AdminRail'
export type { AdminRailProps } from './shell/AdminRail'
export { AdminTopbar } from './shell/AdminTopbar'
export type { AdminTopbarProps } from './shell/AdminTopbar'

export { AdminModal, AdminDrawer } from './ui/AdminOverlay'
export type { AdminModalProps, AdminDrawerProps, AdminModalTone } from './ui/AdminOverlay'
export { AdminPortalLayer, useEscapeToDismiss } from './ui/portal'
export type { AdminPortalLayerProps } from './ui/portal'
export { AdminField } from './ui/AdminField'
export type { AdminFieldProps } from './ui/AdminField'
export { AdminButton } from './ui/AdminButton'
export type { AdminButtonProps, AdminButtonSize, AdminButtonVariant } from './ui/AdminButton'
export { AdminConfirmDialog } from './ui/AdminConfirmDialog'
export type {
  AdminConfirmDialogProps,
  AdminConfirmOption,
  AdminConfirmOptionsGroup,
  AdminConfirmTone,
} from './ui/AdminConfirmDialog'
export { AdminSwitch } from './ui/AdminSwitch'
export type { AdminSwitchProps } from './ui/AdminSwitch'
export { AdminSkeleton } from './ui/AdminSkeleton'
export type { AdminSkeletonProps } from './ui/AdminSkeleton'
