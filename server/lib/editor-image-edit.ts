import 'server-only'

import { randomBytes } from 'node:crypto'

import { db } from '~/server/lib/db'
import { getMetadataAndThumbnail } from '@mo-gallery/image-pipeline/node'
import { resolvePhotoUrls } from '~/server/lib/photo-urls'
import { loadSafeRemoteImage } from '~/server/lib/safe-remote-image'
import { StorageProviderFactory, getStorageConfig } from '~/server/lib/storage'
import { generateStoryAiImage } from '~/server/lib/story-ai'
import type { StorageProvider } from '~/server/lib/storage'
import type { StoryAiGeneratedImage } from '~/server/lib/story-ai'

/**
 * 编辑器里的「单图二次编辑」。
 *
 * 与 `/admin/editor-ai/generate-image` 的区别只有一条：**不落会话**。那条路要
 * `conversationId`，因为它把每一次生成都记成对话里的一条消息（AI 对话页需要那份历史）。
 * 编辑器里改图是「对这张素材做一次操作」，用户不期望在 AI 对话列表里看见它，也不该为了
 * 改一张图先建一个隐藏会话 —— 那会污染对话列表、还要额外清理。
 *
 * 所以这里只做三件事：拿参考图 → 调模型 → 把结果存成一张新 Photo。产物与普通上传
 * 完全同构（同一个 `photos` 目录、同一条 Photo 行、同样的缩略图），所以插入正文后
 * 编辑器、导出、公众号复制全都无需特判。
 *
 * 刻意**不改写原图**：结果是新的一张 Photo。改图是不可逆的，而原图可能已经被别的
 * 文章、相册引用；就地覆盖会让那些引用一起变样。要替换就在正文里换掉这张卡。
 */

const MAX_REFERENCE_IMAGE_BYTES = 50 * 1024 * 1024
const MAX_OUTPUT_BYTES = 30 * 1024 * 1024
const THUMBNAIL_CONTENT_TYPE = 'image/webp'
const THUMBNAIL_EXTENSION = '.webp'

export interface EditorImageReference {
  /**
   * 站内 Photo 的 id（编辑器里媒体卡只知道这个）。
   *
   * 服务端拿它查出 `path`（真正的存储键）再读文件 —— 这两个不是一回事：
   * id 是 uuid，`path` 才是桶里的相对路径。让客户端去猜存储键是不现实的。
   */
  photoId?: string
  /** 已知的站内存储键（Photo.path）。photoId 查不到时用。 */
  storageKey?: string
  /** 公网地址（CDN / S3 / 外部图）。前两者都缺失时用它。 */
  url?: string
}

export interface EditedEditorImage {
  photoId: string
  url: string | null
  thumbnailUrl: string | null
  width: number
  height: number
}

function detectImageType(buffer: Buffer): string {
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png'
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  throw new Error('Reference image must be PNG, JPEG, or WebP')
}

function extensionForType(contentType: string): string {
  if (contentType === 'image/jpeg') return '.jpg'
  if (contentType === 'image/webp') return '.webp'
  if (contentType === 'image/gif') return '.gif'
  if (contentType === 'image/avif') return '.avif'
  return '.png'
}

/**
 * 参考图读成 buffer。
 *
 * 顺序有讲究：`storageKey` 先走 —— 站内图片的公网地址可能是签名 URL、私有桶、或者
 * 干脆是本机 `/uploads` 前缀（服务端读自己还得绕一圈 HTTP）。有 key 就直接从存储读。
 */
