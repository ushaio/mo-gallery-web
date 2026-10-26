'use client'

import { createElement, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { renderToStaticMarkup } from 'react-dom/server'
import { Check, RotateCcw, Sparkles, X } from 'lucide-react'
import { MilkdownContent } from './MilkdownContent'
import { diffSegments, diffStats } from './polish-diff'
import type { DiffSegment } from './polish-diff'
import type { MediaUrlResolver } from './media'
import { buildBlockDiff } from './render-diff'
import type { BlockDiff, BlockRow } from './render-diff'

export interface PolishDialogProps {
  language: 'zh' | 'en'
  /** 按钮文案，同时用作浮窗标题；缺省「AI 润色」。 */
  label: string
  /** 这次改动是谁提出的：工具栏润色，还是对话框里的 AI 工具改稿。只影响两栏的标题措辞。 */
  variant?: 'polish' | 'edit'
  /** 选区原文（整篇时是整篇的 Markdown）。 */
  before: string
  /** 润色结果；流式期间一直在长。 */
  after: string
  streaming: boolean
  /** 图片地址解析：与编辑器同一口径，否则对照里的媒体卡会是一堆无法显示的地址。 */
  resolveMediaUrl?: MediaUrlResolver
  /** 用润色结果替换正文（替换走后一次事务，可整步撤销）。 */
  onAccept: () => void
  /** 放弃这次结果，正文一个字都不动。 */
  onReject: () => void
  /** 重新生成；外部 AI 工具给出的定稿内容没有这个动作，缺省即不显示按钮。 */
  onRetry?: () => void
  /** 生成过程中中断请求。 */
  onStop: () => void
}

const labels = {
  zh: {
    before: '原文', after: '润色后', generating: '正在润色…', stop: '停止', retry: '重新生成',
    accept: '替换原文', reject: '放弃', hint: '确认前正文不会有任何改动；替换后可用 Ctrl+Z 整步撤销。',
    unchanged: '与原文完全一致', empty: '（空）', card: '［媒体卡片］', noBlock: '（无）',
    changes: (count: number) => `${count} 处改动`,
  },
  en: {
    before: 'Before', after: 'After', generating: 'Polishing…', stop: 'Stop', retry: 'Regenerate',
    accept: 'Replace', reject: 'Discard', hint: 'Nothing changes until you confirm. The replacement is a single undo step.',
    unchanged: 'Identical to the original', empty: '(empty)', card: '[media card]', noBlock: '(none)',
    changes: (count: number) => `${count} change${count === 1 ? '' : 's'}`,
  },
}

/**
 * 只影响显示：正文里的媒体卡在 Markdown 里是一条 `::media{...}` 指令，属性是一长串 JSON。
 *
 * 渲染式对照里不需要它（媒体卡会渲染成真正的卡片），但流式阶段只能铺原文，
 * 那时它还是一条裸指令，换成一个短标记，用户照样看得出「这里有一张卡、位置没动」。
 */
const MEDIA_DIRECTIVE = /::[a-z-]+\{[^}\n]*\}/g

function forDisplay(text: string, card: string): string {
  return text.replace(MEDIA_DIRECTIVE, card)
}

function renderSegments(segments: DiffSegment[], keep: 'same' | 'remove' | 'add') {
  return segments.map((segment, index) => {
    if (segment.type === 'same' || segment.type === keep) {
      if (segment.type === 'same') return <span key={index}>{segment.text}</span>
      return segment.type === 'remove'
        ? <del key={index} className="milkdown-polish-del">{segment.text}</del>
        : <ins key={index} className="milkdown-polish-ins">{segment.text}</ins>
    }
    return null
  })
}

/**
 * Markdown → 与预览/发布同一套渲染器的 HTML。
 *
 * `MilkdownContent` 是只读渲染器（不加载 Crepe / ProseMirror），桌面端的「云端 vs 本地」
 * 冲突弹窗用的就是它，这里保持一致：对照里看到的段落、图片卡、图注，与文章页上看到的一样。
 */
