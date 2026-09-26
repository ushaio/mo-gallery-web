/**
 * @mo-gallery/image-pipeline — Web 与 Official 共用的服务端图片处理管线。
 *
 * 两个入口，边界必须保持：
 * - `.`（本文件）：纯 TS —— 类型、EXIF JSON/日期解析与展示格式化、管线常量。
 *   客户端代码可以安全引用，不会把 sharp/exifreader 拖进 bundle。
 * - `./node`：Node 运行时实现（sharp + exifreader），只能在服务端导入。
 *   包含 EXIF 提取、CIELAB 主色提取、缩略图生成与目标体积压缩。
 *
 * 上传时的处理顺序约定（与 mo-gallery-web 自部署上传一致）：
 * enforceDimensionLimit → extractExifData（EXIF 不耐重编码，必须在重编码前提取）
 * → getMetadataAndThumbnail / compressToTargetSize → extractDominantColors。
 */
export {
  formatExifForDisplay,
  parseExifDate,
  parseExifJson,
  sanitizeJsonString,
} from './exif-json'
export {
  SERVER_AVIF_DEFAULT_QUALITY,
  SERVER_AVIF_MAX_ROUNDS,
  SERVER_AVIF_MIN_LONG_EDGE,
  SERVER_AVIF_MIN_QUALITY,
  SERVER_AVIF_QUALITY_STEP,
  SERVER_MAX_IMAGE_DIMENSION,
  SERVER_SHARP_TIMEOUT_MS,
  THUMBNAIL_AVIF_QUALITY,
  THUMBNAIL_SIZE,
} from './types'
export type { CompressionOutputFormat, ExifData } from './types'
