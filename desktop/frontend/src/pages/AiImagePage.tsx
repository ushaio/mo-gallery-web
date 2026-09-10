import { useEffect, useState } from 'react'
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CreateEditorAiConversation, GetAiHttpPort, GetAiImageDataURL } from '../../wailsjs/go/main/App'
import { PageHeader } from '@/components/layout/PageHeader'
import { fetchOfficialAiCatalog, type OfficialAiSkill } from '@/lib/official-ai'

export function AiImagePage() {
  const navigate = useNavigate(); const [params] = useSearchParams()
  const [skill, setSkill] = useState<OfficialAiSkill | null>(null); const [prompt, setPrompt] = useState(''); const [image, setImage] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  useEffect(() => { void fetchOfficialAiCatalog().then(({ skills }) => { const selected = skills.find(item => item.id === params.get('skill')); if (selected) { setSkill(selected); setPrompt(selected.instructions) } }).catch(() => undefined) }, [params])
  const generate = async () => {
    if (!prompt.trim() || busy) return; setBusy(true); setError(''); setImage('')
    try {
      const conversation = await CreateEditorAiConversation({ scopeId: 'ai-image', title: skill?.name || 'AI 生图' }); const port = await GetAiHttpPort(); if (!port) throw new Error('AI 服务未启动')
      const images = skill?.referencePhotos.map(photo => photo.imageUrl) || []
      const response = await fetch(`http://127.0.0.1:${port}/ai/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: conversation.id, generateImage: true, prompt: prompt.trim(), userPrompt: prompt.trim(), imageModel: undefined, images: images.length ? images : undefined }) })
      if (!response.ok || !response.body) throw new Error(await response.text().catch(() => '生成失败'))
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let messageId = ''
      while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const parts = buffer.split('\n\n'); buffer = parts.pop() || ''; for (const part of parts) { const event = part.match(/^event:\s*(.+)$/m)?.[1]; const data = part.match(/^data:\s*(.+)$/m)?.[1] || ''; if (event === 'done') { try { messageId = JSON.parse(data).messageId || '' } catch { /* ignore */ } } if (event === 'error') throw new Error(data) } }
      if (!messageId) throw new Error('生成结果不可用'); setImage(await GetAiImageDataURL(messageId))
    } catch (cause) { setError(cause instanceof Error ? cause.message : '生成失败') } finally { setBusy(false) }
  }
  return <div className="flex h-full flex-col"><PageHeader title="AI 生图" actions={<button type="button" onClick={() => navigate('/design')} className="flex h-8 items-center gap-2 rounded-md border px-3 text-xs" style={{ borderColor: 'var(--border)' }}><ArrowLeft size={14} />返回设计台</button>} /><main className="min-h-0 flex-1 overflow-auto px-6 py-7"><div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_1.1fr]"><section className="rounded-lg border p-5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}><div className="flex items-center gap-2"><Sparkles size={16} /><h2 className="text-sm font-semibold">{skill?.name || '官方 AI 创作'}</h2></div><textarea value={prompt} onChange={event => setPrompt(event.target.value)} className="mt-4 min-h-64 w-full resize-y rounded-md border bg-transparent p-3 text-sm leading-6 outline-none" style={{ borderColor: 'var(--border)' }} placeholder="描述你想生成的图片…" />{skill?.referencePhotos.length ? <div className="mt-4"><p className="mb-2 text-xs font-medium">参考照片</p><div className="flex gap-2 overflow-x-auto">{skill.referencePhotos.map(photo => <img key={photo.id} src={photo.thumbnailUrl || photo.imageUrl} alt={photo.title} className="size-14 shrink-0 rounded object-cover" />)}</div></div> : null}{error && <p className="mt-3 text-xs" style={{ color: 'var(--destructive)' }}>{error}</p>}<button type="button" disabled={busy || !prompt.trim()} onClick={() => void generate()} className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-md text-sm font-medium disabled:opacity-50" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>{busy && <Loader2 size={15} className="animate-spin" />}生成图片</button></section><section className="flex min-h-96 items-center justify-center rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>{image ? <img src={image} alt="生成结果" className="max-h-[70vh] max-w-full object-contain" /> : <div className="text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>{busy ? '正在生成…' : '生成结果会显示在这里'}</div>}</section></div></main></div>
}
