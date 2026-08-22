# 一、项目目标

### 核心目标

将现有：

> **Tiptap 默认编辑器**

逐步改造成：

> **Tiptap 内核 + Typora 风格交互层 + Markdown 能力**

最终用户不应该感觉自己在使用一个“富文本编辑器”。

而应该感觉：

> **“我在编辑 Markdown，只不过 Markdown 被隐藏起来了。”**

---

# 二、整体技术架构

建议最终形成下面这个结构：

```text
                    用户键盘 / 鼠标
                          │
                          ▼
              ┌─────────────────────┐
              │  Editor Behavior    │
              │      Layer          │
              │                     │
              │ Enter               │
              │ Backspace           │
              │ Delete              │
              │ Tab / Shift+Tab     │
              │ Space               │
              │ Selection           │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │     Commands        │
              │                     │
              │ join                │
              │ split               │
              │ lift                │
              │ indent              │
              │ outdent              │
              │ merge               │
              │ convert             │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ Tiptap / ProseMirror│
              │      Document       │
              └──────────┬──────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
       Markdown Parser        Markdown Serializer
```

其中最重要的是：

**不要让 Markdown 层负责编辑行为。**

Tiptap 官方的 Markdown Extension 本质上就是 Markdown ↔ Tiptap JSON 的桥梁。([Tiptap][1])

---

# 三、第一阶段：建立“行为基准”

### 目标

先不要改代码。

先建立：

> **Typora 行为标准**

因为现在最大的风险是：

```text
发现问题
↓
直接修
↓
修 A
↓
B 坏了
↓
继续打补丁
↓
代码越来越复杂
```

所以第一阶段必须先做行为定义。

---

## 3.1 建立操作维度

至少覆盖：

```text
Enter
Backspace
Delete
Tab
Shift + Tab
Space
Arrow Up
Arrow Down
Home
End
```

以及：

```text
鼠标选择
连续选择
跨 Block 选择
复制
粘贴
拖拽
撤销
重做
```

---

## 3.2 建立内容维度

至少覆盖：

```text
Paragraph
Heading
Bullet List
Ordered List
Task List
Quote
Code Block
Code
Bold
Italic
Strike
Link
Image
Horizontal Rule
```

---

## 3.3 建立嵌套维度

尤其需要：

```text
普通段落
列表
嵌套列表
列表 + 段落
列表 + Code
列表 + Quote
Quote + List
List + List
```

---

# 四、第二阶段：先解决列表体验

这是**优先级最高**的一部分。

因为 Markdown 编辑器体验差异最大的地方之一，就是列表。

---

## 4.1 Backspace

定义明确的状态机。

例如：

```text
- A
- |B
```

Backspace：

```text
- A|B
```

---

### 列表第一项

```text
-|A
-B
```

Backspace：

```text
A
-B
```

---

### 空列表

```text
- |
```

Backspace：

```text
|
```

也就是：

> 退出列表。

---

### 嵌套列表

```text
- A
  - B
    - |C
```

第一次 Backspace：

```text
- A
  - B
  - C
```

第二次：

```text
- A
  - B
- C
```

第三次：

```text
- A
- B
- C
```

这种行为要自己定义，而不能完全依赖 ProseMirror 默认事务。

---

# 五、第三阶段：Enter 行为

Enter 建议做成完整状态机。

---

## 普通段落

```text
AAA|
```

Enter：

```text
AAA

|
```

---

## 列表

```text
- AAA|
```

Enter：

```text
- AAA
- |
```

---

## 空列表

```text
- AAA
- |
```

Enter：

```text
- AAA

|
```

---

## 嵌套列表

```text
- A
  - B|
```

Enter：

```text
- A
  - B
  - |
```

---

# 六、第四阶段：Tab / Shift+Tab

建议**完全接管**。

不要依赖浏览器默认 Tab，也不要让行为散落在多个 Extension 里。

Tiptap 当前的 ListKeymap 本身就是为改善列表键盘行为提供的；可以先利用它的基础能力，再在你们自己的 Behavior Layer 中覆盖 Typora 特有行为。([Tiptap][2])

例如：

```text
- A
- B
- C
```

光标 B：

```text
Tab
```

变成：

```text
- A
  - B
- C
```

