# Zine / 摄影书编辑器 — 设计文档

- 日期: 2026-07-04
- 目标: 在 desktop 端新增 Zine 菜单，制作个人摄影书 / Zine，导出 PDF
- 范围: 桌面端（Wails + React 19），不动 mo-gallery-web 与 Prisma schema

## 1. 关键决策（已与用户确认）

| 维度 | 决策 | 理由 |
|------|------|------|
| 持久化 | 本地草稿（IndexedDB）+ 可选文件备份 | 无 Go/Prisma 改动，沿用 `@/lib/client-db.ts` 模式，离线可用 |
| 图片来源 | 图库照片 + 本地文件均可 | 图库走 `GetPhotos` 绑定；本地文件走 Wails 文件对话框 |
| PDF 导出 | `@react-pdf/renderer` | 文本矢量、可选；与 Slot 盒子模型对齐 1:1 |
| 画布 | HTML/CSS div + `react-moveable` | DOM 可访问性、Tailwind 主题、与 react-pdf 双渲染管线共用数据 |
| 节奏 | MVP 先行，迭代补齐 | 最快可用 |

## 2. MVP 范围（第一批落地）

1. **项目管理**：新建 / 列表 / 打开 / 删除 / 重命名（spec 第 1 项）
2. **跨页画布**：一次看一个跨页（左右两页），HTML 按比例缩放（第 2 项）
3. **模板**：内置 3 套 starter 模板（第 4 项的 MVP 子集）
   - `single-photo-full`: 左右各整图 1 张
   - `two-up`: 每页上下两张
   - `text-left-photo-right`: 文字页 + 图片页
4. **手动排版**：从图片抽屉拖图入槽 + 移动 / 缩放 / 旋转手柄（第 5、8 项的范围）
5. **标题 / 简单文字块**：每槽可贴标题（Tiptap 简化，纯文本+粗体），不含页码（第 7 项的部分）
6. **保存草稿 + 继续编辑**：自动保存（300ms 防抖），IndexedDB（第 10 项）
7. **导出 PDF**：标准分辨率（屏幕 DPI），跨页布局正确，文本可选中（第 3 项）

## 3. 迭代一（MVP 后续，不在本 spec 实现，仅占位）

- 封面 / 封底编辑器（第 6 项）
- 图片裁切专用工具（第 8 项的裁切）
- 页码自动生成（第 7 项）
- 自动排版：按图集自动套模板（第 5 项的自动分支）
- 翻页预览动效（framer-motion 翻书）（第 9 项）
- 高清印刷导出：300 DPI 嵌入 / 出血标记 / CMYK 安全色（第 11 项）
- 图片滤镜：黑白/复古/双色调（CSS 预览 + 入 PDF 前 canvas 预处理）

## 4. 文件结构

```
desktop/frontend/src/
├── pages/
│   ├── ZinePage.tsx                     # 项目列表 + 新建 + 草稿恢复入口
│   └── zine/
│       └── ZineEditorPage.tsx           # 编辑器主界面（Outler 级组件）
├── components/zine/
│   ├── ZineEditor.tsx                   # 编辑器主体（容器 + 状态分发）
│   ├── SpreadCanvas.tsx                 # 单跨页画布（HTML 按比例渲染）
│   ├── SlotView.tsx                     # 单槽：图或文字 + 变换手柄
│   ├── SlotImageContent.tsx             # 图片槽内容（裁切/缩放/旋转 inner transform）
│   ├── SlotTextContent.tsx              # 文字槽内容（简化 Tiptap）
│   ├── ZineToolbar.tsx                  # 顶部：模板 / 尺寸 / 导出 / 撤销重做
│   ├── TemplateGallery.tsx              # 模板选择抽屉
│   ├── PhotoTray.tsx                    # 底部图槽：图库 Tab + 本地导入 Tab
│   ├── PhotoTrayLibrary.tsx             # 图库列表（GetPhotos + 懒加载缩略图）
│   ├── PhotoTrayLocalImport.tsx         # 本地文件导入（Wails 文件对话框）
│   ├── PageStrip.tsx                    # 右侧缩略图侧栏（翻页 / 加页 / 删页）
│   ├── PageThumb.tsx                    # 跨页缩略图迷你渲染
│   └── export/
│       └── ZinePdfExporter.tsx          # @react-pdf/renderer 渲染管道
├── store/
│   └── zine.ts                          # Zustand: 当前工程 + 跨页 + 选中槽 + 历史
├── lib/
│   ├── zine/
│   │   ├── types.ts                     # ZineProject / Spread / Slot 类型
│   │   ├── templates.ts                 # 声明式模板描述符 + 命名集合
│   │   ├── page-sizes.ts                # A4 / A5 / Letter / Square (mm)
│   │   ├── slot-render.ts               # 共享渲染模型 → react-pdf 节点 / HTML props
│   │   ├── project.ts                   # CRUD 工程到 IndexedDB
│   │   └── history.ts                   # undo/redo (状态快照栈)
│   └── client-db.ts (扩展)              # 加 ZineDraftData + zine_assets (Blob) 存储
```

