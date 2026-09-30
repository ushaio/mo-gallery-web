/**
 * @mo-gallery/admin-console — 后台管理台共享外壳与设计系统。
 *
 * 架构约束（与 `@mo-gallery/public-site` 同款，改代码前先读 README）：
 * 1. 共享包只提供**结构 + 观感**：导航配置（`ConsoleNavItem[]`）、能力表
 *    （`ConsoleCapabilities`）、用户身份、链接渲染与文案全部由宿主注入；
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
  ConsoleCapabilities,
  ConsoleHostAdapter,
  ConsoleLabels,
  ConsoleLinkRenderer,
  ConsoleNavItem,
  ConsoleUser,
} from './adapters'
export { DEFAULT_CONSOLE_LABELS, resolveConsoleLabels } from './adapters'

export { ConsoleRuntimeProvider, useConsoleRuntime } from './runtime/ConsoleRuntimeProvider'
export type { ConsoleRuntime, ConsoleRuntimeProviderProps } from './runtime/ConsoleRuntimeProvider'

export { ConsoleShell } from './shell/ConsoleShell'
export type { ConsoleShellProps } from './shell/ConsoleShell'
export { ConsoleRail, isCapabilityAvailable } from './shell/ConsoleRail'
export type { ConsoleRailProps } from './shell/ConsoleRail'
export { ConsoleTopbar } from './shell/ConsoleTopbar'
export type { ConsoleTopbarProps } from './shell/ConsoleTopbar'

export { ConsoleModal, ConsoleDrawer } from './ui/ConsoleOverlay'
export type { ConsoleModalProps, ConsoleDrawerProps, ConsoleModalTone } from './ui/ConsoleOverlay'
export { ConsolePortalLayer, useEscapeToDismiss } from './ui/portal'
export type { ConsolePortalLayerProps } from './ui/portal'
export { ConsoleField } from './ui/ConsoleField'
export type { ConsoleFieldProps } from './ui/ConsoleField'
export { ConsoleButton } from './ui/ConsoleButton'
export type { ConsoleButtonProps, ConsoleButtonSize, ConsoleButtonVariant } from './ui/ConsoleButton'
export { ConsoleConfirmDialog } from './ui/ConsoleConfirmDialog'
export type {
  ConsoleConfirmDialogProps,
  ConsoleConfirmOption,
  ConsoleConfirmOptionsGroup,
  ConsoleConfirmTone,
} from './ui/ConsoleConfirmDialog'
export { ConsoleSwitch } from './ui/ConsoleSwitch'
export type { ConsoleSwitchProps } from './ui/ConsoleSwitch'
export { ConsoleSkeleton } from './ui/ConsoleSkeleton'
export type { ConsoleSkeletonProps } from './ui/ConsoleSkeleton'
export { ConsoleAuthImage, useConsoleAssetUrl, isDirectAssetUrl } from './ui/ConsoleAuthImage'
export type { ConsoleAssetFetcher, ConsoleAuthImageProps } from './ui/ConsoleAuthImage'
