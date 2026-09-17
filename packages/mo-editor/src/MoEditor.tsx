'use client'

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { MoEditorPlugin } from './plugin'
import type { MoEditorRuntime } from './runtime'
import './mo-editor.css'

export interface MoJsonContent { type?: string; text?: string; attrs?: Record<string, unknown>; content?: MoJsonContent[]; [key: string]: unknown }
export interface MoEditorProps {
  value: string; jsonValue?: MoJsonContent | null; onChange: (value: string) => void; onJsonChange?: (value: MoJsonContent) => void
  placeholder?: string; onPasteFiles?: (files: File[]) => void | Promise<void>; className?: string
  toolbarAfterRedoAction?: { title: string; onClick: () => void; icon: React.ReactNode; disabled?: boolean }
  runtime: MoEditorRuntime; documentId?: string; documentKind?: 'story' | 'blog'; contentVersion?: string | number
  onAiTaskLockChange?: (locked: boolean) => void; aiOptions?: { enabled: boolean; token?: string | null; scopeId?: string; title?: string }
  plugins?: MoEditorPlugin[]
}
export interface MoEditorHandle {
  getValue: () => string; getJsonValue: () => MoJsonContent | null; setValue: (html: string) => void; insertValue: (html: string) => void
  insertMarkdown: (markdown: string) => void; replaceText: (search: string, next: string) => boolean; insertImageUploadPlaceholder: (input: { uploadId: string; fileName: string; imageWidth: number; imageHeight: number }) => boolean
  resolveImageUploadPlaceholder: (uploadId: string, image: { src: string; alt?: string; photoId?: string }) => boolean; failImageUploadPlaceholder: (uploadId: string) => boolean
  scaleFirstImage: (mode: 'sm' | 'md' | 'lg') => boolean; focus: () => void; runPluginCommand?: (id: string) => boolean
}

