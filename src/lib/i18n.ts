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
