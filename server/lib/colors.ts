import sharp from 'sharp'

/**
 * CIELAB-based dominant color extraction algorithm.
 *
 * Fully identical to the desktop Go implementation in `emulsion-desktop/local_library/media.go`:
 * 1. Multi-pass threshold filtering (filtering extreme shadows, highlights and desaturated noise).
 * 2. CIELAB perceptual color space quantisation with LUT acceleration.
 * 3. Spatial center weighting (center bonus up to 2.6x) + Chroma boosting.
 * 4. DeltaE-76 perceptual deduplication (collapsing swatches closer than dE=12.0 to avoid duplicate backgrounds).
 */

const DOMINANT_COLOR_CENTER_BONUS = 1.6
const DOMINANT_COLOR_MIN_DELTA_E = 12.0

interface DominantColorPass {
  minL: number
  maxL: number
  minChroma: number
  ignoreAlpha?: boolean
}

// Tried in order until one yields a palette. The relaxed passes ensure dark or monochrome images still produce colors.
const DOMINANT_COLOR_PASSES: DominantColorPass[] = [
  { minL: 25, maxL: 95, minChroma: 8 },
  { minL: 8, maxL: 98, minChroma: 3 },
  { minL: 0, maxL: 101, minChroma: 0 },
  { minL: 0, maxL: 101, minChroma: 0, ignoreAlpha: true },
]

interface DominantColorBucket {
  weight: number
  r: number
  g: number
  b: number
}

interface LabColor {
  l: number
  a: number
  b: number
}

// Precomputed sRGB to Linear conversion table
const srgbToLinearLUT = new Float64Array(256)
for (let i = 0; i < 256; i++) {
  const u = i / 255
  srgbToLinearLUT[i] = u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4)
}

// Precomputed CIELAB transfer function table (8192 steps)
const LAB_TRANSFER_STEPS = 8192
const labTransferLUT = new Float64Array(LAB_TRANSFER_STEPS)

function labTransferExact(t: number): number {
  if (t > 0.008856) {
    return Math.cbrt(t)
  }
  return 7.787 * t + 16.0 / 116.0
}

for (let i = 0; i < LAB_TRANSFER_STEPS; i++) {
  labTransferLUT[i] = labTransferExact(i / (LAB_TRANSFER_STEPS - 1))
}

function labTransfer(t: number): number {
  let index = Math.floor(t * (LAB_TRANSFER_STEPS - 1))
  if (index < 0) {
    index = 0
  } else if (index >= LAB_TRANSFER_STEPS) {
    index = LAB_TRANSFER_STEPS - 1
  }
  return labTransferLUT[index]
}

function srgbToLab(r: number, g: number, b: number): LabColor {
  const linearR = srgbToLinearLUT[r]
  const linearG = srgbToLinearLUT[g]
  const linearB = srgbToLinearLUT[b]

  const x = (linearR * 0.4124564 + linearG * 0.3575761 + linearB * 0.1804375) / 0.95047
  const y = linearR * 0.2126729 + linearG * 0.7151522 + linearB * 0.0721750
  const z = (linearR * 0.0193339 + linearG * 0.1191920 + linearB * 0.9503041) / 1.08883

  const fx = labTransfer(x)
  const fy = labTransfer(y)
  const fz = labTransfer(z)

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  }
}

function getChroma(c: LabColor): number {
  return Math.sqrt(c.a * c.a + c.b * c.b)
}

function deltaE76(c1: LabColor, c2: LabColor): number {
  const dl = c1.l - c2.l
  const da = c1.a - c2.a
  const db = c1.b - c2.b
  return Math.sqrt(dl * dl + da * da + db * db)
}

function clampInt(value: number, low: number, high: number): number {
  if (value < low) return low
  if (value > high) return high
  return Math.floor(value)
}

