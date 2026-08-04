# ADR-0001：采用渐进式块编辑与免费官方方案基线

- 状态：已接受
- 日期：2026-08-04

## 背景

当前共享编辑器已经具备固定工具栏、Bubble Menu、空段落 Floating Menu、Drag Handle、图片、媒体、表格、故事卡片和 AI 侧栏，但入口重复、工具栏密集、块级操作不完整。产品需要优化功能使用体验和交互，同时尽量沿用 Tiptap 官网方案并允许在其上扩展。

Tiptap 官方提供免费 Simple Editor Template、开源扩展和公开交互模式；部分完整 UI 组件（包括 Slash Dropdown Menu）需要商业计划。当前项目使用 React 19，而官方 UI Components 文档仍提示 React 19 兼容工作尚未完全结束。

## 决策

1. 编辑模型采用渐进式块编辑：普通输入仍是连续富文本体验，块能力通过 `/` 菜单、块手柄、块菜单和节点上下文工具逐步显露。
2. 实现落在 `packages/tiptap-editor`，Story/Blog 与 Web/Desktop 使用同一交互模型和命令层。
3. 第一阶段以写作效率和功能发现效率为主要成功标准。
4. 许可边界限定为免费官方模板、MIT/开源扩展及官方公开模式，不引入依赖 Tiptap Start 或更高商业计划的运行时代码。
5. 优先复用官方 Simple Editor Template 的响应式工具栏、Popover、Tooltip、Button、Image Upload 等设计和实现思路；引入前必须验证 React 19 与现有 Tailwind/主题体系兼容性。
6. Slash Menu 使用免费基础能力和项目代码实现，交互语义对齐官方公开示例，但不复制受限组件源码。
7. 自定义能力必须通过 Tiptap Extension、Command、Plugin、NodeView、Suggestion 或 transaction/history 体系实现。

## 未采用的方案

### A. 继续扩展传统固定工具栏

放弃原因：当前工具栏已横向溢出，继续平铺命令会进一步降低发现效率和窄屏可用性。

### B. 改造成完整块编辑器

放弃原因：Story/Blog 的主要任务仍是连续叙事写作，强制块心智会增加简单写作成本。

### C. 直接采用付费 Slash Dropdown Menu

放弃原因：用户明确要求仅使用免费官方方案，项目需要保持无商业组件运行时依赖。

### D. 各宿主分别试点和维护

放弃原因：编辑器已经共享，分叉会导致 Story/Blog、Web/Desktop 的命令位置、快捷键和文档行为不一致。

## 后果

- 需要建立统一命令注册表，为固定工具栏、Bubble Menu、Slash Menu、块菜单和节点工具复用。
- 需要重构当前大型编辑器组件，将命令、菜单状态、节点工具和 AI 编排拆分为清晰边界。
- 需要对 Web/Desktop、Story/Blog 做一致性回归验证。
- 商业协作、评论、版本历史等能力不因本 ADR 自动进入范围。
