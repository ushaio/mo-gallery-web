const ZH_TARGET = '(?:当前)?(?:跨页|页面|版面|布局|图片|照片|文本框|文字槽|文本槽|文案槽|槽位)'
const ZH_MUTATION = '(?:写入|填入|插入|添加|放入|放到|应用到|更新到|修改|调整|移动|替换|删除|裁剪|缩放|重排|重新排版)'

const EXPLICIT_ZH_EDIT_PATTERNS = [
  new RegExp(`${ZH_MUTATION}.{0,20}${ZH_TARGET}`, 'i'),
  new RegExp(`${ZH_TARGET}.{0,20}${ZH_MUTATION}`, 'i'),
  /(?:把|将).{0,30}(?:写入|填入|插入|添加|放入|放到|应用到|修改|调整|移动|替换|删除|裁剪|缩放)/i,
]

const EXPLICIT_EN_EDIT_PATTERNS = [
  /(?:add|insert|place|put|apply|write).{0,30}(?:to|into|on).{0,20}(?:the )?(?:current )?(?:spread|page|layout|text box|slot)/i,
  /(?:modify|adjust|move|replace|delete|crop|resize|rearrange).{0,30}(?:the )?(?:current )?(?:spread|page|layout|image|photo|text|slot)/i,
  /(?:current )?(?:spread|page|layout|image|photo|text|slot).{0,30}(?:modify|adjust|move|replace|delete|crop|resize|rearrange)/i,
]

/** Model capabilities never imply write intent; only explicit editor commands do. */
export function hasExplicitZineEditIntent(instruction: string): boolean {
  const normalized = instruction.replace(/\s+/g, ' ').trim()
  if (!normalized) return false
  return [...EXPLICIT_ZH_EDIT_PATTERNS, ...EXPLICIT_EN_EDIT_PATTERNS]
    .some((pattern) => pattern.test(normalized))
}
