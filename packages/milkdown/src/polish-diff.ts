/**
 * 「AI 润色」浮窗里那对左右并排的差异视图。
 *
 * 只做最小实现，不为它引入 diff 依赖：把两段文本切成词（中文按字切，西文与数字
 * 按词切，空白与标点各自成 token），两头先剥掉完全相同的片段，再对中间那段求
 * 最长公共子序列，最后把同类连续的 token 并成一段交给 React 渲染。
 *
 * 先剥首尾不只是省算力：润色大多是「全篇照抄、局部改写」，剥掉公共首尾之后
 * 中间的格子数往往只有几十个，LCS 的 O(n·m) 才付得起；不剥的话一篇千字正文
 * 就是百万格。
 */

export interface DiffSegment {
  type: 'same' | 'add' | 'remove'
  text: string
}

/**
 * 超过这个格子数就退化成「整段替换」：宁可标得粗一点，也不要卡住主线程。
 *
 * 取 900 万格（约 3000×3000 个 token，中文即三千字上下）：一篇整节正文都在里面，
 * Int32Array 占 36MB，只在点「替换原文」时算一次、随即释放，一次几十毫秒，可以接受。
 * 再往上抬，桌面端内存与停顿就不好看了。
 */
const MAX_CELLS = 9_000_000

const CJK = '\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\u3040-\\u30ff\\uac00-\\ud7af'
const TOKEN_RE = new RegExp(`[${CJK}]|[A-Za-z0-9]+(?:['’.\\-][A-Za-z0-9]+)*|\\s+|[^\\s]`, 'g')

export function tokenize(text: string): string[] {
  return text.match(TOKEN_RE) ?? []
}

function append(target: DiffSegment[], type: DiffSegment['type'], text: string) {
  if (!text) return
  const last = target[target.length - 1]
  if (last && last.type === type) last.text += text
  else target.push({ type, text })
}

export function diffSegments(before: string, after: string): { left: DiffSegment[]; right: DiffSegment[] } {
  const left: DiffSegment[] = []
  const right: DiffSegment[] = []
  if (before === after) {
    if (before) {
      append(left, 'same', before)
      append(right, 'same', after)
    }
    return { left, right }
  }
  const a = tokenize(before)
  const b = tokenize(after)
  if (!a.length || !b.length || a.length * b.length > MAX_CELLS) {
    append(left, 'remove', before)
    append(right, 'add', after)
    return { left, right }
  }

  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1
    endB -= 1
  }

  const same = (text: string) => { append(left, 'same', text); append(right, 'same', text) }
  for (let index = 0; index < start; index += 1) same(a[index])

  const n = endA - start
  const m = endB - start
  if (n && m && n * m <= MAX_CELLS) {
    // dp[i][j] = a[start+i..] 与 b[start+j..] 的最长公共子序列长度
    const width = m + 1
    const dp = new Int32Array((n + 1) * width)
    for (let i = n - 1; i >= 0; i -= 1) {
      const row = i * width
      const below = (i + 1) * width
      for (let j = m - 1; j >= 0; j -= 1) {
        dp[row + j] = a[start + i] === b[start + j]
          ? dp[below + j + 1] + 1
          : Math.max(dp[below + j], dp[row + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < n && j < m) {
      if (a[start + i] === b[start + j]) {
        same(a[start + i])
        i += 1
        j += 1
      } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
        append(left, 'remove', a[start + i])
        i += 1
      } else {
        append(right, 'add', b[start + j])
        j += 1
      }
    }
    while (i < n) { append(left, 'remove', a[start + i]); i += 1 }
    while (j < m) { append(right, 'add', b[start + j]); j += 1 }
  } else {
    for (let index = start; index < endA; index += 1) append(left, 'remove', a[index])
    for (let index = start; index < endB; index += 1) append(right, 'add', b[index])
  }

  for (let index = endA; index < a.length; index += 1) same(a[index])
  return { left, right }
}

/** 差异的规模（左侧被删 / 右侧新增的字数），用于浮窗标题旁那句统计。 */
export function diffStats(segments: DiffSegment[]) {
  let removed = 0
  let added = 0
  for (const segment of segments) {
    if (segment.type === 'remove') removed += segment.text.length
    else if (segment.type === 'add') added += segment.text.length
  }
  return { removed, added }
}
