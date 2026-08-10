import { Sparkles } from 'lucide-react'

export function DesktopEmptyState({ t, textareaRef, setInput }: {
  t: (key: string) => string
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  setInput: (value: string) => void
}) {
  const prompts = [
    { text: t('admin.ai_prompt_narrative'), index: 1 },
    { text: t('admin.ai_prompt_describe'), index: 2 },
    { text: t('admin.ai_prompt_title'), index: 3 },
  ]

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 pb-16 select-none">
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-xl"
          style={{ backgroundColor: 'var(--muted)', border: '1px solid var(--border)' }}>
          <Sparkles size={24} style={{ color: 'var(--muted-foreground)', opacity: 0.5 }} />
        </div>
        <h2 className="font-serif text-xl tracking-tight mb-2" style={{ color: 'var(--foreground)' }}>{t('admin.ai_assistant')}</h2>
        <p className="text-xs leading-relaxed mb-8 max-w-xs mx-auto" style={{ color: 'var(--muted-foreground)' }}>{t('admin.ai_welcome')}</p>

        <div className="space-y-1.5">
          {prompts.map((p) => (
            <button
              key={p.index}
              onClick={() => { setInput(p.text); textareaRef.current?.focus() }}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border text-left transition-colors hover:bg-accent"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="text-[10px] font-mono w-5 text-right" style={{ color: 'var(--muted-foreground)', opacity: 0.5 }}>0{p.index}</span>
              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{p.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
