# Tiptap 编辑器体验优化 Discovery

- 状态：访谈完成，阶段 1-2 部分实施
- 日期：2026-08-04
- 范围：`packages/tiptap-editor` 共享编辑器及 Web/Desktop Story、Blog 宿主
- 目标：优先采用 Tiptap 官方扩展、UI Components 与交互模式，在其上扩展 MO Gallery 的叙事写作、照片和 AI 能力

## 1. 当前实现基线

1. Web 与 Desktop 通过 `@mo-gallery/tiptap-editor` 共用编辑器核心，各端只注入 i18n、主题、API 与 AI 运行时。
2. 编辑器基于 Tiptap 3.27.1，使用 StarterKit、Placeholder、Link、Underline、TextAlign、Table、可缩放图片等扩展。
3. 当前已有固定顶栏、选区 Bubble Menu、空段落 Floating Menu、块拖拽手柄、图片粘贴、媒体链接转换、故事链接卡片、表格、颜色、字体和 AI 侧栏。
4. 内容同时输出 HTML 与 Tiptap JSON；Story 与 Blog 共用核心编辑器，但宿主保存和素材入口不同。
5. AI 任务期间编辑器进入锁定态，结构化编辑以单次事务和原生历史边界提交。

## 2. 已观察到的体验问题候选

以下是代码审查得到的候选问题，需由访谈确认优先级：

- 固定工具栏一次暴露大量格式项，横向溢出依赖滚动，功能发现与写作专注之间缺少分层。
- 固定工具栏、Bubble Menu、Floating Menu 存在功能重复，但不同入口覆盖的命令集合不一致。
- 空段落 Floating Menu 实际是少量快捷按钮，不具备搜索、分组、键盘导航和自定义内容插入能力。
- 链接与图片 URL 使用工具栏内绝对定位输入框，缺少统一 Popover、校验、编辑/移除和点击外部关闭语义。
- 图片粘贴由自定义 `handlePaste` 接管，尚未采用官方 FileHandler 统一处理粘贴与拖放。
- 表格只能直接插入固定 3x3，缺少插入尺寸选择与单元格上下文操作。
- 块拖拽只有手柄，没有与块菜单配套的复制、删除、转换、前后插入等动作。
- 工具栏键盘模型尚未达到官方无障碍指南提出的 Alt+F10、方向键导航与 Esc 返回编辑区模式。
- H1-H6、字体、字号、颜色、段落样式全部并列，内容语义与视觉装饰未分层。
- 当前组件约 1177 行，命令、菜单状态、AI 编排和布局集中在同一文件，继续扩展会放大交互状态冲突风险。

## 3. 官方优先基线

优先评估下列官方方案，再决定是否自定义：

1. 免费 Simple Editor Template：响应式工具栏、Heading/List 下拉、Link Popover、Image Upload、Undo/Redo、Selection 与 Trailing Node。
2. Tiptap UI Components：Button、Toolbar、Tooltip、Popover、Dropdown/Menu 等可访问组件及配套 hooks。
3. Slash Dropdown Menu：以 `/` 触发、搜索过滤、分组、键盘导航，并支持 customItems；其生产许可要求需单独确认。
4. FileHandler：统一文件 paste/drop 事件、MIME 限制和消费粘贴事件的规则，上传仍由宿主实现。
5. TableKit 与 Table commands：统一表格扩展，并提供增删行列、合并拆分、表头切换等命令。
6. BubbleMenu、FloatingMenu、Drag Handle、Selection、Trailing Node、UniqueID 等官方扩展或模式。
7. 官方 UI Components 当前文档提示 React 19 兼容仍在推进，正式采用前必须做共享包兼容性验证。

## 4. 官方参考

- https://tiptap.dev/docs/ui-components/templates/simple-editor
- https://tiptap.dev/docs/ui-components/components/overview
- https://tiptap.dev/docs/ui-components/components/slash-dropdown-menu
- https://tiptap.dev/docs/editor/extensions/functionality/filehandler
- https://tiptap.dev/docs/editor/extensions/functionality/table-kit
- https://tiptap.dev/docs/guides/accessibility
- https://tiptap.dev/docs/editor/getting-started/install/react

## 5. 首轮已确认决策

1. 产品采用渐进式块编辑：保留连续富文本写作，同时加入 `/` 菜单、块手柄、块菜单和节点上下文工具。
2. 优化直接落在共享包，Story/Blog、Web/Desktop 保持一致，不建立长期试点分支。
3. 第一阶段优先提升写作与功能发现效率，媒体、移动端和无障碍作为必要质量门槛而非首要产品目标。
4. 仅采用免费官方模板、MIT 扩展和官方公开模式；不依赖 Tiptap Start 或更高商业计划组件。
5. 付费 Slash Dropdown Menu 不直接引入，但可依据其公开交互模型，使用 Suggestion 等免费基础能力实现项目自有 Slash Menu。

## 6. 第二轮已确认决策

1. 固定主工具栏采用“精简主栏 + 更多菜单”：常驻高频写作动作，低频与视觉格式进入分组菜单。
2. `/` 菜单第一阶段覆盖结构块与内容插入：标题、列表、引用、代码、分隔线、图片、媒体、表格和故事卡片。
3. 块手柄点击后提供块类型转换、复制、删除、前后插入，同时保留拖拽移动。
4. 字体、字号、颜色、高亮、对齐和首字下沉全部保留，但降为次级格式能力，不再平铺占据主工具栏。

## 7. 第三轮采用的默认决策

> 本轮访谈超时，以下采用推荐选项作为后续设计基线；若实现前被明确修改，应更新对应 ADR。

1. 图片采用上传优先、URL 次级流程；文件选择、拖放和粘贴统一进入上传占位，失败可重试或替换。
2. 文本链接采用统一链接 Popover，支持创建、编辑、移除、复制、打开和 URL 校验。
3. 表格采用网格选择行列插入，并提供增删行列、表头、合并拆分和删除等上下文工具。
4. 窄屏使用紧凑主工具栏；插入、格式和更多命令使用底部面板，Bubble Menu 保持轻量。

## 8. 最终采用的默认决策

> 本轮访谈超时，以下采用推荐选项作为后续设计基线；若实现前被明确修改，应更新对应 ADR。

1. 外部粘贴保留标题、列表、引用、链接和基础 marks，清理来源字体、字号、颜色、背景和布局样式。
2. 保存反馈纳入共享编辑器体验：宿主注入保存状态，编辑器统一展示已保存、保存中、未保存、失败和重试。
3. AI 固定侧栏继续承载会话；Bubble Menu、Slash Menu 和块菜单仅提供向侧栏发送选区/块上下文的快捷入口。
4. 旧 HTML/JSON 采用增量 schema 与惰性归一化：保持读取兼容，编辑/保存时非破坏性规范化，显式版本化并保留回滚路径。

## 9. 访谈结论

访谈已形成四个 ADR、领域模型、术语表、完整规格和验证矩阵。当前已完成命令注册表、主工具栏分层、Bubble/Floating Menu、Drag Handle 和基础焦点/窄屏交互；Slash、块菜单、统一上传状态机、媒体与表格增强仍按后续阶段推进，且不得在验证矩阵中提前标记完成。

## 6. 暂不做假设

- 不默认引入实时协作、评论、版本快照或 Tiptap Cloud。
- 不默认移除现有字体、字号、颜色、首字下沉、故事卡片和 AI 能力。
- 不默认将编辑器改造成完整 Notion 克隆。
- 不默认改变现有 HTML + JSON 双存储协议。
