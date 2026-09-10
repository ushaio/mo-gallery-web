import {
  DEFAULT_ZINE_FONT_FAMILY,
  DEFAULT_ZINE_TEXT_FONT_FAMILY,
  getZineFontRuns,
  loadZineFontStack,
  normalizeZineFontFamily,
} from './font-resources'

import type { ZineFontRun, ZineFontStack } from './font-resources'
import type { ZineProject } from './types'

export interface ZinePdfFonts {
  defaultFontFamily: string
  getTextRuns: (fontFamily: string, content: string) => ZineFontRun[]
}

export async function prepareZinePdfFonts(project: ZineProject): Promise<ZinePdfFonts> {
  const defaults = await loadZineFontStack(DEFAULT_ZINE_FONT_FAMILY, '0123456789')
  const stacks = new Map<string, ZineFontStack>([
    [normalizeZineFontFamily(DEFAULT_ZINE_FONT_FAMILY), defaults],
    [normalizeZineFontFamily(defaults[0].fontFamily), defaults],
  ])
  for (const [spreadIndex, spread] of project.spreads.entries()) {
    for (const [slotIndex, slot] of spread.slots.entries()) {
      if (slot.kind !== 'text') continue
      const family = slot.fontFamily || DEFAULT_ZINE_TEXT_FONT_FAMILY
      const key = normalizeZineFontFamily(family)
      try {
        const stack = await loadZineFontStack(family, slot.content)
        if (stack.length >= (stacks.get(key)?.length ?? 0)) stacks.set(key, stack)
      } catch (error) {
        throw new Error(`跨页 ${spreadIndex + 1}，文本框 ${slotIndex + 1}：${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
  return {
    defaultFontFamily: defaults[0].fontFamily,
    getTextRuns(fontFamily, content) {
      if (!content) return []
      const stack = stacks.get(normalizeZineFontFamily(fontFamily))
      if (!stack) throw new Error(`字体「${fontFamily}」尚未准备好。请重新导出。`)
      return getZineFontRuns(stack, content)
    },
  }
}
