/**
 * 渲染式 diff 的区块对齐（纯函数，不碰 React，也不碰编辑器）。
 *
 * 「云端 vs 本地」那个冲突弹窗是这套做法的先例（`emulsion-desktop-v3` 的
 * `lib/article-sync/render-diff.ts`）：先让两侧正文各自过一遍**发布/预览用的那套渲染器**
 * 变成 HTML，再把 HTML 拆成顶层区块、按结构指纹做 LCS 对齐，一行一块地并排摆出来。
 *
 * 这里把它抽成不依赖具体渲染器的版本，供 milkdown 的润色浮窗复用：调用方负责
 * 「Markdown → HTML」，本文件只负责「HTML → 对齐后的区块表」。之所以按顶层区块而不是
 * 按源码行：源码的行在渲染后与视觉行没有对应关系（一段里的硬换行、一条媒体指令各占一行），
 * 按行 diff 得到的只是「源码差异」，用户看到的却是段落 / 列表 / 图片卡。
 */

export interface ContentBlock {
  /** 该区块自身的 HTML（已是渲染结果，调用方直接注入即可）。 */
  html: string
  /**
   * 对齐用的结构指纹：标签骨架 + 文本 + 少量有语义的属性（src / href / 媒体卡 JSON…）。
   *
   * 刻意的取舍：class、style、id 等纯表现属性不进指纹 —— 两侧样式类名不同但读者看到的
   * 是同一段文字时，不该被判成「改过」。反过来，图片换了、链接换了、文字改了都会进指纹。
   */
  key: string
}

export type BlockRowType = 'same' | 'add' | 'del' | 'modify'

/** 一行对齐结果：`left` 是原文（旧），`right` 是润色后（新），至少一侧存在。 */
export interface DiffRow<T> {
  type: BlockRowType
  left?: T
  right?: T
}

export type BlockRow = DiffRow<ContentBlock>

export interface BlockDiff {
  rows: BlockRow[]
  /** 有实际差异的行数，用于「N 处改动」这类统计（`same` 以外都算）。 */
  changed: number
}

/**
 * 进指纹的属性白名单。
 *
 * `src` 与 `data-photo-id` 二选一由 fingerprint 处理：有 photoId 时以 photoId 为准
 * （两侧都会按同一张照片解析出同样的地址，url 的差异只是解析产物）。
 */
const KEPT_ATTRIBUTES = new Set([
  'alt',
  'checked',
  'colspan',
  'data-milkdown-media',
  'data-photo-id',
  'href',
  'rowspan',
  'src',
  'title',
  'type',
])

/** 把渲染好的正文 HTML 拆成顶层区块。 */
export function splitContentBlocks(html: string): ContentBlock[] {
  if (!html || typeof DOMParser === 'undefined') return []
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const { nodes, wrapperClass } = unwrapWrapper(Array.from(parsed.body.children))
  // 摊平包装 div 会丢掉它身上的样式类（Milkdown 正文靠 `.milkdown-content` 排版，
  // 媒体卡、图注的样式都挂在这个祖先上），所以把类名重新套回每个区块外面。
  const wrapper = wrapperClass ? `<div class="${wrapperClass}">` : ''
  return nodes.map((element) => ({
    html: wrapper ? `${wrapper}${element.outerHTML}</div>` : element.outerHTML,
    key: fingerprint(element),
  }))
}

/** 两侧 HTML 的对齐表。行类型：`same` 两侧同构、`modify` 两侧都有但不同、`del` 仅左侧、`add` 仅右侧。 */
export function buildBlockDiff(leftHtml: string, rightHtml: string): BlockDiff {
  const leftBlocks = splitContentBlocks(leftHtml)
  const rightBlocks = splitContentBlocks(rightHtml)
  const rows = diffSequence(leftBlocks, rightBlocks, (block) => block.key)
  return { rows, changed: rows.filter((row) => row.type !== 'same').length }
}

/**
 * 渲染器会在正文外面套一层包装 div（milkdown 那层还带 `.milkdown-content`）。
 * 把「单层包装」逐级摊平，露出真正的顶层区块，否则整篇文章会是一个大块、无从对齐。
 * 摊平过程中被去掉的包装类名一并返回，调用方负责重新套回去（样式不能丢）。
 */
