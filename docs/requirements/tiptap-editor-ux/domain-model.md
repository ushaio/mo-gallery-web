# Tiptap 编辑器体验优化领域模型

- 状态：访谈草案
- 日期：2026-08-04

## 1. 核心对象

| 对象 | 当前含义 | 待确认边界 |
|---|---|---|
| Narrative Document | Story 或 Blog 的可编辑叙事内容，以 Tiptap JSON 为结构事实并兼容 HTML 输出 | Story/Blog 是否允许不同 schema 或仅配置差异 |
| Editor Host | Web/Desktop 中承载编辑器、保存、素材与发布流程的页面 | 是否所有宿主同步上线新交互 |
| Block | 段落、标题、列表、引用、代码块、图片、媒体、表格、故事卡片等顶层内容单元 | 是否需要统一块菜单、稳定 ID 和复制/删除/转换语义 |
| Text Selection | 当前文本选区及其 marks | Bubble Menu 与 AI 菜单的职责如何分配 |
| Block Selection | 当前光标所在块或 NodeSelection | 是否作为块菜单和拖拽的统一目标 |
| Insert Intent | 用户在当前位置插入内容的意图 | `/` 菜单、空段落按钮、顶栏插入按钮如何统一 |
| Formatting Intent | 用户修改文本或块表现的意图 | 语义格式与视觉装饰是否分层 |
| Media Asset | 上传图片、URL 图片、嵌入媒体或故事链接卡片 | 上传、占位、失败、重试、替换和删除流程 |
| Editor Command | 对文档执行且可撤销的原子操作 | 菜单入口是否统一调用命令层并共享可用性判断 |
| Interaction Surface | 顶栏、Bubble Menu、Slash Menu、Block Menu、Node Toolbar、AI Sidebar | 各表面互斥、关闭、焦点和优先级规则 |
| Save State | 本地编辑内容相对持久化内容的状态 | 自动保存、未保存、保存中、失败反馈是否属于本轮范围 |

## 2. 候选状态模型

编辑器整体状态候选：

- `idle`：编辑区未聚焦。
- `text-editing`：普通输入或文本选区操作。
- `insert-menu-open`：Slash/Floating 插入菜单打开。
- `selection-menu-open`：文本 Bubble Menu 打开。
- `block-menu-open`：块级菜单打开。
- `node-editing`：图片、表格、链接卡片或媒体节点的专用编辑态。
- `ai-sidebar-active`：AI 侧栏交互但尚未锁定文档。
- `ai-task-locked`：AI 结构化任务执行，文档及外部变更入口锁定。

待确认：菜单状态是否允许与 `node-editing` 或 AI 侧栏并存，以及点击外部、Esc、选区变化时的退出顺序。

## 3. 候选不变量

1. 同一时刻只允许一个主上下文菜单获取键盘焦点。
2. 每个用户命令要么无变化，要么产生可预测的一个撤销边界。
3. UI 可用性必须由 `editor.can()`、schema 与锁状态共同决定，不能只靠隐藏按钮。
4. 插入图片/媒体失败不能破坏当前文档和选区。
5. Web 与 Desktop 对相同命令保持位置、命名、快捷键和结果一致；平台差异仅位于上传、文件系统与 API 适配层。
6. 自定义扩展不得绕过 Tiptap transaction/history/paste plugin 体系直接修改编辑 DOM。
7. 存储内容必须保持对旧节点和旧 HTML 的向后兼容，迁移应可检测并可回滚。

## 4. 关键流程

- 选中文本 -> 打开 Bubble Menu -> 格式化/链接/AI -> 恢复编辑焦点。
- 输入 `/` 或点击空块插入入口 -> 搜索/浏览命令 -> 插入块 -> 光标落到可继续输入的位置。
- 点击块手柄 -> 打开块菜单或拖拽 -> 复制/删除/转换/移动 -> 单次撤销。
- 粘贴或拖入图片 -> 校验 -> 插入上传占位 -> 上传 -> 替换为正式节点；失败保留占位和重试入口。
- 选中表格 -> 打开表格上下文工具 -> 修改行列/表头/单元格 -> 保持选择位置。
- 打开 AI 侧栏 -> 获取上下文 -> 任务锁定 -> 预览/应用 -> 单次事务 -> 解锁。