继续：

```text
Tab
```

变成：

```text
- A
    - B
- C
```

Shift + Tab 则反向处理。

---

# 七、第五阶段：Markdown 快捷输入

这一阶段才处理：

```text
# 
## 
### 
- 
* 
+ 
1.
> 
---
```

以及：

```text
**bold**
*italic*
~~strike~~
`code`
```

这里才使用 Input Rules。

Tiptap 的 Input Rules 本身就是针对这类“输入特定文本后转换节点/Mark”的机制。([Tiptap][3])

核心原则：

> **输入规则只解决“Markdown 输入 → 富文本节点”。**

不要让它处理：

```text
Backspace
Enter
Tab
Delete
```

---

# 八、第六阶段：建立统一 Command 层

这是整个项目非常关键的一步。

不要让：

```text
Backspace
Enter
Tab
```

直接操作 ProseMirror Transaction。

统一走：

```text
Keyboard
 ↓
Intent
 ↓
Command
 ↓
Transaction
```

例如：

```ts
handleBackspace()
    ↓
resolveBackspaceIntent()
    ↓
joinWithPreviousBlock()
```

或者：

```ts
handleTab()
    ↓
resolveIndentIntent()
    ↓
indentListItem()
```

---

## 建议 Command

```text
joinPreviousBlock()
joinNextBlock()

splitBlock()

liftBlock()
liftListItem()

indentListItem()
outdentListItem()

mergeListItem()

exitList()

convertBlock()

deleteCurrentBlock()
```

这样后面你们发现：

> Typora 的 Backspace 和你们之前理解的不一样。

只需要调整 Command，而不是整个编辑器到处修改。

---

# 九、第七阶段：建立 Selection 行为

这一阶段很多团队容易忽略。

但当编辑器复杂之后，会非常明显。

例如：

```text
- AAA
- BBB
- CCC
```

用户选中：

```text
BBB
```

然后：

```text
Tab
```

应该如何处理？

再比如：

```text
# AAA

BBB
```

选中：

```text
AAA

BBB
```

进行：

```text
Ctrl+B
```

是否应该跨 Block？

这些都要形成统一规则。

---

# 十、第八阶段：Markdown 数据层

这一部分尽量**不要重写 Tiptap 的 Markdown Parser**。

优先使用官方 Markdown Extension。

官方目前支持：

```text
Markdown → Tiptap JSON
Tiptap JSON → Markdown
```

并允许 Extension 自定义 `parseMarkdown` / `renderMarkdown`。([Tiptap][4])

因此你们的数据层应该是：

```text
Markdown
   ↓
Parser
   ↓
Tiptap JSON
   ↓
Editor
   ↓
Tiptap JSON
   ↓
Serializer
   ↓
Markdown
```

而不是：

```text
Markdown
 ↓
Editor
 ↓
每次按键都直接修改 Markdown
```

后者维护成本会非常高。

---

# 十一、第九阶段：建立 Behavior Test

这一步我认为是整个方案中**最重要的工程措施**。

不要只测：

> 页面长得对不对。

而是测试：

> **用户做某个动作之后，Document 应该变成什么。**

例如：

```text
输入：

- A
- |B

操作：

Backspace

期望：

- A|B
```

测试代码可以类似：

```ts
it('merge list items when backspace at start', () => {
  ...
})
```

---

## 建议至少建立 100～200 个行为用例

第一批重点覆盖：

```text
Backspace × 20
Enter × 20
Tab × 15
ShiftTab × 15
Delete × 15
Markdown Input × 20
Selection × 15
```

以后每修一个 Bug：

> **Bug → 增加一个行为测试。**

这样不会出现：

```text
修复 A
↓
B 坏了
↓
修复 B
↓
C 坏了
```

---

# 十二、第十阶段：做“Typora 对照测试”

建议建立一个非常简单的测试表：

| 操作               | Typora | 当前版本 | 目标 |
| ---------------- | ------ | ---- | -- |
| 列表 Backspace     | ✅      | ❌    | ✅  |
| 空列表 Enter        | ✅      | ❌    | ✅  |
| Tab 嵌套           | ✅      | ❌    | ✅  |
| ShiftTab         | ✅      | ❌    | ✅  |
| 标题 Enter         | ✅      | ❌    | ✅  |
| Quote Enter      | ✅      | ❌    | ✅  |
| Code Block Enter | ✅      | ❌    | ✅  |
| `- + Space`      | ✅      | ✅    | ✅  |

