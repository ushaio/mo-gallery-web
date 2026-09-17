'use client'

interface EditorContentPromptProps {
  language?: 'zh' | 'en'
  targetEditor: string
  sourceEditor?: string
  scenario: 'convert' | 'use-existing' | 'unavailable'
  onAction?: () => void
}

export function EditorContentPrompt({ language = 'zh', targetEditor, sourceEditor, scenario, onAction }: EditorContentPromptProps) {
  const chinese = language === 'zh'
  const hasExistingContent = scenario === 'use-existing'
  const message = hasExistingContent
    ? (chinese ? `这篇文章已有保存的 ${targetEditor} 内容。` : `This article has saved ${targetEditor} content.`)
    : (chinese ? `这篇文章还没有 ${targetEditor} 内容。` : `This article has no ${targetEditor} content yet.`)
  const source = sourceEditor ?? (chinese ? '其他编辑器' : 'another editor')
  const actionLabel = hasExistingContent
    ? (chinese ? `使用 ${targetEditor} 内容` : `Use ${targetEditor} content`)
    : (chinese ? `从 ${source} 转换` : `Convert from ${source}`)
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center" role="status">
      <p className="text-sm text-muted-foreground">
        {message}
      </p>
      {scenario !== 'unavailable' && onAction ? (
        <button type="button" onClick={onAction} className="rounded-md border border-border bg-background px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted">
          {actionLabel}
        </button>
      ) : (
        <p className="text-xs text-muted-foreground">
          {chinese ? '未找到可转换的正文，请重新加载文章。' : 'No source content was found. Reload the article.'}
        </p>
      )}
    </div>
  )
}