function renderMarkdownHtml(markdown: string, resolveMediaUrl?: MediaUrlResolver): string {
  if (!markdown.trim()) return ''
  try {
    return renderToStaticMarkup(createElement(MilkdownContent, { content: markdown, resolveMediaUrl, showUploadStatus: false }))
  } catch {
    // 渲染器吞不下的内容（半截 HTML、坏掉的指令）不该让对照整个打不开：退回纯文本对照。
    return ''
  }
}

/**
 * 「AI 润色」的结果预览浮窗。
 *
 * Crepe 自带的 AI 差异审阅是**编辑器内**的行内装饰：结果先写在正文里再用行内标记
 * 圈出来。润色这种「整段改写」的改动量下那套很难读，也让人分不清哪些是已生效的
 * 文本，所以这里改成：模型输出只进浮窗，确认后才动正文。
 *
 * 对照本身跟「云端 vs 本地」冲突弹窗同一套做法（见 render-diff.ts）：两侧先各自渲染成
 * HTML、再按顶层区块对齐，一行一块地并排显示。润色整篇时用源码行对照基本没法读 ——
 * 一条 `::media{...}` 就是一行几百字的 JSON，而用户想看的其实是「这几段被改成了什么样」。
 */
export function PolishDialog({ language, label, variant = 'polish', before, after, streaming, resolveMediaUrl, onAccept, onReject, onRetry, onStop }: PolishDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const zh = language !== 'en'
  const text = labels[zh ? 'zh' : 'en']
  // 「润色后」在工具改稿的场景里是错的措辞：那次改动可能只是改了个错别字或换了语序。
  const beforeTitle = variant === 'edit' ? (zh ? '修改前' : 'Before edit') : text.before
  const afterTitle = variant === 'edit' ? (zh ? '修改后' : 'After edit') : text.after

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  // 流式期间每来一小段就重算一次渲染与对齐毫无意义（而且会跟光标抢视觉重点）：
  // 生成中只铺原文，生成完再算一次渲染式对照。
  const shownBefore = useMemo(() => forDisplay(before, text.card), [before, text.card])
  const shownAfter = useMemo(() => forDisplay(after, text.card), [after, text.card])

  // 渲染 + 对齐只在生成结束后做一次；渲染不出区块（内容都是空标签之类）时返回 null，退回纯文本对照。
  //
  // 解析器走 ref：宿主的 `resolveMediaUrl` 常是每次渲染新建的箭头函数，直接进依赖会让
  // 「父组件抖一下就把整篇 Markdown 重新渲染两遍」，而地址解析的差异只在换文档时才有意义。
  const resolverRef = useRef(resolveMediaUrl)
  resolverRef.current = resolveMediaUrl
  const blockDiff = useMemo<BlockDiff | null>(() => {
    if (streaming) return null
    const diff = buildBlockDiff(renderMarkdownHtml(before, resolverRef.current), renderMarkdownHtml(after, resolverRef.current))
    return diff.rows.length > 0 ? diff : null
  }, [streaming, before, after])

  const plainDiff = useMemo(
    () => (streaming || blockDiff ? null : diffSegments(shownBefore, shownAfter)),
    [streaming, blockDiff, shownBefore, shownAfter],
  )
  // 生成过程中右侧还在长，左侧（原文）是完整的：让它先按渲染结果铺开，
  // 用户不用盯着一屏 Markdown 源码等模型（整篇润色时那屏源码尤其没法看）。
  const beforeHtml = useMemo(
    () => (!blockDiff ? renderMarkdownHtml(before, resolverRef.current) : ''),
    [blockDiff, before],
  )
  const stats = plainDiff ? diffStats([...plainDiff.left, ...plainDiff.right]) : { removed: 0, added: 0 }
  const identical = !streaming && before === after

  const meta = () => {
    if (streaming) return text.generating
    if (identical) return text.unchanged
    if (blockDiff) return blockDiff.changed > 0 ? text.changes(blockDiff.changed) : text.unchanged
    return (
      <>
        {stats.removed ? <em className="is-removed">−{stats.removed}</em> : null}
        {stats.added ? <em className="is-added">+{stats.added}</em> : null}
        <>{zh ? ' 字' : ' chars'}</>
      </>
    )
  }

  const cell = (side: 'left' | 'right', row: BlockRow) => {
    const block = side === 'left' ? row.left : row.right
    const changed = row.type === 'modify' || (side === 'left' ? row.type === 'del' : row.type === 'add')
    const tone = !block ? 'is-empty' : changed ? (side === 'left' ? 'is-del' : 'is-add') : 'is-same'
    return (
      <div className={`milkdown-polish-cell ${tone}`}>
        {block
          ? <div dangerouslySetInnerHTML={{ __html: block.html }} />
          : <span className="milkdown-polish-cell-empty">{text.noBlock}</span>}
      </div>
    )
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className="milkdown-polish-dialog"
      aria-labelledby="milkdown-polish-dialog-title"
      onCancel={(event) => { event.preventDefault(); onReject() }}
      onClick={(event) => { if (event.target === event.currentTarget) onReject() }}
    >
      <header>
        <div className="milkdown-polish-heading">
          <Sparkles size={16} aria-hidden />
          <h2 id="milkdown-polish-dialog-title">{label}</h2>
          <span className="milkdown-polish-meta">{meta()}</span>
        </div>
        <button type="button" className="milkdown-polish-close" onClick={onReject} aria-label={zh ? '关闭' : 'Close'}>
          <X size={16} aria-hidden />
        </button>
      </header>

      {blockDiff ? (
        <div className="milkdown-polish-body milkdown-polish-body--rows">
          <div className="milkdown-polish-row-head">
            <span>{beforeTitle}</span>
            <span>{afterTitle}</span>
          </div>
          {blockDiff.rows.map((row, index) => (
            <div className={`milkdown-polish-row is-${row.type}`} key={index}>
              {cell('left', row)}
              {cell('right', row)}
            </div>
          ))}
        </div>
      ) : (
        <div className="milkdown-polish-body">
          <section className="milkdown-polish-panel" aria-label={beforeTitle}>
            <div className="milkdown-polish-panel-head"><strong>{beforeTitle}</strong><small>{shownBefore.length || 0} {zh ? '字' : 'chars'}</small></div>
            <div className={`milkdown-polish-text${beforeHtml && !plainDiff ? ' milkdown-polish-text--html' : ''}`}>
              {before
                ? (plainDiff
                  ? renderSegments(plainDiff.left, 'remove')
                  : beforeHtml
                    ? <div dangerouslySetInnerHTML={{ __html: beforeHtml }} />
                    : shownBefore)
                : <span className="milkdown-polish-empty">{text.empty}</span>}
            </div>
          </section>
          <section className="milkdown-polish-panel" aria-label={afterTitle}>
            <div className="milkdown-polish-panel-head">
              <strong>{afterTitle}</strong>
              <small>{shownAfter.length || 0} {zh ? '字' : 'chars'}</small>
            </div>
            <div className="milkdown-polish-text">
              {after
                ? (plainDiff ? renderSegments(plainDiff.right, 'add') : <>{shownAfter}<span className="milkdown-polish-caret" aria-hidden /></>)
                : (streaming ? <span className="milkdown-polish-caret" aria-hidden /> : <span className="milkdown-polish-empty">{text.empty}</span>)}
            </div>
          </section>
        </div>
      )}

      <footer>
        <p className="milkdown-polish-hint">{text.hint}</p>
        <div className="milkdown-polish-actions">
          {streaming
            ? <button type="button" onClick={onStop}>{text.stop}</button>
            : <>
              <button type="button" onClick={onReject}>{text.reject}</button>
              {onRetry && <button type="button" onClick={onRetry} disabled={!before}>
                <RotateCcw size={14} aria-hidden />{text.retry}
              </button>}
              <button type="button" className="milkdown-polish-accept" onClick={onAccept} disabled={!after}>
                <Check size={14} aria-hidden />{text.accept}
              </button>
            </>}
        </div>
      </footer>
    </dialog>,
    document.body,
  )
}