侧边栏 `desktop/frontend/src/components/layout/Sidebar.tsx` 的 `navItems` 数组追加一条 `{ path: '/zine', icon: BookMarked, key: 'admin.zine' }`（图标与"图片日志"区分，采用 `Library` 或 `BookImage` lucide 图标）。

`desktop/frontend/src/App.tsx` 路由追加：
- `/zine` → `ZinePage`
- `/zine/editor/:projectId` → `ZineEditorPage`

i18n 在 `desktop/frontend/src/lib/i18n.ts` 加 `admin.zine`、`admin.zine_editor` 等键。

## 5. 数据模型（`lib/zine/types.ts`）

```ts
// 单位约定：槽内坐标/尺寸 = mm（印刷空间），渲染时按当前画布缩放因子转 px
// 旋转/缩放 = 内层 transform 相对外框

export type ZinePageSize = 'a4' | 'a5' | 'letter' | 'square'

export interface ZineProject {
  id: string                // cuid() 草稿 id
  title: string
  pageSize: ZinePageSize    // 单页尺寸，跨页 = 宽 × 2
  pageOrientation: 'portrait' | 'landscape'
  createdBy: string         // localStorage 用户名（来自 AuthContext）
  createdAt: number
  updatedAt: number
  spreads: Spread[]         // 跨页序列
  assets: ZineAsset[]       // 工程引用的图片资产
}

export interface Spread {
  id: string
  templateId: string        // 引用 templates 命名之一；空则 = custom
  slots: Slot[]
}

export type SlotKind = 'image' | 'text'

export interface SlotBase {
  id: string
  kind: SlotKind
  page: 'left' | 'right'               // 跨页内所在页
  // 坐标系约定：x/y/w/h 均为 mm，相对其所在页（左页或右页）原点。
  // 跨页渲染与 PDF 导出时，page=right 的槽位在原 x 基础上额外偏移 pageW。
  x: number; y: number; w: number; h: number
  rotation: number          // 度，外框旋转
  zIndex: number
}

export interface ImageSlot extends SlotBase {
  kind: 'image'
  assetId: string            // 引用 ZineAsset.id
  // 内层图片变换（裁切/缩放/平移）：相对 Slot 的 0..1 归一化
  imageTransform: {
    scale: number             // 1.0 = 充满 Slot 长边
    offsetX: number           // 相对 Slot 中心，单位 = Slot 的宽比例
    offsetY: number
    rotation: number           // 度（与外框相加 = 渲染旋转）
  }
}

export interface TextSlot extends SlotBase {
  kind: 'text'
  content: string              // 内联轻量 markdown：**加粗** / 换行
  align: 'left' | 'center' | 'right'
  fontSize: number             // pt，印刷空间
  lineHeight: number
  color: string                // hex
  fontFamily: string           // CSS font-family
}

export type Slot = ImageSlot | TextSlot

export interface ZineAsset {
  id: string
  source: 'library' | 'local'
  // library: 引用库内照片（持久化到 PhotoID 缓存路径、URL、缩略 URL）
  libraryPhotoId?: string
  // local: 本地文件的 blob URL + IndexedDB 存储 blob（备份）
  blobId?: string              // IndexedDB 'zine_assets' store key
  fileName: string
  width: number                // 像素
  height: number
  dpi?: number                 // 推断/读取，导出印刷时使用
  // 缓存预览 URL：本地用 blob URL，库内用 thumbnailUrl
  previewUrl: string
  fullUrl: string              // 高清导出时取用
  createdAt: number
}
```

## 6. 模板描述符（`lib/zine/templates.ts`）

声明式：纯数据，由 `SlotView` 与 `ZinePdfExporter` 同时消费。

```ts
export interface TemplateDef {
  id: string
  nameKey: string             // i18n key
  pageLayout: 'single' | 'two-up' | 'text-photo'
  buildSlots: (pageW: number, pageH: number) => Omit<SlotBase, 'id' | 'kind'>[]
}
```

