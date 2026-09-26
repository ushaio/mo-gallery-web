/** 上传管线共用的纯类型与常量定义（不依赖 Node 运行时，客户端可安全引用）。 */

export interface ExifData {
  cameraMake?: string
  cameraModel?: string
  lens?: string
  focalLength?: string
  aperture?: string
  shutterSpeed?: string
  iso?: number
  takenAt?: Date
  orientation?: number
  software?: string
  exifRaw?: string
  gps?: string
}

export type CompressionOutputFormat = 'avif' | 'webp'

/** 缩略图常量（所有缩略图生成路径共用） */
export const THUMBNAIL_SIZE = 800
export const THUMBNAIL_AVIF_QUALITY = 72

/** 服务端 AVIF 压缩常量 */
export const SERVER_AVIF_DEFAULT_QUALITY = 82
export const SERVER_AVIF_MIN_QUALITY = 40
export const SERVER_AVIF_QUALITY_STEP = 8
export const SERVER_AVIF_MAX_ROUNDS = 4
export const SERVER_AVIF_MIN_LONG_EDGE = 1280

/** Serverless 安全护栏 */
export const SERVER_MAX_IMAGE_DIMENSION = 8000 // 超过该尺寸的图片先降采样
export const SERVER_SHARP_TIMEOUT_MS = 25000 // 给 sharp 留 25s，其余留给表单解析/DB 写入/存储上传