function unwrapWrapper(nodes: Element[]): { nodes: Element[]; wrapperClass: string } {
  let current = nodes
  const classes: string[] = []
  while (current.length === 1 && current[0].tagName === 'DIV' && current[0].children.length > 0) {
    const className = current[0].getAttribute('class')
    if (className) classes.push(className)
    current = Array.from(current[0].children)
  }
  return { nodes: current, wrapperClass: classes.join(' ').replace(/"/g, '') }
}

/** 区块指纹：标签骨架 + 文本 + 有语义的属性（见 KEPT_ATTRIBUTES）。 */
function fingerprint(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    // 文本节点内的空白按渲染口径折叠（HTML 里连续空白只显示一个），避免缩进差异算成改动。
    return (node.textContent ?? '').replace(/\s+/g, ' ')
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const element = node as Element
  const tag = element.tagName.toLowerCase()
  const photoId = element.getAttribute('data-photo-id')
  const attributes = Array.from(element.attributes)
    // 有 photoId 的图片以 photoId 为身份，src 只是解析产物，不进指纹。
    .filter((attribute) => KEPT_ATTRIBUTES.has(attribute.name) && !(attribute.name === 'src' && photoId))
    .map((attribute) => `${attribute.name}=${JSON.stringify(attribute.value)}`)
    .sort()
  const children = Array.from(element.childNodes).map(fingerprint).join('')
  return `<${tag}${attributes.length > 0 ? ` ${attributes.join(' ')}` : ''}>${children}</${tag}>`
}

/**
 * 泛型序列对齐：以 `keyOf` 作为比较键做 LCS，再把每两段「只有左侧」与「只有右侧」
 * 的差异按顺序两两配成一行 `modify`，让左右两侧在同一个表格行里相邻显示。
 *
 * 配对顺序是「同位置的算一行」：左边第 1 块换成了右边第 1 块，而不是删 1 增 1 各占一行。
 */
export function diffSequence<T>(left: readonly T[], right: readonly T[], keyOf: (item: T) => string): DiffRow<T>[] {
  const leftKeys = left.map(keyOf)
  const rightKeys = right.map(keyOf)
  const lcs = longestCommonSubsequence(leftKeys, rightKeys)

  const rows: DiffRow<T>[] = []
  let i = 0
  let j = 0
  let pendingLeft: T[] = []
  let pendingRight: T[] = []
  const flush = () => {
    const count = Math.max(pendingLeft.length, pendingRight.length)
    for (let k = 0; k < count; k += 1) {
      const l = pendingLeft[k]
      const r = pendingRight[k]
      rows.push({
        type: l !== undefined && r !== undefined ? 'modify' : r !== undefined ? 'add' : 'del',
        left: l,
        right: r,
      })
    }
    pendingLeft = []
    pendingRight = []
  }

  for (const common of lcs) {
    while (i < left.length && leftKeys[i] !== common) pendingLeft.push(left[i++])
    while (j < right.length && rightKeys[j] !== common) pendingRight.push(right[j++])
    flush()
    rows.push({ type: 'same', left: left[i], right: right[j] })
    i += 1
    j += 1
  }
  while (i < left.length) pendingLeft.push(left[i++])
  while (j < right.length) pendingRight.push(right[j++])
  flush()
  return rows
}

/** 经典 LCS；为控制内存，逐行只保留上一行。返回一个公共子序列（不唯一）。 */
function longestCommonSubsequence(left: string[], right: string[]): string[] {
  const rows = left.length
  const cols = right.length
  if (rows === 0 || cols === 0) return []
  // dp[r][c] = left[r..] 与 right[c..] 的最长公共子序列长度。
  const dp: Uint32Array[] = Array.from({ length: rows + 1 }, () => new Uint32Array(cols + 1))
  for (let r = rows - 1; r >= 0; r -= 1) {
    for (let c = cols - 1; c >= 0; c -= 1) {
      dp[r][c] = left[r] === right[c] ? dp[r + 1][c + 1] + 1 : Math.max(dp[r + 1][c], dp[r][c + 1])
    }
  }
  const result: string[] = []
  let r = 0
  let c = 0
  while (r < rows && c < cols) {
    if (left[r] === right[c]) {
      result.push(left[r])
      r += 1
      c += 1
    } else if (dp[r + 1][c] >= dp[r][c + 1]) {
      r += 1
    } else {
      c += 1
    }
  }
  return result
}
