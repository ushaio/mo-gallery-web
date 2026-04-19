type InlineStyleAttrs = {
  color?: string | null
  backgroundColor?: string | null
  fontSize?: string | null
  fontFamily?: string | null
}

function buildStyle(attrs: InlineStyleAttrs) {
  const entries = [
    ['color', attrs.color],
    ['background-color', attrs.backgroundColor],
    ['font-size', attrs.fontSize],
    ['font-family', attrs.fontFamily],
  ].filter(([, value]) => value)

  return entries.map(([key, value]) => `${key}: ${value}`).join('; ')
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

const oldLargeMark: InlineStyleAttrs = { fontSize: '20px' }
const smallerMark: InlineStyleAttrs = { ...oldLargeMark, fontSize: '12px' }
const largerReplacementMark: InlineStyleAttrs = { ...smallerMark, fontSize: '24px' }

const nestedHtml = `<span style="${buildStyle(largerReplacementMark)}"><span style="${buildStyle(smallerMark)}">text</span></span>`
assert(
  nestedHtml.includes('font-size: 12px'),
  'stacking same-type style marks keeps the smaller inner font size alive'
)

const replacedHtml = `<span style="${buildStyle(largerReplacementMark)}">text</span>`
assert(
  !replacedHtml.includes('font-size: 12px'),
  'replacing the previous style mark should remove the stale smaller font size'
)

console.log('tiptap-font-size mark regression: ok')
