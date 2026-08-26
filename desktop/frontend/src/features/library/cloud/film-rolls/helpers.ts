import type { CSSProperties } from 'react'

import { FILM_FORMATS, FILM_STOCK_BRANDS, FILM_STOCK_PRESETS, type FilmFormat } from '@/lib/film-presets'
import type { FilmRollDTO, WailsAppAPI } from './types'

export const FORMAT_OPTIONS = FILM_FORMATS.map(value => ({ value, label: value }))
export const BRAND_OPTIONS = FILM_STOCK_BRANDS.map(value => ({ value, label: value }))

// 视图与排序偏好持久化到 localStorage：跨页面/重启保留（与照片库一致）
export const VIEW_MODE_KEY = 'mo-gallery:film-rolls:view-mode'
export const SORT_KEY = 'mo-gallery:film-rolls:sort'
export const DEFAULT_SORT = 'createdAt:desc'

export const SORT_OPTIONS = [
  { value: 'shootDate:desc', labelKey: 'admin.film_roll_sort_shoot_desc' },
  { value: 'shootDate:asc', labelKey: 'admin.film_roll_sort_shoot_asc' },
  { value: 'createdAt:desc', labelKey: 'admin.film_roll_sort_created_desc' },
  { value: 'createdAt:asc', labelKey: 'admin.film_roll_sort_created_asc' },
] as const

export const formInputClass = 'w-full rounded-lg border bg-input px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20'

export function readLocal(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

export function writeLocal(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // ignore quota / privacy mode errors
  }
}

export function appApi(): WailsAppAPI {
  const app = window.go?.main?.App
  if (!app) throw new Error('Wails API is not available')
  return app
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function currentFormat(roll?: FilmRollDTO | null): FilmFormat {
  return roll?.format === '120' ? '120' : '135'
}

export function normalizeRoll(roll: FilmRollDTO): FilmRollDTO {
  return {
    ...roll,
    format: currentFormat(roll),
    filmPhotos: roll.filmPhotos ?? [],
    photoCount: roll.photoCount ?? roll.filmPhotos?.length ?? 0,
  }
}

export function newDraftRoll(): FilmRollDTO {
  const preset = FILM_STOCK_PRESETS[0]
  const now = new Date().toISOString()
  return {
    id: '',
    name: preset.name,
    brand: preset.brand,
    format: preset.format,
    iso: preset.iso,
    frameCount: preset.frameCount,
    notes: null,
    shootDate: null,
    endDate: null,
    createdAt: now,
    updatedAt: now,
    photoCount: 0,
    filmPhotos: [],
  }
}

export function presetFor(brand: string, name: string, format: FilmFormat) {
  return FILM_STOCK_PRESETS.find(item => item.brand === brand && item.name === name && item.format === format)
}

export function isoFromDateInput(value: string) {
  return value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null
}

export function dateInputValue(value?: string | null) {
  return value ? value.slice(0, 10) : ''
}

export function inputStyle(): CSSProperties {
  return { borderColor: 'var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }
}
