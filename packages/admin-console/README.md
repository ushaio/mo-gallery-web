# @mo-gallery/admin-console

后台管理台共享外壳与设计系统：**mo-gallery-web 的 `/admin`** 与 **mo-gallery-offical 的 `/admin`（平台管理）· `/console`（内容管理台）** 共用同一份外壳、设计令牌与原子件。

源头唯一：本包只在 `mo-gallery-shared` 里编辑，改完在 shared 仓库跑 `pnpm sync`，镜像会单向同步到三个消费方（web / offical / emulsion-desktop-v3）。**不要直接改消费方 `packages/admin-console/` 里的镜像文件**——`.mo-gallery-shared-sync.json` 有 sha256 漂移保护，手工改过会让 `pnpm sync` 直接报错退出。

## 为什么这样做

端与端的整体设计一致，但**各有针对性设计**（official 没有「存储整理」菜单、web 没有「云服务」页；同一个「日志」在两端甚至语义不同）。同步机制天生只能同步「相同的东西」，所以目标的不是「用同步吃掉差异」，而是：

> 两端都要有的东西只写一份（放本包）；只有一端有的东西有唯一归属（放宿主 `src/`）。
> `pnpm sync` 只覆盖 `packages/<name>`，从不碰宿主 `src/`，于是差异与同步在物理上互不干扰。

## 差异只允许出现在四处（差异登记点）

| # | 登记点 | 承载什么 | 例子 |
|---|---|---|---|
| 1 | `ConsoleNavItem[]` 导航配置 | 菜单项的有无、文案、图标、计数 | official 不注册 `storage` 项 |
| 2 | `ConsoleCapabilities` + `ConsoleNavItem.capability` | 「有没有这项能力」 | `capability: 'storage'` 且宿主未实现 → 该项自动隐藏 |
| 3 | 组件 props（含 `className`、后续的 columns/fields schema） | 同一块 UI 的参数差异 | 宽度档位、只读开关、列定义 |
| 4 | `ConsoleShell` 插槽 | 端特有的整块 UI | web 的上传进度浮窗、official 的代登录横幅 |

**共享包内部禁止宿主判断**（不写 `if (host === 'official')`）、禁止 `@/` 别名与直接 `next/navigation` / `next/link`、禁止 `server-only`。

包名保留 `@mo-gallery/admin-console`（它就是个管理控制台）；对外符号一律 `Console*`，CSS 命名空间为 `.mgac-*`（`mgac` = mo-gallery admin console）——三者是有意分工，不是历史遗留。

### 三问口诀（决定一块逻辑该不该下沉）

1. 另一端存在同一概念吗？否 → **留宿主**。
2. 两端差异能用同一份 props/schema 表达吗？否 → **留宿主**。
3. 下沉后需要在共享包里写宿主分支吗？会 → **选错了，退回宿主**。

### 差异登记表（新增差异先记账）

| 差异点 | 归属 | 处置 | 升级路径 |
|---|---|---|---|
| 菜单项有无（web：图库/上传/日志/内容库/存储整理/设置/友链；official：Skills/用户/云服务/日志/设置/IP） | 宿主 `nav` 配置 | 各自注册 | 两端都要 → 加 `capability` 成员 |
| web `/admin/logs`＝图文/故事/草稿管理；official `logs`＝登录与操作审计 | 两端各自 | **同名不同义，永不共享**（命名上区分 content / audit） | 无 |
| 删除等操作的副作用不同（本地库 vs 写 `OperationLog` 审计） | 宿主回调 | 共享组件只发事件，实现由宿主给 | 收敛后提为 capability |
| web 面板用 Tailwind/CVA，official 用自有 CSS | 宿主区 | 外壳统一走 `.mgac`，面板内部各写各的 | 面板按复用度逐个迁移 |
| 色彩/圆角/密度差异 | 宿主全局样式 | 覆盖 `--mgac-*` 令牌 | 若两端收敛 → 改本包默认值 |
| 确认弹窗的场景文案与色调（web：删除/批量；official：删除用户/改角色/封禁/重置密码/切换身份/退出） | 宿主映射 + `ConsoleConfirmDialog` 的 props | 宿主保留 `目标对象 → {title, description, tone, 按钮文案}` 映射，弹窗本体走共享件 | 映射若两端收敛 → 提为共享的 `confirmCopy` |
| 确认弹窗的附加字段（official：删除用户时「一并清除的数据」多选；web：无） | `options` 组（受控） | 宿主传 `items/selected/onToggle`，共享件只渲染 | 别的宿主也要同一组字段 → 直接复用该 schema |