async function readReferenceImage(
  reference: EditorImageReference,
  getStorage: () => Promise<StorageProvider>,
): Promise<{ buffer: Buffer; contentType: string }> {
  // photoId → path 这一步必须在服务端做：媒体卡里存的是 id，桶里认的是相对路径。
  let storageKey = reference.storageKey?.trim()
  if (!storageKey && reference.photoId?.trim()) {
    const photo = await db.photo.findUnique({
      where: { id: reference.photoId.trim() },
      select: { path: true, storageSourceId: true },
    })
    // 查不到就往下走：调用方可能同时给了地址，那还有救。真的一点都没有才报错。
    // 非本存储源的图片（桌面插件 / 外接源）不能拿本服务的 storage 去 download ——
    // 那个 key 属于另一套存储，只能靠 `url` 让 loadSafeRemoteImage 去取。
    if (photo && !photo.storageSourceId) storageKey = photo.path?.trim() || undefined
  }

  if (storageKey) {
    try {
      const storage = await getStorage()
      const buffer = await storage.download(storageKey)
      if (buffer.length === 0) throw new Error('Reference image is empty')
      if (buffer.length > MAX_REFERENCE_IMAGE_BYTES) throw new Error('Reference image exceeds 50MB')
      return { buffer, contentType: detectImageType(buffer) }
    } catch (error) {
      // 这个 key 在当前存储里取不到（换了存储源、旧文件被清、key 不是本桶的）。
      // 还有地址就走地址 —— 比直接失败有意义得多。
      if (!reference.url?.trim()) throw error
    }
  }

  const url = reference.url?.trim()
  if (!url) throw new Error('A reference image is required')

  // 站内相对路径（`/uploads/photos/x.png`）不是远程地址，但正好等于「桶里的相对键」：
  // 去掉前缀就是 storageKey。没有它，那些还没配 CDN / API base 的宿主会在这里断掉。
  const relativeKey = /^\/uploads\/(.+)$/.exec(url)?.[1]
  if (relativeKey) {
    const storage = await getStorage()
    const buffer = await storage.download(relativeKey)
    if (buffer.length === 0) throw new Error('Reference image is empty')
    if (buffer.length > MAX_REFERENCE_IMAGE_BYTES) throw new Error('Reference image exceeds 50MB')
    return { buffer, contentType: detectImageType(buffer) }
  }

  if (!/^https?:\/\//i.test(url)) throw new Error('Unsupported reference image URL')

  const remote = await loadSafeRemoteImage(url, {
    maxBytes: MAX_REFERENCE_IMAGE_BYTES,
    signal: AbortSignal.timeout(30_000),
  })
  if (remote.buffer.length === 0) throw new Error('Reference image is empty')
  return { buffer: remote.buffer, contentType: detectImageType(remote.buffer) }
}

function assertGeneratedImage(generated: StoryAiGeneratedImage) {
  if (generated.buffer.length === 0 || generated.buffer.length > MAX_OUTPUT_BYTES) {
    throw new Error('Generated image is empty or exceeds 30MB')
  }
}

/**
 * 跑一次改图 / 生图，并把结果登记成一张 Photo。
 *
 * `prompt` 为空时不带参考图（纯文生图）；带参考图且有 prompt 时走 `/images/edits`。
 * 这两条分支都在 `generateStoryAiImage` 里，这里不重复判断。
 */
export async function editEditorImage(input: {
  prompt: string
  reference?: EditorImageReference
  model?: string
  size?: string
  title?: string
}): Promise<EditedEditorImage> {
  const config = await getStorageConfig()
  const storage = StorageProviderFactory.create(config)
  storage.validateConfig()

  const getStorage = async () => storage
  const reference = input.reference
    ? await readReferenceImage(input.reference, getStorage)
    : undefined

  const generated = await generateStoryAiImage({
    prompt: input.prompt,
    ...(input.model ? { model: input.model } : {}),
    ...(input.size ? { size: input.size } : {}),
    ...(reference
      ? {
          images: [{
            buffer: reference.buffer,
            contentType: reference.contentType,
            filename: `reference${extensionForType(reference.contentType)}`,
          }],
        }
      : {}),
  })
  assertGeneratedImage(generated)

  const { metadata, thumbnailBuffer } = await getMetadataAndThumbnail(generated.buffer, {
    generateThumbnail: true,
    thumbnailFormat: 'webp',
  })

  const randomName = randomBytes(16).toString('hex')
  const contentType = generated.contentType
  const upload = await storage.upload(
    {
      buffer: generated.buffer,
      filename: `${randomName}${extensionForType(contentType)}`,
      path: 'photos',
      contentType,
    },
    thumbnailBuffer
      ? {
          buffer: thumbnailBuffer,
          filename: `thumb-${randomName}${THUMBNAIL_EXTENSION}`,
          path: 'photos',
          contentType: THUMBNAIL_CONTENT_TYPE,
        }
      : undefined,
  )

  try {
    const photo = await db.photo.create({
      data: {
        // 标题只做「资源库里认得出这是什么」的线索：一段提示词截断，不是正文文案。
        title: (input.title?.trim() || input.prompt.trim()).slice(0, 80) || 'AI 改图',
        path: upload.key,
        thumbPath: upload.thumbnailKey ?? null,
        originFlag: 'web',
        storageProvider: config.provider,
        width: metadata.width ?? 0,
        height: metadata.height ?? 0,
        size: generated.buffer.length,
        showFlag: true,
      },
      select: { id: true, path: true, thumbPath: true, storageSourceId: true, storageProvider: true, storageUrlType: true },
    })

    const urls = await resolvePhotoUrls(photo)
    return {
      photoId: photo.id,
      url: urls.url,
      thumbnailUrl: urls.thumbnailUrl,
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
    }
  } catch (error) {
    // 落库失败就把刚传上去的两个文件删掉，别在存储里留孤儿。
    const keys = [upload.key, upload.thumbnailKey].filter((key): key is string => Boolean(key))
    await Promise.all(keys.map((key) => storage.delete(key).catch(() => {})))
    throw error
  }
}
