import { adminMessages } from './i18n/admin'
import { contentMessages } from './i18n/content'
import { coreMessages } from './i18n/core'
import { editorMessages } from './i18n/editor'
import { siteMessages } from './i18n/site'
import type { Locale, TranslationTree } from './i18n/types'

function mergeLocaleDictionaries(...sources: TranslationTree[]): TranslationTree {
  return Object.assign({}, ...sources)
}

export type { Locale } from './i18n/types'

export const dictionaries: Record<Locale, TranslationTree> = {
  zh: mergeLocaleDictionaries(
    coreMessages.zh,
    siteMessages.zh,
    contentMessages.zh,
    editorMessages.zh,
    adminMessages.zh,
  ),
  en: mergeLocaleDictionaries(
    coreMessages.en,
    siteMessages.en,
    contentMessages.en,
    editorMessages.en,
    adminMessages.en,
  ),
}

function resolveTranslation(source: TranslationTree, path: string): string | undefined {
  let current: TranslationTree | string = source
  for (const key of path.split('.')) {
    if (typeof current === 'string') return undefined
    if (!(key in current)) return undefined
    const nextValue: TranslationTree[string] = current[key]
    if (typeof nextValue !== 'string' && typeof nextValue !== 'object') return undefined
    current = nextValue
  }
  return typeof current === 'string' ? current : undefined
}

/**
 * 独立翻译函数 — 兼容 desktop 旧代码 import { t } from '@/lib/i18n'。
 * 优先用指定语言，找不到回退 en，再找不到返回 key 本身。
 */
export function t(path: string, lang: Locale = 'zh', params?: Record<string, string | number>): string {
  let text = resolveTranslation(dictionaries[lang], path)
  if (text === undefined) text = resolveTranslation(dictionaries.en, path)
  if (text === undefined) text = path
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v))
    }
  }
  return text
}