### 已下沉件（阶段 1）

| 组件 | 两端接入方式 | 差异如何表达 |
|---|---|---|
| `ConsoleConfirmDialog` | web：`SimpleDeleteDialog`（22 处调用）改为薄包装，props 不变；official：`confirm-modal.tsx` 保留 `ConfirmTarget` 映射，弹窗本体换共享件 | 文案/色调/图标走 props；勾选项组走 `options`；执行动作走 `onConfirm` 回调 |
| `ConsoleButton` | 确认弹窗动作区使用；宿主可逐步替换自己的按钮件 | 变体 `default/primary/danger/outline/ghost/icon`、尺寸 `sm/md/lg` |
| `ConsolePortalLayer`（浮层挂载层） | Modal/Drawer/ConfirmDialog 共用，portal 到 `body` 并带上 `.mgac-portal` 令牌作用域 | 遮罩点击/Esc 由 `dismissible` + `busy` 控制 |

### 已下沉件（阶段 2）

| 组件 | 两端接入方式 | 差异如何表达 |
|---|---|---|
| `ConsoleModal`（补齐 `icon`/`tone`/`eyebrow`/`size`/`busy`） | official：`password-result-modal`（通知态）与 `ip-ban-modal`（表单态）改由它承载，两个文件里的 `mg-modal-*` 内联结构删除 | 图标与色调走 props；表单字段走 `children`；动作走 `footer`（`ConsoleButton`） |
| `ConsoleField` | official `ip-ban-modal` 的「封禁原因 / 时长 / 到期日期」用它包住原生控件 | 字段名、说明与错误全部由宿主传；控件本身不锁定表单库 |
| 弹窗体排版类（宿主直接用类名） | `.mgac-notice(.is-info/.is-warn/.is-column)`、`.mgac-code-box`、`.mgac-chip-list`、`.mgac-kv`、`.mgac-form-error`、`.mgac-input`/`.mgac-select`/`.mgac-textarea`、`.mgac-spinner`、`.mgac-modal.is-sm/.is-lg` | 同一套观感跨端复用；宿主也可用自己的类名覆盖 |

### 已下沉件（阶段 3）

| 组件 | 两端接入方式 | 差异如何表达 |
|---|---|---|
| `ConsoleModal`（`bodyClassName` + `busy` 收紧） | official：云图详情弹窗（`cloud-panel`）；web：重复照片、草稿恢复、上传设置、批量整理 4 个弹窗只换外壳，表单内容原样放 `children` | 标题/图标/色调/宽度档走 props；正文与动作走 `children`/`footer`；**`busy` 现在同时禁用 ✕、Esc 与遮罩关闭** |
| `ConsoleConfirmDialog`（复用既有 `options`） | web：URL 更新确认弹窗用受控勾选 + 动态 `confirmLabel` 表达「更新地址 / 仅保存配置」两个出口 | 两个动作合并为「勾选状态 → confirmLabel」，`onConfirm(boolean)` 语义留在宿主 |
| 浮层脱离宿主作用域的处置范式 | official 云图详情：`portal` 到 `body` 后 `--ac-*` 令牌失效，宿主在容器选择器里就地补齐令牌 + 用 0,3,0 特异性压过共享宽度档 | 这是"共享外壳 + 宿主自有设计令牌"共存时的标准做法，其它宿主照此办理 |

### 已下沉件（阶段 4）

| 组件 | 接入方式 | 差异如何表达 |
|---|---|---|
| `ConsoleAuthImage` / `useConsoleAssetUrl` / `isDirectAssetUrl` | **第一个带数据依赖的共享原子**：official console 的 `ConsoleImage`（19 个调用方）改为薄包装，其 222 行自建缓存删除；取流实现经 `fetcher` prop 或 `adapter.fetchAssetBlobUrl` 注入 | 宿主只提供「路径 → `blob:` 对象 URL」这一件事；缓存/引用计数/直链透传/`useSyncExternalStore` 的 SSR 快照/`forwardRef` 全在共享层。`scope` 用于会话切换后让旧 blob 失效 |
| `ConsoleConfirmDialog`（复用） | official console 的 `ConsoleDeleteDialog`（6 个调用方，原是 web 旧 `SimpleDeleteDialog` 的逐行拷贝）改为薄包装，framer-motion + `createPortal` 自绘外壳删除 | 与 web 的 `SimpleDeleteDialog` 现在是同一份实现、同一套观感；文案键与调用点零改动 |

