import 'server-only'

/**
 * 常见相机/镜头品牌名称映射表
 * 用于将 EXIF 中的品牌名称标准化
 */
const BRAND_MAP: Record<string, string> = {
  // Canon
  'CANON': 'Canon',
  'canon': 'Canon',
  'Canon Inc.': 'Canon',
  'CANON INC.': 'Canon',
  
  // Sony
  'SONY': 'Sony',
  'sony': 'Sony',
  'Sony Corporation': 'Sony',
  'SONY CORPORATION': 'Sony',
  
  // Nikon
  'NIKON': 'Nikon',
  'nikon': 'Nikon',
  'NIKON CORPORATION': 'Nikon',
  'Nikon Corporation': 'Nikon',
  
  // Fujifilm
  'FUJIFILM': 'Fujifilm',
  'fujifilm': 'Fujifilm',
  'FUJI': 'Fujifilm',
  'Fuji': 'Fujifilm',
  'FUJI PHOTO FILM CO., LTD.': 'Fujifilm',
  
  // Panasonic
  'PANASONIC': 'Panasonic',
  'panasonic': 'Panasonic',
  'Panasonic Corporation': 'Panasonic',
  
  // Olympus
  'OLYMPUS': 'Olympus',
  'olympus': 'Olympus',
  'OLYMPUS CORPORATION': 'Olympus',
  'OLYMPUS IMAGING CORP.': 'Olympus',
  'OM Digital Solutions': 'OM System',
  
  // Leica
  'LEICA': 'Leica',
  'leica': 'Leica',
  'Leica Camera AG': 'Leica',
  
  // Sigma
  'SIGMA': 'Sigma',
  'sigma': 'Sigma',
  'SIGMA CORPORATION': 'Sigma',
  
  // Tamron
  'TAMRON': 'Tamron',
  'tamron': 'Tamron',
  'TAMRON CO., LTD.': 'Tamron',
  
  // Zeiss
  'ZEISS': 'Zeiss',
  'zeiss': 'Zeiss',
  'Carl Zeiss': 'Zeiss',
  'CARL ZEISS': 'Zeiss',
  
  // Apple
  'APPLE': 'Apple',
  'apple': 'Apple',
  'Apple Inc.': 'Apple',
  
  // Samsung
  'SAMSUNG': 'Samsung',
  'samsung': 'Samsung',
  'Samsung Electronics': 'Samsung',
  
  // Hasselblad
  'HASSELBLAD': 'Hasselblad',
  'hasselblad': 'Hasselblad',
  
  // DJI
  'DJI': 'DJI',
  'dji': 'DJI',
  
  // GoPro
  'GOPRO': 'GoPro',
  'gopro': 'GoPro',
  'GoPro, Inc.': 'GoPro',
  
  // Ricoh
  'RICOH': 'Ricoh',
  'ricoh': 'Ricoh',
  'RICOH IMAGING COMPANY, LTD.': 'Ricoh',
  'PENTAX': 'Pentax',
  'pentax': 'Pentax',
  
  // Viltrox
  'VILTROX': 'Viltrox',
  'viltrox': 'Viltrox',
  
  // Samyang / Rokinon
  'SAMYANG': 'Samyang',
  'samyang': 'Samyang',
  'ROKINON': 'Samyang',
  'rokinon': 'Samyang',
  
  // Tokina
  'TOKINA': 'Tokina',
  'tokina': 'Tokina',
  
  // Voigtlander
  'VOIGTLANDER': 'Voigtlander',
  'voigtlander': 'Voigtlander',
  'Voigtländer': 'Voigtlander',
}

/**
 * 标准化品牌名称（用于展示）
 * @param make 原始品牌名称
 * @returns 标准化后的品牌名称
 */
export function normalizeMake(make: string | null | undefined): string | null {
  if (!make) return null

  const trimmed = make.trim()
  if (!trimmed) return null

  // 先查找映射表
  if (BRAND_MAP[trimmed]) {
    return BRAND_MAP[trimmed]
  }

  // 如果没有找到映射，尝试首字母大写
  const normalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()

  // 再次检查映射表（处理大小写变化后的情况）
  if (BRAND_MAP[normalized]) {
    return BRAND_MAP[normalized]
  }

  return normalized
}

/**
 * 生成品牌键（用于表主键）
 * @param make 标准化品牌名称
 * @returns 规范化品牌键，如 "sony"
 */
export function makeBrandKey(make: string | null | undefined): string | null {
  if (!make) return null
  const normalized = make.trim().toLowerCase()
  if (!normalized) return null
  return normalized.replace(/[^a-z0-9]+/g, '')
}

/**
 * 从镜头型号中提取品牌
 * 某些镜头的 EXIF 中没有单独的品牌字段，需要从型号中提取
 * @param lensModel 镜头型号
 * @returns 提取的品牌名称，如果无法提取则返回 null
 */
export function extractLensMakeFromModel(lensModel: string | null | undefined): string | null {
  if (!lensModel) return null
  
  const model = lensModel.trim().toUpperCase()
  
  // 常见镜头品牌前缀
  const prefixes: [string, string][] = [
    ['SIGMA', 'Sigma'],
    ['TAMRON', 'Tamron'],
    ['ZEISS', 'Zeiss'],
    ['VILTROX', 'Viltrox'],
    ['SAMYANG', 'Samyang'],
    ['ROKINON', 'Samyang'],
    ['TOKINA', 'Tokina'],
    ['VOIGTLANDER', 'Voigtlander'],
    ['LAOWA', 'Laowa'],
    ['7ARTISANS', '7Artisans'],
    ['TTArtisan', 'TTArtisan'],
    ['MEIKE', 'Meike'],
    ['YONGNUO', 'Yongnuo'],
  ]
  
  for (const [prefix, brand] of prefixes) {
    if (model.startsWith(prefix)) {
      return brand
    }
  }
  
  // Canon 镜头型号特征
  if (model.includes('RF ') || model.includes('EF ') || model.includes('EF-S ') || model.includes('EF-M ')) {
    return 'Canon'
  }
  
  // Sony 镜头型号特征
  if (model.includes('FE ') || model.includes('E ') || model.startsWith('SEL')) {
    return 'Sony'
  }
  
  // Nikon 镜头型号特征
  if (model.includes('NIKKOR') || model.includes('AF-S ') || model.includes('AF-P ')) {
    return 'Nikon'
  }
  
  // Fujifilm 镜头型号特征
  if (model.includes('XF ') || model.includes('XC ') || model.includes('GF ')) {
    return 'Fujifilm'
  }
  
  return null
}

/**
 * 清理镜头型号，移除品牌前缀
 * @param lensModel 原始镜头型号
 * @param make 品牌名称
 * @returns 清理后的镜头型号
 */
export function cleanLensModel(lensModel: string | null | undefined, make: string | null): string | null {
  if (!lensModel) return null
  
  let model = lensModel.trim()
  
  // 如果型号以品牌名开头，移除品牌名
  if (make) {
    const makeUpper = make.toUpperCase()
    const modelUpper = model.toUpperCase()
    if (modelUpper.startsWith(makeUpper + ' ')) {
      model = model.slice(make.length + 1).trim()
    } else if (modelUpper.startsWith(makeUpper)) {
      model = model.slice(make.length).trim()
    }
  }
  
  return model || null
}