MVP 内置 3 套（见 §2）。模板 `buildSlots` 返回不带 `id / kind`，应用层补默认 `kind: 'image'` 并赋 id；文字模板内含 1 个 `text` 槽，编辑层允许用户切换槽类型（实际通过"替换为文字/图片"工具按钮触发，描述符不变）。

## 7. 状态管理（`store/zine.ts`）

Zustand store：

```ts
interface ZineStore {
  project: ZineProject | null
  activeSpreadId: string | null
  selectedSlotId: string | null
  dirty: boolean
  saving: boolean
  // 历史
  undoStack: Spread[][]        // 操作前 spreads 快照
  redoStack: Spread[][]
  // 操作
  loadProject(id): Promise<void>
  createProject(opts): void
  updateSpread(id, patch): void
  addSpread(templateId?): void
  removeSpread(id): void
  setActiveSpread(id): void
  selectSlot(id | null): void
  updateSlot(spreadId, slotId, patch): void
  replaceSlotKind(spreadId, slotId, newKind): void
  addAsset(asset): ZineAsset
  rename(title): void
  // 历史
  pushHistory(): void
  undo(): void
  redo(): void
  // 持久化
  save(): Promise<void>        // 防抖调用
  autosaveTimer: number | null
}
```

- 历史粒度：每次"主动变更 spreads 前调 `pushHistory()`"（拖动结束、模板应用、加/删页、替换槽类型）。
- 历史上限：50 步。
- 自动保存：300ms 防抖；保存成功 `dirty=false`；保存失败 toast。
- 旁路存储：所有 `ZineAsset.blob` 进 IndexedDB `zine_assets` store（独立 store）。

## 8. 渲染管线

### 8.1 屏幕（`SpreadCanvas + SlotView`）

- 跨页依据当前容器宽度计算缩放因子 `scale = containerW / (pageW_mm * 2 + gutter_mm)`，所有 mm 坐标转 px。
- 每槽是绝对定位 div：
  ```
  <div style={{ position:'absolute', left, top, width, height, transform:`rotate(${rot}deg)`, zIndex, overflow:'hidden' }}>
    <SlotImageContent/> 或 <SlotTextContent/>
  </div>
  ```
- `react-moveable` 接到选中槽的外框 ref，提供：
  - 8 向 resize（按住 Shift 锁定比例）
  - 旋转手柄
  - 拖动
  - 缩放/旋转吸附到 0/45/90°（容差 3°）
- 图片内层：
  ```
  <img style={{ width:100%, height:100%, objectFit:'cover',
    transform:`scale(${scale}) translate(${ox}%, ${oy}%) rotate(${rotation}deg)` }} />
  ```
  双击进入"图片内编辑态"：内层拽动调 offset、滚轮调 scale，按 Esc 退出外层框可拖。
- 文字槽：渲染 markdown 子集，`contentEditable` 直接编辑（双向同步 `content`）；按 Cmd/Ctrl+B 粗体（MVP 简化，不用 Tiptap，迭代期替换为 Tiptap 以支持更多元素）。

### 8.2 导出（`ZinePdfExporter`）

- 工具栏触发 → 弹"导出选项"小弹窗（MVP 仅：文件名 + 是否含出血 3mm）
- 选确认 → 切到 `react-pdf/renderer` 的 `<Document>`：
  - 工程 spreads 列表 → 每跨页一个 `<Page size={[pageW_mm*2, pageH_mm]}>`
  - 槽位映射到 `<View style={{ position:'absolute', ... }}>`，按 `slot-render.ts` 共享函数生成 `style`
  - `<Image>` 取 `fullUrl`，其 `style` 翻译 `imageTransform`
  - `<Text>` 翻译 `TextSlot`
- 渲染完成 → `saveAs(blob, fileName)`（浏览器自动下载到默认路径；桌面端 Wails 浏览器内核行为）
- 进度条（导出可能 1-3 秒）

### 8.3 共享渲染模型（`lib/zine/slot-render.ts`）

```ts
// 屏幕侧与导出侧共享的渲染结果。两边各自把它转成自己的样式协议。
interface RenderedSlot {
  // 用于 HTML/CSS：直接变成 React.CSSProperties
  htmlStyle: React.CSSProperties
  // 用于 @react-pdf/renderer：键名/单位略有差异（如 color 用字符串、尺寸用 mm 数字、无 transform 拼接）
  pdfStyle: Record<string, string | number>
  // 子节点：图片内层 transform 拆分，或文字内联内容
  imageInner?: { src: string; style: React.CSSProperties; pdfStyle: Record<string, string | number> }
  text?: { content: string; htmlStyle: React.CSSProperties; pdfStyle: Record<string, string | number> }
}
renderSlot(spread: Spread, slot: Slot, pageWmm: number, pageHmm: number): RenderedSlot
```

