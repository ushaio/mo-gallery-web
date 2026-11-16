'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LoaderCircle, Sparkles, X } from 'lucide-react'

/**
 * 单图 AI 改图（编辑器内）。
 *
 * 这个组件只负责「问用户要什么、把图变成什么样给人看」，**不碰正文**：
 * 生成成功与否、替换还是另存，都由调用方（MilkdownEditor）拿到结果后再决定。
 * 这样同一条结果可以走两条路（原地替换 / 插成新图），而弹窗不必知道文档结构。
 *
 * 宿主通过 `options.run` 注入真正的模型调用 —— 共享包不直连任何 AI 服务，
 * 桌面端与 Web 端各自用自己的通道（云端接口 / 本机密钥）。
 */

/** 改图时的参考图。`photoId` 优先（宿主能换出存储键），否则用 `src` 的绝对地址。 */
export interface ImageEditReference {
  photoId?: string
  src?: string
}

export interface ImageEditRequest {
  prompt: string
  reference?: ImageEditReference
  size?: string
  model?: string
}

export interface ImageEditResult {
  /** 可以直接写进媒体卡的图片地址（绝对或站内路径）。 */
  url: string
  /** 新的照片 id：有它就把这张卡指向资源库里的这张新照片。 */
  photoId?: string
  title?: string
  width?: number
  height?: number
}

export interface ImageEditSizeOption {
  value: string
  label: string
}

export interface ImageEditOptions {
  /** 真正去调模型。抛错就按失败处理，错误文案直接展示给用户。 */
  run: (request: ImageEditRequest) => Promise<ImageEditResult>
  /** 可选的模型列表。不传就只有默认模型，不渲染选择器。 */
  models?: string[]
  defaultModel?: string
  /** 可选尺寸。不传就按 1:1 / 9:16 / 16:9 这三个给。 */
  sizes?: ImageEditSizeOption[]
}

export interface ImageEditDialogProps {
  /** 当前这张图（改图的参考）。纯生成（文生图）时不传。 */
  initial?: ImageEditReference
  language: 'zh' | 'en'
  options: ImageEditOptions
  resolveUrl?: (src: string) => string
  /**
   * 用户在「换成这张」上做的选择。
   *
   * `'replace'` = 把正文里这张卡换成新图；`'insert'` = 在它后面再插一张。
   * 两个都是在生成成功之后才发生，所以这个回调一定带着结果。
   */
  onSubmit: (result: ImageEditResult, mode: 'replace' | 'insert') => void
  onClose: () => void
}

const DEFAULT_SIZES: ImageEditSizeOption[] = [
  { value: '1024x1024', label: '1:1' },
  { value: '1024x1792', label: '9:16' },
  { value: '1792x1024', label: '16:9' },
]

/**
 * 快捷指令。
 *
 * 刻意写成「看得见结果的一句话」而不是参数化选项：改图这件事的描述空间太大，
 * 预设只该省掉打字，不该限制用户改不成自己想改的样子 —— 所以选完仍然可编辑。
 */
const PRESETS = {
  zh: [
    '把这张图变成水彩画风格',
    '去掉背景，只留主体',
    '改成黑白胶片质感',
    '把画面扩展成宽幅，补全左右两侧',
    '提高清晰度和对比度，色彩更通透',
    '换成插画扁平风格',
  ],
  en: [
    'Turn this into a watercolor painting',
    'Remove the background, keep the subject',
    'Convert to black and white film',
    'Extend the frame to a wide format',
    'Sharpen it and lift the contrast',
    'Restyle it as flat vector illustration',
  ],
} as const

