export type FilmFormat = '135' | '120'

export interface FilmStockPreset {
  id: string
  brand: string
  name: string
  format: FilmFormat
  iso: number
  frameCount: number
  asset?: string
}

export const FILM_FORMATS = ['135', '120'] as const

export const FILM_STOCK_PRESETS = [
  { id: 'lucky-c200-135', brand: '乐凯', name: 'C200', format: '135', iso: 200, frameCount: 36, asset: '/film/leka-c200.png' },
  { id: 'lucky-shd100-135', brand: '乐凯', name: 'SHD 100', format: '135', iso: 100, frameCount: 36 },
  { id: 'lucky-shd400-135', brand: '乐凯', name: 'SHD 400', format: '135', iso: 400, frameCount: 36 },
  { id: 'fujifilm-c200-135', brand: '富士', name: 'C200', format: '135', iso: 200, frameCount: 36 },
  { id: 'fujifilm-superia-xtra-400-135', brand: '富士', name: 'Superia X-TRA 400', format: '135', iso: 400, frameCount: 36 },
  { id: 'fujifilm-pro-400h-120', brand: '富士', name: 'Pro 400H', format: '120', iso: 400, frameCount: 12 },
  { id: 'kodak-gold-200-135', brand: '柯达', name: 'Gold 200', format: '135', iso: 200, frameCount: 36, asset: '/film/koda-gold200.png' },
  { id: 'kodak-colorplus-200-135', brand: '柯达', name: 'ColorPlus 200', format: '135', iso: 200, frameCount: 36 },
  { id: 'kodak-ultramax-400-135', brand: '柯达', name: 'UltraMax 400', format: '135', iso: 400, frameCount: 36 },
  { id: 'kodak-portra-160-120', brand: '柯达', name: 'Portra 160', format: '120', iso: 160, frameCount: 12 },
  { id: 'kodak-portra-400-135', brand: '柯达', name: 'Portra 400', format: '135', iso: 400, frameCount: 36 },
  { id: 'kodak-portra-400-120', brand: '柯达', name: 'Portra 400', format: '120', iso: 400, frameCount: 12 },
  { id: 'kodak-ektar-100-135', brand: '柯达', name: 'Ektar 100', format: '135', iso: 100, frameCount: 36 },
  { id: 'kodak-ektar-100-120', brand: '柯达', name: 'Ektar 100', format: '120', iso: 100, frameCount: 12 },
  { id: 'ilford-hp5-plus-400-135', brand: 'Ilford', name: 'HP5 Plus 400', format: '135', iso: 400, frameCount: 36 },
  { id: 'ilford-hp5-plus-400-120', brand: 'Ilford', name: 'HP5 Plus 400', format: '120', iso: 400, frameCount: 12 },
  { id: 'ilford-delta-400-135', brand: 'Ilford', name: 'Delta 400', format: '135', iso: 400, frameCount: 36 },
  { id: 'cinestill-800t-135', brand: 'CineStill', name: '800T', format: '135', iso: 800, frameCount: 36 },
  { id: 'cinestill-800t-120', brand: 'CineStill', name: '800T', format: '120', iso: 800, frameCount: 12 },
  { id: 'cinestill-400d-135', brand: 'CineStill', name: '400D', format: '135', iso: 400, frameCount: 36 },
  { id: 'lomography-color-negative-400-135', brand: 'Lomography', name: 'Color Negative 400', format: '135', iso: 400, frameCount: 36 },
  { id: 'lomography-color-negative-800-120', brand: 'Lomography', name: 'Color Negative 800', format: '120', iso: 800, frameCount: 12 },
] satisfies FilmStockPreset[]

export const DEFAULT_FILM_STOCK_ASSET = '/film/general-135.png'

export const FILM_STOCK_BRANDS = Array.from(new Set(FILM_STOCK_PRESETS.map((preset) => preset.brand)))

function normalizeFilmText(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

export function getFilmStockNames(brand: string, format: FilmFormat) {
  return Array.from(
    new Set(
      FILM_STOCK_PRESETS
        .filter((preset) => preset.brand === brand && preset.format === format)
        .map((preset) => preset.name),
    ),
  )
}

export function findFilmStockPreset(brand: string, name: string, format?: FilmFormat) {
  const normalizedBrand = normalizeFilmText(brand)
  const normalizedName = normalizeFilmText(name)

  return FILM_STOCK_PRESETS.find((preset) => {
    return (
      normalizeFilmText(preset.brand) === normalizedBrand &&
      normalizeFilmText(preset.name) === normalizedName &&
      (format === undefined || preset.format === format)
    )
  })
}

export function getFilmStockAsset(brand: string, name: string, format?: FilmFormat) {
  return findFilmStockPreset(brand, name, format)?.asset ?? DEFAULT_FILM_STOCK_ASSET
}