屏蔽 CSS 与 react-pdf 样式协议差异，避免两边各写一遍。

## 9. 错误处理

| 场景 | 处理 |
|------|------|
| IndexedDB 草稿读写失败 | toast 提醒，自动保存退避 5 秒后重试一次；主保存失败置 `dirty=true` 不丢标记 |
| 库照片取不到（链接失效） | 槽回退占位灰底 + 文件名；导出时跳并为占位 |
| 本地 blob 丢失（IndexedDB 清理） | 同上 |
| 导出 PDF 中途失败 | toast 报错；保存进度不丢，但布局未完成时不动 store |
| react-pdf 不支持的样式 | `slot-render` 内做静态映射降级（如 backdrop-filter） |
| 模板加载与工程旧模板 id 不匹配 | 回退到空模板，spreads 保留槽位 |
| 文字 markdown 不识别 | 直接渲染原字符串 |
| 自动保存锁定 / 多开同工程 | MVP 单工程同时打开 -> 第二个开窗 toast 提示"已在他处打开"，强制只读 |

## 10. 测试

无统一测试框架（与 AGENTS.md 一致）。

- 单元 / 纯函数：`lib/zine/` 模板 `buildSlots` 与 `slot-render` 的 renderSlot，加进 `tests/zine-slot-render.test.ts`。
- 类型安全：`pnpm typecheck` / `cd desktop/frontend && npm run build`（tsc + vite build）作为门禁。
- 手验流程（spec 附带验证清单，实现完成后逐项勾选）：
  1. 新建工程 / 重命名 / 列表显示
  2. 拖本地文件到 PhotoTray → 出现在底抽屉
  3. 从图库 Tab 选照片 → 出现
  4. 把照片拖到槽 → 显示
  5. 选中槽 → 显示 8 手柄 / 旋转手柄 → 拖拽改变；旋转吸附
  6. 双击图片 → 内层调整 → 确认
  7. 文字槽 → 双击编辑 → 加粗生效
  8. 切换跨页（缩略图侧栏）→ 渲染正确
  9. 加页 / 删页
  10. 关闭工程重开 → 草稿恢复 + 图片仍在
  11. 导出 PDF → 在桌面打开 → 文字可选 / 跨页布局正确
  12. 撤销 / 重做
  13. 暗色模式下 UI 不破

## 11. 与现有架构的兼容点

- 不改 `desktop/main.go` 的绑定（库照片复用现有 `GetPhotos` 返回）
- 不改 Prisma / GORM schema
- 不改 AuthContext / SettingsContext
- 上传队列（`UploadQueueContext`）与 Zine 不耦合：Zine 引用库内照片即引用已上传的；如有新图想同时入库，请用户自行到"上传"页上传，再回 Zine 取用（MVP 不做"导入到库"快捷按钮）
- Wails 文件对话框：通过 `window.go.main.App.OpenFileDialog(filter)` 调原生选择器（如已存在则用，否则 MVP 期可在 `app.go` 加薄绑定方法）

## 12. 依赖增量

`desktop/frontend/package.json` 新增：
```json
{
  "dependencies": {
    "@react-pdf/renderer": "^4.x",
    "react-moveable": "^0.6x",
    "cuid": "^3.x"
  }
}
```
（具体版本以安装时 `pnpm add` 解析出的最新稳定版为准；不并发升级其他既有包，避免连锁回归）

## 13. 实施批次（交付给后续 plan）

1. **骨架**：路由、侧边栏、空 ZinePage、空 ZineEditorPage、Zustand store 雏形、types、client-db 扩展
2. **项目管理**：列表 / 新建 / 删除 / 自动保存 / 草稿恢复
3. **跨页画布 + 模板**：SpreadCanvas 渲染、3 套模板、PageStrip 翻页
4. **手动排版**：react-moveable 集成、PhotoTray（本地导入 + 图库）、拖图入槽
5. **文字槽**：简化 markdown + contentEditable
6. **导出 PDF**：react-pdf 渲染管道、进度条
7. **撤销重做 + 暗色适配 + 测试 + 验证清单**

> 具体 plan 由 writing-plans 拆解；MVP 完工后 spec 第 3 节迭代项再开新 spec。
