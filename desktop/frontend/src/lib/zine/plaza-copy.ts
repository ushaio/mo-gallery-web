const zh = {
  builtin: '内置精选',
  community: '社区模板',
  editable: '图片可替换，文字可编辑',
  communityUnavailable: '社区模板暂时不可用，内置模板仍可使用',
  communityEmpty: '暂无社区模板',
  retry: '重试',
  creativeTemplates: 'Zine 创意模板',
  blankTemplates: '选择纸张，自由创作',
  createFailed: 'Zine 创建失败，请重试',
} as const

type PlazaCopy = { [Key in keyof typeof zh]: string }

const en: PlazaCopy = {
  builtin: 'Built-in collection',
  community: 'Community templates',
  editable: 'Replace the photos and edit the text',
  communityUnavailable: 'Community templates are unavailable. Built-ins are ready to use.',
  communityEmpty: 'No community templates yet',
  retry: 'Retry',
  creativeTemplates: 'Creative Zine templates',
  blankTemplates: 'Choose a format, make it yours',
  createFailed: 'Could not create the Zine. Please try again.',
}

export function zinePlazaCopy(language: 'zh' | 'en'): PlazaCopy {
  return language === 'zh' ? zh : en
}
