'use client'

import { useEffect, useMemo, useState } from 'react'
import type { EditorView } from '@milkdown/kit/prose/view'
import { getSelectedTextStyle, setTextStyle } from './text-style-plugin'

export type ColorField = 'color' | 'background'

export interface ColorPaletteProps {
  field: ColorField
  view: EditorView
  language: 'zh' | 'en'
  anchor: { top: number; left: number; bottom: number; right: number }
  onClose: () => void
}

const BASE_COLORS = [
  '#ffffff', '#ffd6d6', '#ffdeb0', '#ffffc8', '#c8ff00', '#70f0d0', '#a9c8ff', '#ffabd1', '#ff83a8',
  '#d8d8d8', '#ff9f9f', '#ffb58f', '#ffff00', '#6cff78', '#00e8e8', '#72a9ff', '#d94aa8', '#ff4770',
  '#b5b5b5', '#d99e9e', '#ff5d20', '#ffd84a', '#00c900', '#16c8e8', '#087dff', '#a638ef', '#ff2442',
  '#8b8b8b', '#864444', '#ff3c00', '#ffa900', '#36a64b', '#40a9d1', '#064cff', '#7950d8', '#d91f43',
  '#000000', '#8e0d00', '#ff4545', '#d4ac3e', '#247900', '#067da6', '#071db8', '#7a82ac', '#ae173f',
] as const

function validHex(value: string) { return /^#[\da-f]{6}$/i.test(value) }

function hslToHex(hue: number, saturation: number, lightness: number) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const segment = hue / 60
  const x = chroma * (1 - Math.abs(segment % 2 - 1))
  const [r, g, b] = segment < 1 ? [chroma, x, 0] : segment < 2 ? [x, chroma, 0] : segment < 3 ? [0, chroma, x] : segment < 4 ? [0, x, chroma] : segment < 5 ? [x, 0, chroma] : [chroma, 0, x]
  const match = lightness - chroma / 2
  return `#${[r, g, b].map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, '0')).join('')}`
}

export function ColorPalette({ field, view, language, anchor, onClose }: ColorPaletteProps) {
  const zh = language === 'zh'
  const initial = getSelectedTextStyle(view.state)[field]
  const [tab, setTab] = useState<'base' | 'more'>('base')
  const [value, setValue] = useState(validHex(initial || '') ? initial! : '#ff0000')
  const [hex, setHex] = useState(value)
  const [hue, setHue] = useState(0)
  const [error, setError] = useState(false)
  const recentKey = `mo-milkdown-recent-${field}`
  const recent = useMemo(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(recentKey) || '[]')
      return Array.isArray(parsed) ? parsed.filter((item): item is string => validHex(item)).slice(0, 9) : []
    } catch { return [] }
  }, [recentKey])

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest('[data-mo-color-palette]')) onClose()
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', close, true)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', close, true)
      document.removeEventListener('keydown', escape)
    }
  }, [onClose])

  const choose = (next: string) => { setValue(next); setHex(next); setError(false) }
  const clear = () => {
    setTextStyle(field, null)(view.state, view.dispatch, view)
    view.focus()
    onClose()
  }
  const confirm = () => {
    const next = hex.trim().startsWith('#') ? hex.trim() : `#${hex.trim()}`
    if (!validHex(next)) { setError(true); return }
    const recentValues = [next.toLowerCase(), ...recent.filter((item) => item.toLowerCase() !== next.toLowerCase())].slice(0, 9)
    try { localStorage.setItem(recentKey, JSON.stringify(recentValues)) } catch { /* storage may be unavailable */ }
    setTextStyle(field, next)(view.state, view.dispatch, view)
    view.focus()
    onClose()
  }
  const setHueAndColor = (nextHue: number) => { setHue(nextHue); choose(hslToHex(nextHue, 1, 0.5)) }
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - 380))

  return <div className="mo-color-palette" data-mo-color-palette role="dialog" aria-label={zh ? '选择颜色' : 'Choose color'} style={{ top: anchor.bottom + 8, left }}>
    <div className="mo-color-palette-recent-title">{zh ? '最近使用颜色' : 'Recently used colors'}</div>
    <div className="mo-color-palette-recent">
      <button type="button" className="mo-color-clear" aria-label={zh ? '默认颜色' : 'Default color'} onClick={clear} />
      {recent.map((item) => <button key={item} type="button" className={`mo-color-recent${item.toLowerCase() === value.toLowerCase() ? ' selected' : ''}`} style={{ background: item }} aria-label={item} onClick={() => choose(item)} />)}
    </div>
    <div className="mo-color-palette-tabs" role="tablist">
      <button type="button" role="tab" aria-selected={tab === 'base'} className={tab === 'base' ? 'active' : ''} onClick={() => setTab('base')}>{zh ? '基础色' : 'Basic colors'}</button>
      <button type="button" role="tab" aria-selected={tab === 'more'} className={tab === 'more' ? 'active' : ''} onClick={() => setTab('more')}>{zh ? '更多颜色' : 'More colors'}</button>
    </div>
    {tab === 'base' ? <div className="mo-color-base-grid">{BASE_COLORS.map((item) => <button key={item} type="button" className={item === value ? 'selected' : ''} style={{ background: item }} aria-label={item} onClick={() => choose(item)} />)}</div> : <div className="mo-color-more">
      <div className="mo-color-spectrum" style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue} 100% 50%))` }} onPointerDown={(event) => {
        const element = event.currentTarget
        const rect = element.getBoundingClientRect()
        const update = (clientX: number, clientY: number) => {
          const saturation = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
          const lightness = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height))
          choose(hslToHex(hue, saturation, lightness))
        }
        update(event.clientX, event.clientY)
        const move = (moveEvent: PointerEvent) => update(moveEvent.clientX, moveEvent.clientY)
        const stop = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', stop) }
        document.addEventListener('pointermove', move)
        document.addEventListener('pointerup', stop)
      }} />
      <input className="mo-color-hue" type="range" min="0" max="360" value={hue} onChange={(event) => setHueAndColor(Number(event.target.value))} aria-label={zh ? '色相' : 'Hue'} />
    </div>}
    <div className="mo-color-palette-confirm"><span className="mo-color-preview" style={{ background: value }} /><input value={hex} aria-label="HEX" onChange={(event) => { setHex(event.target.value); setError(false) }} onKeyDown={(event) => { if (event.key === 'Enter') confirm() }} /><button type="button" onClick={confirm}>{zh ? '确认' : 'Confirm'}</button></div>
    {error && <div className="mo-color-error" role="alert">{zh ? '请输入六位十六进制颜色' : 'Enter a six-digit hex color'}</div>}
  </div>
}