export function ImageEditDialog({ initial, language, options, resolveUrl, onSubmit, onClose }: ImageEditDialogProps) {
  const zh = language !== 'en'
  const dialogRef = useRef<HTMLDialogElement>(null)
  const abortRef = useRef(false)

  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState((options.sizes ?? DEFAULT_SIZES)[0].value)
  const [model, setModel] = useState(options.defaultModel ?? options.models?.[0] ?? '')
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle')
  const [error, setError] = useState('')
  const [result, setResult] = useState<ImageEditResult | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => {
      // 关窗即取消：已经发出去的请求不再有人关心，结果不该再写进 state。
      abortRef.current = true
      dialog?.close()
    }
  }, [])

  const sourceUrl = initial?.src ? (resolveUrl?.(initial.src) ?? initial.src) : ''

  const run = async () => {
    const text = prompt.trim()
    if (!text || state === 'running') return
    abortRef.current = false
    setState('running')
    setError('')
    try {
      const produced = await options.run({
        prompt: text,
        ...(initial?.photoId || initial?.src ? { reference: initial } : {}),
        size,
        ...(model ? { model } : {}),
      })
      if (abortRef.current) return
      setResult(produced)
      setState('done')
    } catch (cause) {
      if (abortRef.current) return
      setError(cause instanceof Error ? cause.message : String(cause))
      setState('idle')
    }
  }

  const reset = () => {
    setResult(null)
    setError('')
    setState('idle')
  }

  const sizes = options.sizes ?? DEFAULT_SIZES

  return createPortal(
    <dialog
      ref={dialogRef}
      className="milkdown-media-dialog milkdown-image-edit"
      aria-labelledby="milkdown-image-edit-title"
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <header>
        <h2 id="milkdown-image-edit-title">
          <Sparkles size={16} />
          {initial ? (zh ? 'AI 改这张图' : 'Edit this image with AI') : (zh ? 'AI 生成图片' : 'Generate an image with AI')}
        </h2>
        <button type="button" aria-label={zh ? '关闭' : 'Close'} onClick={onClose}><X size={18} /></button>
      </header>

      <div className="milkdown-media-dialog-main">
        <div className="milkdown-media-dialog-controls">
          <label>
            {zh ? '想怎么改' : 'What should change'}
            <textarea
              autoFocus
              rows={4}
              value={prompt}
              placeholder={initial
                ? (zh ? '例如：把背景换成纯白，主体加强阴影' : 'e.g. white background, stronger shadow on the subject')
                : (zh ? '描述你想要的画面' : 'Describe the image you want')}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                // Ctrl/Cmd + Enter 直接开跑：写提示词时手一直在键盘上，别再回去点按钮。
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void run() }
              }}
              disabled={state === 'running'}
            />
          </label>

          <div className="milkdown-image-edit-presets" role="group" aria-label={zh ? '快捷指令' : 'Quick prompts'}>
            {PRESETS[zh ? 'zh' : 'en'].map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={state === 'running'}
                // 追加而不是覆盖：常有多条要求叠在一起（"水彩 + 去掉背景"）。
                onClick={() => setPrompt((current) => current.trim() ? `${current.trim()}，${preset}` : preset)}
              >
                {preset}
              </button>
            ))}
          </div>

          <div className="milkdown-image-edit-row">
            <label className="milkdown-image-edit-size">
              {zh ? '比例' : 'Ratio'}
              <select value={size} onChange={(event) => setSize(event.target.value)} disabled={state === 'running'}>
                {sizes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            {options.models && options.models.length > 1 && (
              <label className="milkdown-image-edit-model">
                {zh ? '模型' : 'Model'}
                <select value={model} onChange={(event) => setModel(event.target.value)} disabled={state === 'running'}>
                  {options.models.map((id) => <option key={id} value={id}>{id}</option>)}
                </select>
              </label>
            )}
          </div>

          {error && <p className="milkdown-editor-error" role="alert">{error}</p>}
        </div>

        <section className="milkdown-media-dialog-preview" aria-label={zh ? '预览' : 'Preview'}>
          <div className="milkdown-media-dialog-preview-heading">
            <div>
              <strong>{state === 'done' ? (zh ? '结果' : 'Result') : (zh ? '原图' : 'Original')}</strong>
              <small>
                {state === 'running'
                  ? (zh ? '正在生成，通常十几秒' : 'Generating — usually a few seconds')
                  : state === 'done'
                    ? (zh ? '满意就换上去，不满意可以重新生成' : 'Apply it, or try again')
                    : (zh ? '左侧写清楚要修改的地方' : 'Describe the change on the left')}
              </small>
            </div>
          </div>
          <div className="milkdown-media-dialog-preview-stage">
            {state === 'running'
              ? <div className="milkdown-image-edit-stage is-busy">
                {sourceUrl && <img src={sourceUrl} alt="" className="milkdown-image-edit-source is-dim" />}
                <span className="milkdown-image-edit-busy"><LoaderCircle size={20} className="milkdown-spin" />{zh ? '生成中…' : 'Working…'}</span>
              </div>
              : result
                ? <div className="milkdown-image-edit-stage">
                  <img src={resolveUrl?.(result.url) ?? result.url} alt={result.title ?? ''} />
                </div>
                : sourceUrl
                  ? <div className="milkdown-image-edit-stage"><img src={sourceUrl} alt="" /></div>
                  : <div className="milkdown-media-dialog-preview-empty">{zh ? '生成结果会显示在这里。' : 'The result appears here.'}</div>}
          </div>
        </section>
      </div>

      <footer>
        {state === 'done' && result ? <>
          <button type="button" onClick={reset}>{zh ? '重新生成' : 'Try again'}</button>
          {initial && <button type="button" onClick={() => onSubmit(result, 'insert')}>{zh ? '插成新图' : 'Insert as new'}</button>}
          {/* 这里没有 <form>（弹窗是纯对话框，提交由 run / onSubmit 显式驱动），
              所以必须是 type="button" —— submit 在无表单的上下文里语义是空的。 */}
          <button type="button" className="milkdown-dialog-submit" onClick={() => onSubmit(result, 'replace')}>
            {initial ? (zh ? '换掉这张' : 'Replace this') : (zh ? '插入' : 'Insert')}
          </button>
        </> : <>
          <button type="button" onClick={onClose}>{zh ? '取消' : 'Cancel'}</button>
          <button
            type="button"
            className="milkdown-dialog-submit"
            disabled={!prompt.trim() || state === 'running'}
            onClick={() => void run()}
          >
            {state === 'running'
              ? <><LoaderCircle size={14} className="milkdown-spin" />{zh ? '生成中…' : 'Generating…'}</>
              : (zh ? '开始生成' : 'Generate')}
          </button>
        </>}
      </footer>
    </dialog>,
    document.body,
  )
}
