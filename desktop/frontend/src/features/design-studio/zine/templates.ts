import type { ZineCustomSizeMm, ZinePageOrientation, ZinePageSize } from '@/lib/zine/types'

export interface ZineStarterOptions {
  pageSize: ZinePageSize
  pageOrientation: ZinePageOrientation
  customSizeMm?: ZineCustomSizeMm
}

export interface ZineStarterTemplate {
  id: string
  titleKey: string
  descriptionKey: string
  sizeLabel: string
  options?: ZineStarterOptions
  preview: 'portrait' | 'landscape' | 'square' | 'custom'
}

export const ZINE_STARTER_TEMPLATES: ZineStarterTemplate[] = [
  {
    id: 'a5-portrait',
    titleKey: 'admin.design_template_a5_portrait',
    descriptionKey: 'admin.design_template_a5_portrait_description',
    sizeLabel: 'A5 · 148×210 mm',
    options: { pageSize: 'a5', pageOrientation: 'portrait' },
    preview: 'portrait',
  },
  {
    id: 'b5-portrait',
    titleKey: 'admin.design_template_b5_portrait',
    descriptionKey: 'admin.design_template_b5_portrait_description',
    sizeLabel: 'B5 · 176×250 mm',
    options: { pageSize: 'b5', pageOrientation: 'portrait' },
    preview: 'portrait',
  },
  {
    id: 'square',
    titleKey: 'admin.design_template_square',
    descriptionKey: 'admin.design_template_square_description',
    sizeLabel: '200×200 mm',
    options: { pageSize: 'square', pageOrientation: 'portrait' },
    preview: 'square',
  },
  {
    id: 'a4-landscape',
    titleKey: 'admin.design_template_a4_landscape',
    descriptionKey: 'admin.design_template_a4_landscape_description',
    sizeLabel: 'A4 · 297×210 mm',
    options: { pageSize: 'a4', pageOrientation: 'landscape' },
    preview: 'landscape',
  },
  {
    id: 'custom',
    titleKey: 'admin.design_template_custom',
    descriptionKey: 'admin.design_template_custom_description',
    sizeLabel: '',
    preview: 'custom',
  },
]
