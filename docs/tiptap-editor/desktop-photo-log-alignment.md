# Desktop 端照片日志模块对齐 Web 端 — 差异标注与替代方案

> 生成日期：2026-06-27
> 对照基准：Web 端 `src/app/admin/logs/` + `src/components/TipTapAiAssistant.tsx` + `src/components/NarrativeTipTapEditor.tsx`
> 对齐目标：Desktop 端 `desktop/frontend/src/pages/admin-logs/` + `desktop/frontend/src/pages/PhotoJournalPage.tsx` + `desktop/frontend/src/components/`

## 一、对齐结果总览

| 模块 / 文件 | 对齐状态 | 说明 |
| --- | --- | --- |
| `stories/*`（8 文件） | 已 1:1 同步 | 0 diff（CRLF 归一化后） |
| `tiptap-editor/*`（9 文件） | 已 1:1 同步 | 0 diff |
| `tiptap-extensions/*`（11 文件） | 已 1:1 同步 | 0 diff |
| `tiptap-editor.css` | 已 1:1 同步 | 0 diff |
| `client-db.ts`（草稿存储层） | 已 1:1 同步 | 0 diff |
| `lib/api/story-ai.ts`（AI API 层） | 已 1:1 同步 | 0 diff |
| `TipTapAiAssistant.tsx` | 已 1:1 移植 | 1598 行内嵌浮窗，替换原 stub |
| `PhotoJournalPage.tsx` | 已对齐 | 补全 drafts 子标签，三 tab 聚合页 |
| `NarrativeTipTapEditor.tsx` | 平台适配差异 | 2 行（见下） |
| `BlogTab.tsx` / `StoriesTab.tsx` | 平台适配差异 | 仅 import 路径（见下） |
| `stories/constants.tsx` | 平台适配差异 | dynamic import 处理（见下） |

## 二、已完成的补全工作

### 1. TipTapAiAssistant 内嵌浮窗移植（高优先级）

- **原状**：Desktop 端 `TipTapAiAssistant.tsx` 为 stub（返回 `null`），编辑器内 AI 助手功能缺失。
- **对齐方式**：将 Web 端 1598 行完整组件 1:1 复制到 Desktop 端。Web 端该组件无任何 Next.js 特定 API（无 `next/navigation`、`next/dynamic`、`next/image`），依赖的 `@/lib/api`（AI 函数已通过 `export * from './api/story-ai'` 导出）、`@/contexts/LanguageContext`、`framer-motion`、`lucide-react` 在 Desktop 端均可用，故零修改直接复制。
- **验证**：`tsc --noEmit` 通过；Desktop 端 `NarrativeTipTapEditor.tsx` 第 872 行已正确传入 `options={aiOptions}`，`StoryEditorView.tsx` 第 203-205 行传入 `aiOptions={{ enabled, token, scopeId, title }}`，token 链路完整。
- **覆盖能力**：流式生成、会话管理（创建/切换/删除/清空）、slash 命令、replace/insert/append 三种应用模式、模型选择、上下文同步、浮窗拖拽、移动端/桌面端响应式。
- **启用范围**：故事编辑器（StoryEditorView）启用 AI 助手；博客编辑器（BlogTab）两端均未传 `aiOptions`，与 Web 设计一致，AI 助手不启用。

### 2. drafts 子标签补全（高优先级）

- **原状**：Desktop 端 `PhotoJournalPage.tsx` 只有 stories + blog 两个 tab，无草稿聚合管理视图。Web 端 `logs/page.tsx` 含 stories / blog / drafts 三 tab。
- **对齐方式**：重写 `PhotoJournalPage.tsx`，移植 Web 端 `logs/page.tsx` 的完整 drafts 逻辑：草稿加载（IndexedDB）、三类型草稿分区展示（故事上传草稿/故事编辑器草稿/博客草稿）、搜索 + 类型筛选、草稿预览弹窗（framer-motion 动画）、删除确认、从草稿恢复编辑、双击刷新、草稿计数徽章。
- **UI 对齐**：采用 Web 端 `AdminButton adminVariant="tab"` 风格的三 tab 导航，替换原 Desktop 自定义 `TabButton`，确保视觉与交互与 Web 一致。

## 三、平台适配性差异（合理保留，非缺陷）

以下差异源于 Next.js（App Router + SSR）与 Vite（纯 CSR）的架构差异，属于必要的平台适配，不影响功能与交互一致性：

### 1. `NarrativeTipTapEditor.tsx`（2 行差异）

