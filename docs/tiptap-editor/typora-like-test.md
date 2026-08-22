对，而且这其实是你们现在最容易踩坑的地方。

**不要靠“想到一个补一个”来排查。**
因为编辑器的交互非常多，尤其 Tiptap + ProseMirror 这种结构化编辑器，很多问题并不是一个按键，而是「文档结构 × 光标位置 × 选区 × 操作」的组合。

最有效的方法是建立一套 **“编辑器交互覆盖矩阵”**，系统性把所有交互扫一遍。

---

# 一、先换一个排查思路

不要问：

> “还有哪些快捷键没实现？”

而要问：

> **“用户在编辑器里可能对什么东西做什么操作？”**

可以拆成 4 个维度：

```text
            文档结构
                │
       ┌────────┼────────┐
       ↓        ↓        ↓
     Block     Inline    特殊结构
       │        │        │
       ↓        ↓        ↓
     段落      粗体      列表
     标题      斜体      引用
     图片      链接      代码
```

再乘上：

```text
用户操作
├── 输入
├── 删除
├── 回车
├── Tab
├── 选择
├── 粘贴
├── 拖拽
├── 快捷键
├── 鼠标
└── 系统行为
```

再乘上：

```text
光标状态
├── Block 开头
├── Block 中间
├── Block 结尾
├── 空 Block
├── 嵌套结构
├── 选区
└── 跨 Block
```

这样一组合，很快就是几百个场景。

---

# 二、建立“交互覆盖矩阵”

我建议你们直接建立一张表。

例如：

| 内容类型        | 光标位置 | Enter | Backspace | Delete | Tab | ShiftTab | Ctrl+A | 复制粘贴 | 拖拽 |
| ----------- | ---- | ----- | --------- | ------ | --- | -------- | ------ | ---- | -- |
| Paragraph   | 开头   | ✅     | ✅         | ✅      |     |          | ✅      | ✅    |    |
| Paragraph   | 中间   | ✅     | ✅         | ✅      |     |          | ✅      | ✅    |    |
| Paragraph   | 结尾   | ✅     | ✅         | ✅      |     |          | ✅      | ✅    |    |
| Heading     | 开头   | ✅     | ✅         | ✅      |     |          | ✅      | ✅    |    |
| Heading     | 结尾   | ✅     | ✅         | ✅      |     |          | ✅      | ✅    |    |
| Bullet List | 第一项  | ✅     | ✅         | ✅      | ✅   | ✅        |        | ✅    |    |
| Bullet List | 中间项  | ✅     | ✅         | ✅      | ✅   | ✅        |        | ✅    |    |
| Bullet List | 空项   | ✅     | ✅         | ✅      | ✅   | ✅        |        | ✅    |    |
| Nested List | 内层   | ✅     | ✅         | ✅      | ✅   | ✅        |        | ✅    |    |
| Quote       | 开头   | ✅     | ✅         | ✅      |     |          |        | ✅    |    |
| Code Block  | 内部   | ✅     | ✅         | ✅      |     |          |        | ✅    |    |
| Image       | 前后   | ✅     | ✅         | ✅      |     |          |        | ✅    |    |

一旦这样铺开，你会马上发现：

> **原来我们之前只测试了 20% 左右。**

---

# 三、内容类型也要系统盘点

不要只盯着 Markdown。

先把你们当前编辑器支持的 Node / Mark 全部列出来。

例如：

### Block

```text
Paragraph
Heading
BulletList
OrderedList
TaskList
ListItem
Blockquote
CodeBlock
HorizontalRule
Image
Table
TableRow
TableCell
```

### Inline

```text
Bold
Italic
Strike
Code
Link
Underline
Highlight
Mention
```

然后问一个非常简单的问题：

> **“这个节点能不能成为光标落点？”**

再问：

> **“这个节点前后怎么进来？”**

> **“怎么出去？”**

> **“怎么删除？”**

> **“怎么复制？”**

> **“怎么粘贴？”**

> **“怎么选中？”**

这几个问题本身就能发现大量遗漏。

---

# 四、最容易漏掉的是“边界状态”

编辑器 Bug 很多都出在边界，而不是正常输入。

比如 Paragraph：

```text
AAA|
```

和：

```text
|AAA
```

完全是两个场景。

所以每一种 Block 至少测试：

```text
1. 空
2. 开头
3. 中间
4. 结尾
5. 前后相邻同类型 Block
6. 前后不同类型 Block
7. 嵌套结构
8. 与其他 Node 混合
```

例如：

```text
Paragraph
↓
Heading
↓
Paragraph
```

光标放在 Heading 最前面 Backspace。

和：

```text
Paragraph
↓
List
```

光标放在 List 第一项最前面 Backspace。

这两种行为应该分别定义。

---

# 五、再增加一个“操作维度”

### 输入类

```text
普通字符
中文
英文
数字
标点
Emoji
空格
连续空格
换行
```

### 删除类

```text
Backspace
Delete
Ctrl+Backspace
Ctrl+Delete
```

### 移动类

```text
← →
↑ ↓
Home
End
Ctrl+←
Ctrl+→
```

### 选择类

```text
Shift+Arrow
Ctrl+A
双击
三击
鼠标拖动
跨 Block 选择
```

### 剪贴板

```text
Copy
Cut
Paste
Paste as Plain Text
Paste Markdown
Paste HTML
Paste 图片
```

### 格式化

```text
Ctrl+B
Ctrl+I
Ctrl+U
Ctrl+K
Markdown Shortcut
```

