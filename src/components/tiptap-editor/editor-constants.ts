/**
 * TipTap editor constants - colors, fonts, sizes, and other configuration values
 */

export const IMAGE_WIDTH_PRESETS: Record<'sm' | 'md' | 'lg', number> = {
  sm: 320,
  md: 480,
  lg: 720,
}

export const TAB_INDENT = '\u3000\u3000'
export const DEFAULT_FONT_SIZE_LABEL = '18px'
export const FONT_SIZE_VALUES = ['12px', '14px', '16px', '20px', '24px', '28px'] as const

export const FONT_FAMILY_SANS_VALUE = 'var(--font-sans), ui-sans-serif, system-ui, sans-serif'
export const FONT_FAMILY_SONG_VALUE = '"STSong", "Songti SC", "Noto Serif SC", serif'
export const FONT_FAMILY_HEI_VALUE = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif'
export const FONT_FAMILY_MONO_VALUE = 'ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace'
export const FONT_FAMILY_OPTIMA_VALUE = '"Optima", "Optima-Regular", "PingFang TC", "PingFang SC", "Helvetica Neue", sans-serif'

export const FONT_FAMILY_VALUES = [
  FONT_FAMILY_SANS_VALUE,
  FONT_FAMILY_SONG_VALUE,
  FONT_FAMILY_HEI_VALUE,
  FONT_FAMILY_MONO_VALUE,
  FONT_FAMILY_OPTIMA_VALUE,
] as const

export const DEFAULT_TEXT_HIGHLIGHT = '#fff3a3'
export const BACKGROUND_COLOR_RECENT_LIMIT = 8

export const BASIC_BACKGROUND_COLOR_OPTIONS = [
  '#ffffff', '#f4cccc', '#f9cb9c', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#ead1dc',
  '#f3f3f3', '#f4b6b6', '#f6b26b', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#d5a6bd',
  '#d9d9d9', '#ea9999', '#ffb366', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#c27ba0',
  '#b7b7b7', '#e06666', '#ff8c42', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#a64d79',
] as const

export const MORE_BACKGROUND_COLOR_OPTIONS = [
  '#999999', '#cc0000', '#e69138', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#741b47',
  '#666666', '#990000', '#b45f06', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#4c1130',
  '#000000', '#ff0000', '#ff6d01', '#f6b400', '#00d000', '#00c6e8', '#4a86e8', '#b03af2',
  '#ff2d55', '#ff5f5f', '#ff9f0a', '#ffd60a', '#32d74b', '#64d2ff', '#5e5ce6', '#bf5af2',
] as const

export const PRESET_BACKGROUND_COLOR_VALUES = [
  ...BASIC_BACKGROUND_COLOR_OPTIONS,
  ...MORE_BACKGROUND_COLOR_OPTIONS,
] as const

export const DEFAULT_TEXT_COLOR = '#1f1f1f'
export const TEXT_COLOR_RECENT_LIMIT = 8

export const BASIC_TEXT_COLOR_OPTIONS = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#d9d9d9', '#efefef', '#ffffff',
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#9900ff',
  '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#ead1dc',
] as const

export const MORE_TEXT_COLOR_OPTIONS = [
  '#7f0000', '#cc4125', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#674ea7',
  '#a61c00', '#cc0000', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb',
  '#8e7cc3', '#c27ba0', '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9',
  '#a4c2f4', '#b4a7d6', '#d5a6bd', '#fff2f0', '#f4f4f4', '#1c1c1c', '#0b5394', '#38761d',
] as const

export const PRESET_TEXT_COLOR_VALUES = [
  ...BASIC_TEXT_COLOR_OPTIONS,
  ...MORE_TEXT_COLOR_OPTIONS,
] as const

export const AI_CONTEXT_LIMIT = 500