function dominantColorKey(c: LabColor): number {
  const lBin = clampInt(c.l / 8, 0, 15)
  const aBin = clampInt((c.a + 128) / 12, 0, 31)
  const bBin = clampInt((c.b + 128) / 12, 0, 31)
  return (lBin << 10) | (aBin << 5) | bBin
}

function roundToByte(value: number): number {
  const rounded = Math.floor(value + 0.5)
  return clampInt(rounded, 0, 255)
}

function sampleDominantColors(
  data: Buffer,
  width: number,
  height: number,
  step: number,
  count: number,
  pass: DominantColorPass,
): string[] {
  const centerX = width / 2
  const centerY = height / 2
  const halfW = width / 2
  const halfH = height / 2
  let maxDistance = Math.sqrt(halfW * halfW + halfH * halfH)
  if (maxDistance <= 0) {
    maxDistance = 1
  }

  const buckets = new Map<number, DominantColorBucket>()

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const offset = (y * width + x) * 4
      const r = data[offset]
      const g = data[offset + 1]
      const b = data[offset + 2]
      const a = data[offset + 3]

      if (a < 125 && !pass.ignoreAlpha) {
        continue
      }

      const lab = srgbToLab(r, g, b)
      if (lab.l < pass.minL || lab.l > pass.maxL) {
        continue
      }

      const chroma = getChroma(lab)
      if (chroma < pass.minChroma) {
        continue
      }

      const dx = x - centerX
      const dy = y - centerY
      const distance = Math.sqrt(dx * dx + dy * dy) / maxDistance
      const weight = (1 + DOMINANT_COLOR_CENTER_BONUS * (1 - distance)) * (0.25 + chroma / 60)

      const key = dominantColorKey(lab)
      let bucket = buckets.get(key)
      if (!bucket) {
        bucket = { weight: 0, r: 0, g: 0, b: 0 }
        buckets.set(key, bucket)
      }

      bucket.weight += weight
      bucket.r += r * weight
      bucket.g += g * weight
      bucket.b += b * weight
    }
  }

  if (buckets.size === 0) {
    return []
  }

  const values = Array.from(buckets.values()).sort((a, b) => b.weight - a.weight)
  const result: string[] = []
  const seen: LabColor[] = []

  for (const bucket of values) {
    const r = roundToByte(bucket.r / bucket.weight)
    const g = roundToByte(bucket.g / bucket.weight)
    const b = roundToByte(bucket.b / bucket.weight)

    const lab = srgbToLab(r, g, b)
    let duplicate = false
    for (const other of seen) {
      if (deltaE76(lab, other) < DOMINANT_COLOR_MIN_DELTA_E) {
        duplicate = true
        break
      }
    }

    if (duplicate) {
      continue
    }

    seen.push(lab)
    const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
    result.push(hex)

    if (result.length >= count) {
      break
    }
  }

  return result
}

/**
 * Extract dominant colors from an image buffer using the CIELAB multi-pass perceptual algorithm.
 *
 * @param buffer - Raw image file buffer
 * @param count - Maximum number of colors to extract (default: 5)
 * @returns Array of hex color strings (e.g. ['#3d2b1f', '#d5a86a', ...])
 */
export async function extractDominantColors(
  buffer: Buffer,
  count: number = 5,
): Promise<string[]> {
  try {
    if (!buffer || buffer.length === 0 || count <= 0) {
      return []
    }

    const { data, info } = await sharp(buffer)
      .resize(200, 200, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const width = info.width
    const height = info.height
    if (width <= 0 || height <= 0) {
      return []
    }

    let step = 1
    while (width / step > 200 || height / step > 200) {
      step++
    }

    for (const pass of DOMINANT_COLOR_PASSES) {
      const colors = sampleDominantColors(data, width, height, step, count, pass)
      if (colors.length > 0) {
        return colors
      }
    }

    return []
  } catch (error) {
    console.error('Failed to extract dominant colors:', error)
    return []
  }
}