### 结构操作

```text
Enter
Shift+Enter
Tab
Shift+Tab
```

### 鼠标

```text
点击
双击
拖选
拖拽
右键
```

---

# 六、还有一类你们很可能完全没测：粘贴

这个实际上是 Markdown 编辑器的大坑。

例如从：

### Typora

复制：

```text
- AAA
  - BBB
```

粘贴到你们编辑器。

到底应该得到：

```text
真正的嵌套 List
```

还是：

```text
纯文本
```

再比如从：

### Notion

复制：

```text
标题
正文
```

再比如从：

### 网页

复制：

```text
HTML + CSS
```

再比如：

```text
VS Code
ChatGPT
Typora
Obsidian
Word
浏览器
```

全部可能产生不同 Clipboard Data。

所以建议单独做：

> **Clipboard Compatibility Matrix**

这个往往比键盘行为还容易出现用户投诉。

---

# 七、再测试“连续动作”

这是最容易被忽略的。

单独：

```text
Backspace
```

可能没问题。

但是：

```text
Backspace
Backspace
Enter
Backspace
Tab
Enter
```

连续操作以后就可能出问题。

所以测试不应该只有：

> 一个动作 → 一个结果

还应该有：

> **动作序列 → 最终结果**

例如：

```text
输入：
- A
- B

操作：

Enter
Enter
Tab
Backspace
Backspace
```

最终文档结构是否合理？

---

# 八、建立“场景生成器”

再进一步，你甚至不需要人工想所有案例。

可以自动组合：

```text
Node × Position × Action
```

例如：

```text
10 种 Node
×
5 种 Position
×
10 种 Action
=
500 个测试场景
```

再加入：

```text
Nested
Empty
Selection
Adjacent Node
```

就能达到几千个组合。

这里不需要全部都人工写测试。

可以分：

```text
P0：必须人工验收
P1：自动化
P2：异常/兼容性
```

---

# 九、优先建立“黄金案例”

不要一开始就追求 2000 个测试。

先选 **50～100 个最关键场景**。

例如：

### P0

```text
1. Paragraph + Enter
2. Paragraph + Backspace
3. Heading + Enter
4. Heading + Backspace
5. List + Enter
6. List + Backspace
7. Nested List + Tab
8. Nested List + ShiftTab
9. Empty List + Enter
10. Empty List + Backspace
11. Quote + Enter
12. Quote + Backspace
13. CodeBlock + Enter
14. Selection + Delete
15. Copy / Paste
16. Markdown Paste
17. HTML Paste
18. Image Paste
19. Undo
20. Redo
```

先把这 20 个搞到非常稳定。

然后继续扩。

---

# 十、尤其不要遗漏 Undo / Redo

这个很多团队最后才发现。

比如：

```text
输入 A
输入 B
加粗
创建列表
Tab
删除
```

然后：

```text
Ctrl+Z
```

应该：

> 撤销“删除”

还是：

> 撤销“整个操作链”？

这其实是非常重要的编辑器体验。

尤其 Tiptap/ProseMirror 是 Transaction 驱动的，所以你们自己的 Behavior Layer 一旦介入，必须保证：

> **一次用户意图 = 合理的 Undo 单元。**

否则用户会产生：

> “我只按了一下 Backspace，为什么我要 Ctrl+Z 三次才能恢复？”

这种问题。

---

# 十一、最终建议你们建立 6 套测试矩阵

我会把整个编辑器拆成：

```text
① Keyboard Matrix
键盘行为

② Structure Matrix
Block / Node 结构

③ Selection Matrix
光标 / 选区

④ Clipboard Matrix
复制 / 粘贴

⑤ Shortcut Matrix
快捷键 / Markdown Shortcut

⑥ History Matrix
Undo / Redo
```

然后再加：

```text
⑦ Compatibility Matrix
Typora / Obsidian / VS Code / 浏览器
```

---

# 十二、你们真正需要的不是“测试清单”

而是：

## Editor Behavior Specification

最终每一个行为都采用统一格式：

```text
Scenario:
嵌套列表第二级末尾

Document:
- A
  - B|

Action:
Backspace

Expected:
- A
  - |
```

然后：

```text
Scenario:
空列表项

Document:
- |

Action:
Enter

Expected:
|
```

再把这份 Specification 自动映射成：

```text
产品验收
↓
开发实现
↓
自动化测试
↓
回归测试
```

这样以后你们新增一个功能，比如：

> Table

不用重新摸索。

直接问：

```text
Table
├── Enter
├── Backspace
├── Delete
├── Tab
├── ShiftTab
├── Arrow
├── Selection
├── Copy
├── Paste
├── Undo
└── Redo
```

整个体系就自动扩展了。

---

## 我特别建议你们下一步这么做

**先不要继续改代码。**

把你们目前 Tiptap 已经启用的所有 Extension / Node / Mark 列出来，然后按照：

```text
Node
×
Position
×
Action
×
Expected Behavior
```

做成一份 **编辑器交互覆盖矩阵**。

这样才能知道究竟是：

> “还有几个 Bug”

还是：

> **“我们整个编辑器有 60% 的交互场景其实从来没定义过。”**

后者才是你们现在真正的问题。

如果你把**目前项目里使用的 Tiptap Extension 列表**贴给我（例如 `StarterKit / TaskList / Table / Image / Link / CodeBlock...`），我可以直接按你们的实际功能给你生成一份 **完整的「编辑器交互排查矩阵 v1.0」**，包括 P0/P1/P2 优先级和测试场景编号。
