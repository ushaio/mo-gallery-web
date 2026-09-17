/**
 * 轻量文本 diff（无第三方依赖）。
 *
 * 面向 AI 应用前预览：CJK 按字、拉丁按词、空白独立成 token，
 * 用 LCS 计算相同/删除/新增三类片段。规模超限时返回 null，
 * 由 UI 退化为"原文 / 修改后"上下对照展示。
 */

export interface DiffSegment {
  type: 'same' | 'del' | 'ins'
  text: string
}

const MAX_LCS_CELLS = 400_000

function tokenize(input: string): string[] {
  return input.match(/[一-鿿　-〿＀-￯]|[a-zA-Z0-9_'-]+|\s+|[^\s]/g) ?? []
}

export function diffText(original: string, revised: string): DiffSegment[] | null {
  const a = tokenize(original)
  const b = tokenize(revised)
  if (a.length * b.length > MAX_LCS_CELLS) return null

  // LCS 动态规划表
  const rows = a.length + 1
  const cols = b.length + 1
  const table = new Uint32Array(rows * cols)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] = a[i] === b[j]
        ? table[(i + 1) * cols + j + 1] + 1
        : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1])
    }
  }

  const segments: DiffSegment[] = []
  const push = (type: DiffSegment['type'], text: string) => {
    const last = segments[segments.length - 1]
    if (last && last.type === type) last.text += text
    else segments.push({ type, text })
  }

  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('same', a[i])
      i++
      j++
    } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) {
      push('del', a[i])
      i++
    } else {
      push('ins', b[j])
      j++
    }
  }
  while (i < a.length) push('del', a[i++])
  while (j < b.length) push('ins', b[j++])

  return segments
}
