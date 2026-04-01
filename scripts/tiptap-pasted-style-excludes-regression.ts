import { readFileSync } from 'node:fs'

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

const source = readFileSync(new URL('../src/components/tiptap-extensions/PastedStyleMark.ts', import.meta.url), 'utf8')
const excludesMatch = source.match(/excludes:\s*'([^']*)'/)

assert(excludesMatch !== null, 'PastedStyleMark should define excludes explicitly')
assert(
  excludesMatch?.[1] === 'pastedStyle',
  'PastedStyleMark should exclude itself so new font-size marks replace old ones instead of nesting'
)

console.log('tiptap-pasted-style excludes regression: ok')