```diff
- editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
+ ;(editor.chain().focus() as any).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
```

- **原因**：Desktop 端 TypeScript 严格模式下 tiptap v3 的 `insertTable` 类型重载解析与 Web 端 Next.js 的 tsconfig 配置存在差异，Desktop 端需 `as any` 绕过。
- **替代方案**：当前 `as any` 是务实选择；长期可通过升级 `@tiptap/extension-table` 至 Web 端同版本（Web `^3.20.1` / Desktop `^3.27.1`）统一类型定义后移除。

### 2. `useNarrativeEditor.ts`（1 行差异）

```diff
+ // @ts-expect-error — tiptap v3 overload resolution
```

- **原因**：同上，Desktop 端 tsconfig 严格度差异导致需显式抑制类型错误。

### 3. `BlogTab.tsx` / `StoriesTab.tsx`（仅 import 适配）

| 差异点 | Web 端 | Desktop 端 | 原因 |
| --- | --- | --- | --- |
| 路由 | `useRouter` from `next/navigation` | `useNavigate` from `react-router-dom` | 框架差异 |
| 编辑器加载 | `dynamic(() => import(...), { ssr: false })` | 直接 `import` | Desktop 纯 CSR，无需避免 SSR |
| layout 路径 | `../layout` | `./layout` | 目录结构差异（Desktop `admin-logs/layout.tsx`） |

### 4. `stories/constants.tsx`

- **Web 端**：`export const NarrativeTipTapEditor = dynamic(() => import('@/components/NarrativeTipTapEditor'), { ssr: false, loading: ... })`
- **Desktop 端**：`export { default as NarrativeTipTapEditor } from '@/components/NarrativeTipTapEditor'`
- **原因**：Desktop 纯 CSR，无需 `dynamic` + `ssr: false`；loading 态由组件内部处理。

## 四、已修复的预存在问题

### `image-compress.ts` worker 构建失败（已修复）

- **现象**：`npm run build` 报错 `[vite:worker-import-meta-url] Invalid value "iife" for option "worker.format"`。
- **根因**：`src/lib/avif-worker.ts` 通过 `new Worker(new URL('./avif-worker.ts', import.meta.url))` 引入，worker 内部导入 `@jsquash/avif`（WASM 模块含动态导入）。Vite 默认 `worker.format: 'iife'`，而 IIFE/UMD 格式不支持代码分割，故构建失败。
- **修复**：在 `vite.config.ts` 添加 `worker: { format: 'es' }`。ES 格式支持代码分割，是处理含动态导入 worker 的标准做法。
- **验证**：修复后 `npm run build` 成功（`✓ built in 7.23s`），产出 `avif-worker-*.js`、`avif_enc-*.wasm` 等 worker 与 WASM 资产。
- **剩余警告**（无害）：
  - `exifreader` 同时被静态和动态导入，动态导入不会单独分块 — 不影响功能。
  - 主 chunk 1.56MB 超 500KB 警告 — 可后续通过 `manualChunks` 优化，与本次对齐无关。

## 五、AiAssistantPage 独立路由（保留）

Desktop 端保留 `/ai-assistant` 独立路由页面（`AiAssistantPage.tsx`），当前为占位页（标注 Phase 6 实现）。该页面与编辑器内嵌 AI 浮窗（`TipTapAiAssistant`）是两条独立路线：

- **编辑器内嵌浮窗**：已通过本次移植对齐 Web 端，在故事编辑器内提供上下文感知的 AI 辅助。
- **独立 AI 助手页**：Desktop 增强功能，可作为后续独立的 AI 对话工作台。Web 端无对应页面。

两者不冲突，独立 AI 助手页的开发不在本次照片日志模块对齐范围内。

## 六、验证清单

- [x] `tsc --noEmit` 类型检查通过（Desktop 端全量）
- [x] `npm run build` 构建成功（修复 worker.format 后）
- [x] TipTapAiAssistant 与 Web 端 0 diff
- [x] PhotoJournalPage drafts 子标签逻辑与 Web `logs/page.tsx` 对齐
- [x] 故事编辑器 AI 助手 token/scopeId/enabled 链路完整
- [x] 博客编辑器 AI 助手启用范围与 Web 一致（均不启用）
- [x] 草稿加载/预览/删除/恢复/搜索/筛选流程完整
- [ ] 浏览器端实际操作验证（建议在 Desktop 应用中手动验证：创建草稿→切到 drafts tab→预览→删除→从草稿恢复编辑→AI 助手浮窗交互）
