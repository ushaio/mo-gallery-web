export type Locale = 'zh' | 'en'

export type TranslationLeaf = string
export type TranslationTree = {
  [key: string]: TranslationLeaf | TranslationTree
}

export type LocaleDictionaryGroup = Record<Locale, TranslationTree>