const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const md = (text: string) => text.split(/\r?\n\r?\n/).map((block) => {
  const lines = block.split(/\r?\n/); const heading = lines.length === 1 ? lines[0].match(/^(#{1,6})\s+(.+)$/) : null
  if (heading) return `<h${heading[1].length}>${escape(heading[2])}</h${heading[1].length}>`
  if (lines.every((line) => /^\s*[-*+]\s+/.test(line))) return `<ul>${lines.map((line) => `<li>${escape(line.replace(/^\s*[-*+]\s+/, ''))}</li>`).join('')}</ul>`
  if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line))) return `<ol>${lines.map((line) => `<li>${escape(line.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`
  return `<p>${escape(block).replace(/\n/g, '<br>')}</p>`
}).join('')
const markdown = (value: string) => /(^|\n)\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s)/.test(value) && !/<[a-z][\s\S]*>/i.test(value)
const toJson = (el: HTMLElement): MoJsonContent => ({ type: 'doc', content: Array.from(el.children).map((child) => ({ type: child.tagName.toLowerCase() === 'ul' ? 'bulletList' : child.tagName.toLowerCase() === 'ol' ? 'orderedList' : child.tagName.toLowerCase() === 'li' ? 'listItem' : child.tagName.toLowerCase() === 'p' ? 'paragraph' : child.tagName.toLowerCase() === 'h1' || child.tagName.toLowerCase() === 'h2' || child.tagName.toLowerCase() === 'h3' ? 'heading' : 'paragraph', ...(child.textContent ? { content: [{ type: 'text', text: child.textContent }] } : {}) })) })

const buttons = [['bold', '粗体'], ['italic', '斜体'], ['underline', '下划线'], ['strikeThrough', '删除线'], ['insertUnorderedList', '项目符号'], ['insertOrderedList', '编号列表'], ['undo', '撤销'], ['redo', '重做']] as const

export const MoEditor = forwardRef<MoEditorHandle, MoEditorProps>(({ value, onChange, onJsonChange, placeholder, onPasteFiles, className, toolbarAfterRedoAction, contentVersion, plugins = [], runtime }, ref) => {
  type PluginEntry = { run: (id: string) => boolean; cleanup?: () => void; context: import('./plugin').MoEditorPluginContext }
  const rootRef = useRef<HTMLDivElement>(null); const contexts = useRef<PluginEntry[]>([]); const current = useRef(value); const [empty, setEmpty] = useState(!value)
  const emit = useCallback(() => { const root = rootRef.current; if (!root) return; current.current = root.innerHTML; setEmpty(!root.textContent?.trim() && !root.querySelector('img')); onChange(root.innerHTML); onJsonChange?.(toJson(root)); plugins.forEach((plugin, index) => plugin.onChange?.(root.innerHTML, contexts.current[index]?.context)) }, [onChange, onJsonChange, plugins])
  useEffect(() => { const root = rootRef.current; if (!root) return; contexts.current.forEach((entry) => entry.cleanup?.()); contexts.current = plugins.map((plugin) => { const commands = new Map<string, () => void>(); const context: import('./plugin').MoEditorPluginContext = { root, storage: new Map<string, unknown>(), registerCommand: (id, command) => commands.set(id, command), unregisterCommand: (id) => commands.delete(id) }; Object.entries(plugin.commands ?? {}).forEach(([id, command]) => context.registerCommand(`${plugin.id}:${id}`, () => command(context))); const cleanup = plugin.onLoad?.(context); return { run: (id) => { const command = commands.get(id); if (!command) return false; command(); return true }, cleanup: typeof cleanup === 'function' ? cleanup : undefined, context } }) ; return () => { contexts.current.forEach((entry) => entry.cleanup?.()); contexts.current = [] } }, [plugins])
  useEffect(() => { const root = rootRef.current; if (!root) return; if (contentVersion !== undefined || root.innerHTML !== value) { root.innerHTML = value ? (markdown(value) ? md(plugins.reduce((v, p) => p.transformMarkdown?.(v) ?? v, value)) : value) : ''; current.current = root.innerHTML; setEmpty(!root.textContent?.trim()) } }, [value, contentVersion, plugins])
  const exec = useCallback((command: string, arg?: string) => { rootRef.current?.focus(); document.execCommand(command, false, arg); emit() }, [emit])
  useImperativeHandle(ref, () => ({ getValue: () => rootRef.current?.innerHTML ?? current.current, getJsonValue: () => rootRef.current ? toJson(rootRef.current) : null, setValue: (html) => { if (rootRef.current) { rootRef.current.innerHTML = markdown(html) ? md(html) : html; emit() } }, insertValue: (html) => exec('insertHTML', html), insertMarkdown: (text) => exec('insertHTML', md(text)), replaceText: (search, next) => { const root = rootRef.current; if (!root || !root.innerHTML.includes(search)) return false; root.innerHTML = root.innerHTML.replace(search, next); emit(); return true }, insertImageUploadPlaceholder: ({ uploadId, fileName }) => { exec('insertHTML', `<span data-mo-upload-id="${escape(uploadId)}">Uploading ${escape(fileName)}...</span>`); return true }, resolveImageUploadPlaceholder: (id, image) => { const el = rootRef.current?.querySelector(`[data-mo-upload-id="${CSS.escape(id)}"]`); if (!el) return false; const img = document.createElement('img'); img.src = image.src; img.alt = image.alt ?? ''; el.replaceWith(img); emit(); return true }, failImageUploadPlaceholder: (id) => { const el = rootRef.current?.querySelector(`[data-mo-upload-id="${CSS.escape(id)}"]`); if (!el) return false; el.textContent = 'Upload failed'; emit(); return true }, scaleFirstImage: (mode) => { const img = rootRef.current?.querySelector('img'); if (!img) return false; img.style.width = mode === 'sm' ? '50%' : mode === 'md' ? '75%' : '100%'; emit(); return true }, focus: () => rootRef.current?.focus(), runPluginCommand: (id) => contexts.current.some((ctx) => ctx.run(id)) }), [emit, exec])
  return <div className={`tiptap-editor mo-editor ${runtime.resolvedTheme === 'dark' ? 'tiptap-dark' : 'tiptap-light'} ${className ?? ''}`}><div className="mo-editor-toolbar tiptap-toolbar-scroll" role="toolbar">{buttons.map(([command, label]) => <button key={command} type="button" title={label} onMouseDown={(e) => e.preventDefault()} onClick={() => exec(command)}>{label}</button>)}<button type="button" onClick={() => { const url = window.prompt('链接地址'); if (url) exec('createLink', url) }}>链接</button><button type="button" onClick={() => { const url = window.prompt('图片地址'); if (url) exec('insertHTML', `<img src="${escape(url)}" alt="" />`) }}>图片</button>{toolbarAfterRedoAction ? <button type="button" title={toolbarAfterRedoAction.title} disabled={toolbarAfterRedoAction.disabled} onClick={toolbarAfterRedoAction.onClick}>{toolbarAfterRedoAction.icon}</button> : null}</div><div ref={rootRef} className={`tiptap mo-editor-canvas${empty ? ' is-editor-empty' : ''}`} contentEditable suppressContentEditableWarning data-placeholder={placeholder ?? '开始写作…'} onInput={emit} onPaste={(event) => { const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/')); if (files.length) { event.preventDefault(); void onPasteFiles?.(files); } else if (markdown(event.clipboardData.getData('text/plain'))) { event.preventDefault(); exec('insertHTML', md(event.clipboardData.getData('text/plain'))) } }} /></div>
})
MoEditor.displayName = 'MoEditor'
export default MoEditor