每次迭代都更新。

---

# 十三、最终项目目录建议

我比较推荐你们最终形成：

```text
src/
└── editor/
    │
    ├── core/
    │   ├── editor.ts
    │   └── schema.ts
    │
    ├── behavior/
    │   ├── keyboard/
    │   │   ├── enter.ts
    │   │   ├── backspace.ts
    │   │   ├── delete.ts
    │   │   ├── tab.ts
    │   │   └── space.ts
    │   │
    │   ├── selection/
    │   └── behavior-manager.ts
    │
    ├── commands/
    │   ├── block.ts
    │   ├── list.ts
    │   ├── merge.ts
    │   └── transform.ts
    │
    ├── markdown/
    │   ├── parser.ts
    │   ├── serializer.ts
    │   ├── input-rules.ts
    │   └── extensions.ts
    │
    ├── extensions/
    │   ├── heading.ts
    │   ├── list.ts
    │   ├── code.ts
    │   └── quote.ts
    │
    └── tests/
        ├── keyboard/
        ├── list/
        ├── markdown/
        └── selection/
```

---

# 十四、开发顺序

我建议严格按照这个顺序：

```text
Phase 0
现状分析
        ↓
Phase 1
建立 Typora Behavior Spec
        ↓
Phase 2
列表系统
        ↓
Phase 3
Backspace / Enter
        ↓
Phase 4
Tab / ShiftTab
        ↓
Phase 5
Delete / Selection
        ↓
Phase 6
Markdown Input Rules
        ↓
Phase 7
Block 行为
        ↓
Phase 8
Markdown Parser / Serializer
        ↓
Phase 9
自动化测试
        ↓
Phase 10
体验打磨
```

---

# 十五、每个阶段的验收标准

最终不要用：

> “感觉比之前好用了。”

作为验收标准。

而应该是：

### 编辑行为

```text
Typora 行为一致率 ≥ 90%
```

### 核心操作

```text
Backspace
Enter
Tab
ShiftTab
Delete
```

核心场景全部通过。

### Markdown

```text
Markdown → JSON
JSON → Markdown
```

能够稳定 Round Trip。

### 回归

所有历史行为测试 100% 通过。

---

# 十六、最重要的项目原则

整个项目建议定下来这 **5 条规则**：

**第一：Tiptap 是内核，不是产品行为。**

**第二：Markdown 是数据格式，不是编辑器行为。**

**第三：所有复杂键盘行为必须经过 Behavior Layer。**

**第四：所有行为都必须能够写成自动化测试。**

**第五：以 Typora 为交互参考，而不是以 ProseMirror 默认行为为参考。**

---

## 我建议你们实际落地时再增加一个东西

建立一份：

> **《Markdown Editor Behavior Specification》**

它不是开发文档，而是**产品交互标准**。

里面直接记录：

```text
操作
+ 当前文档结构
+ 光标位置
+ 用户动作
= 期望文档结构
```

比如：

```text
【场景：嵌套列表 Backspace】

Before:

- A
  - B
    - |C

Action:

Backspace

After:

- A
  - B
  - |C
```


[1]: https://tiptap.dev/docs/editor/markdown?utm_source=chatgpt.com "Markdown Introduction | Tiptap Editor Docs"
[2]: https://tiptap.dev/docs/resources/changelog/extension-list-keymap?utm_source=chatgpt.com "@tiptap/extension-list-keymap changelog"
[3]: https://tiptap.dev/docs/editor/markdown/getting-started/basic-usage?utm_source=chatgpt.com "Markdown Basic Usage | Tiptap Editor Docs"
[4]: https://tiptap.dev/docs/editor/markdown/guides/integrate-markdown-in-your-extension?utm_source=chatgpt.com "Markdown Extension Integration | Tiptap Editor Docs"
[5]: https://tiptap.dev/docs/editor/extensions/custom-extensions/create-new/extension?utm_source=chatgpt.com "Extension API | Tiptap Editor Docs"