**什么叫「带数据依赖的原子」**：组件需要宿主提供*能力*（取流、上传、查询），而不只是数据。此时把能力收敛成**一个最小函数签名**注入，不要注入整个 API 客户端——这样共享层仍不知道任何端点形状，宿主的差异也就只需要接线一次。


## 接入（宿主侧机械步骤）

```bash
# 1) mo-gallery-shared 改完源代码后
pnpm sync          # 生成三个消费方的 packages/admin-console 镜像
pnpm sync:check    # 校验（提交前 / CI）
```

```jsonc
// 2) 消费方 package.json
"@mo-gallery/admin-console": "workspace:*"
```

```ts
// 3) 消费方 next.config.ts
transpilePackages: [..., '@mo-gallery/admin-console']
```

```ts
// 4) 全局样式/布局里引入一次主题（只需一次）
import '@mo-gallery/admin-console/theme.css'
```

```tsx
// 5) 宿主最外层换成共享外壳，面板原样塞进 children
<ConsoleRuntimeProvider adapter={{ user, navigate, renderLink, labels }}>
  <ConsoleShell
    nav={HOST_NAV}                 // 端特有菜单只在这里体现
    activeId={activeId}
    onSelectNav={handleSelect}     // 单页 tab 模式；链接模式改传 item.href
    capabilities={HOST_CAPABILITIES}
    collapsed={collapsed}
    onToggleCollapse={toggle}      // 桌面 ☰（由外壳渲染）
    mobileOpen={mobileOpen}
    onOpenMobile={openMobile}      // 窄屏 ☰（由外壳渲染，宿主不必自己补按钮）
    onCloseMobile={closeMobile}    // 窄屏 ✕
    railLabel={t('admin.console')} // 侧栏 aria-label，走宿主 i18n
    brandHref={null}               // 品牌不可点（如它就是当前页标题）；默认 '/'
    railHeader={<HostBrand />}
    railFooter={<HostControls />}  // 折叠时仍可用：外壳改成纵向图标栈
    banner={impersonating ? <ImpersonationBanner /> : null}
    overlay={<UploadProgressPopup />}
  >
    {panelFor(activeId)}           {/* 端特有面板留在宿主 */}
  </ConsoleShell>
</ConsoleRuntimeProvider>
```

### 宿主可用钩子（避免各端重复打补丁）

| 钩子 | 作用 |
|---|---|
| `onOpenMobile` / `onCloseMobile` / `mobileOpen` | 窄屏抽屉的开/关入口由外壳渲染（≤900px），宿主只给状态 |
| `brandHref={null}` | 品牌区不包链接（默认包成指向 `brandHref` 的链接） |
| `railLabel` | 侧栏 `aria-label`，宿主的 i18n 文案 |
| `.mgac-rail-foot-text` | 宿主给纯文字标签挂上后，侧栏折叠时自动隐藏（折叠时底部区保留为纵向图标栈，控件不消失） |
| `className` / `contentClassName` | 宿主适配类（如整屏高度、全出血面板）：`@mo-gallery/admin-console/theme.css` 不在 `@layer` 里，宿主 CSS 与它同层靠权重覆盖即可，注意 Tailwind 工具类（layered）压不过包内同名属性 |

## 阶段与边界

- **阶段 0（当前）**：设计令牌 + 外壳（rail/topbar/content + 插槽）+ runtime + 纯展示原子件（Modal/Drawer/Switch/Skeleton）。面板与后端一律不动。
- **阶段 1+**：把「两端都在改」的件逐个上提（先纯展示件，再低争议面板）；不确定的一律先留宿主，上提永远可以后做。
- **不共享**：Hono 路由、Prisma schema、鉴权中间件、端特有数据模型与业务副作用。

**一次改动的生效范围**＝本包内 + 两端都挂载的东西（外壳、令牌、原子件）。端特有逻辑改它天然只影响一端，这不是共享机制失效，而是正确分工。
