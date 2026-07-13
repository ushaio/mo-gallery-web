import 'server-only'

import { randomBytes } from 'node:crypto'

import { db } from '~/server/lib/db'
import { EditorAiNotFoundError } from '~/server/lib/editor-ai-repository'
import { getMetadataAndThumbnail } from '~/server/lib/image-processing'
import { loadSafeRemoteImage } from '~/server/lib/safe-remote-image'
import { StorageProviderFactory, getStorageConfig } from '~/server/lib/storage'
import type { StorageProvider, UploadFileInput, UploadResult } from '~/server/lib/storage'

type JsonRecord = Record<string, unknown>

type OwnedMessage = {
  id: string
  content: string
  metadata: unknown
}

type ImageMetadata = {
  width?: number
  height?: number
  format?: string
}

type PhotoCreateInput = {
  title: string
  url: string
  thumbnailUrl: string | null
  originFlag: 'web'
  storageProvider: string
  storageKey: string
  width: number
  height: number
  size: number
  showFlag: true
}

type SavedPhoto = { id: string; url: string; thumbnailUrl: string | null }

export type EditorAiImageStorage = Pick<StorageProvider, 'validateConfig' | 'download'> & {
  upload(file: UploadFileInput, thumbnail: UploadFileInput): Promise<UploadResult>
  delete(key: string): Promise<void>
}

export type EditorAiImageTransaction = {
  createPhoto(data: PhotoCreateInput): Promise<SavedPhoto>
  updateMessageMetadata(messageId: string, metadata: JsonRecord): Promise<void>
}

export type EditorAiImageSaverDependencies = {
  findOwnedMessage(userId: string, messageId: string): Promise<OwnedMessage | null>
  getStorage(): Promise<{ provider: string; storage: EditorAiImageStorage }>
  loadRemoteImage: typeof loadSafeRemoteImage
  inspectImage(buffer: Buffer): Promise<{ metadata: ImageMetadata; thumbnailBuffer: Buffer | null }>
  randomName(): string
  transaction<T>(work: (transaction: EditorAiImageTransaction) => Promise<T>): Promise<T>
}

type MessageImageTarget = {
  photoId?: string
  storageKey?: string
  title: string
  updateMetadata: (photoId: string) => JsonRecord
}

const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const THUMBNAIL_CONTENT_TYPE = 'image/avif'
const SUPPORTED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
])

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`
}

function findMessageImage(metadata: unknown, imageUrl: string, fallbackTitle: string): MessageImageTarget | null {
  if (!isRecord(metadata)) return null

  if (metadata.type === 'image' && metadata.uploadedUrl === imageUrl) {
    return {
      photoId: typeof metadata.photoId === 'string' ? metadata.photoId : undefined,
      storageKey: typeof metadata.storageKey === 'string' ? metadata.storageKey : undefined,
      title: typeof metadata.prompt === 'string' && metadata.prompt.trim()
        ? `AI 生图 - ${metadata.prompt.trim()}`
        : fallbackTitle,
      updateMetadata: (photoId) => ({ ...metadata, photoId }),
    }
  }

  if (!Array.isArray(metadata.images)) return null
  const images = metadata.images
  const imageIndex = images.findIndex((image) => {
    if (typeof image === 'string') return image === imageUrl
    return isRecord(image) && image.url === imageUrl
  })
  if (imageIndex < 0) return null

  const image = images[imageIndex]
  const imageRecord = isRecord(image) ? image : null
  return {
    photoId: typeof imageRecord?.photoId === 'string' ? imageRecord.photoId : undefined,
    storageKey: typeof imageRecord?.key === 'string'
      ? imageRecord.key
      : typeof imageRecord?.storageKey === 'string' ? imageRecord.storageKey : undefined,
    title: fallbackTitle,
    updateMetadata: (photoId) => ({
      ...metadata,
      images: images.map((item, index) => index === imageIndex
        ? { ...(isRecord(item) ? item : {}), url: imageUrl, photoId }
        : item),
    }),
  }
}

function decodeDataUrl(imageUrl: string): { buffer: Buffer; contentType: string } | null {
  const match = /^data:(image\/(?:jpeg|png|webp|gif|avif));base64,([\s\S]+)$/i.exec(imageUrl)
  if (!match) return null

  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('图片为空或超过 20MB 限制')
  }
  return { buffer, contentType: match[1].toLowerCase() }
}

function formatToContentType(format: string | undefined): string {
  switch (format) {
    case 'jpeg': return 'image/jpeg'
    case 'webp': return 'image/webp'
    case 'gif': return 'image/gif'
    case 'avif': return 'image/avif'
    default: return 'image/png'
  }
}

function contentTypeExtension(contentType: string): string {
  switch (contentType) {
    case 'image/jpeg': return '.jpg'
    case 'image/webp': return '.webp'
    case 'image/gif': return '.gif'
    case 'image/avif': return '.avif'
    default: return '.png'
  }
}

function normalizeContentType(contentType: string | undefined, detectedFormat: string | undefined): string {
  const normalized = contentType?.toLowerCase()
  return normalized && SUPPORTED_CONTENT_TYPES.has(normalized)
    ? normalized
    : formatToContentType(detectedFormat)
}

async function readImageBuffer(
  imageUrl: string,
  storageKey: string | undefined,
  getStorage: () => Promise<EditorAiImageStorage>,
  loadRemoteImage: EditorAiImageSaverDependencies['loadRemoteImage'],
): Promise<{ buffer: Buffer; contentType?: string }> {
  const dataUrl = decodeDataUrl(imageUrl)
  if (dataUrl) return dataUrl

  if (storageKey) {
    const storage = await getStorage()
    const buffer = await storage.download(storageKey)
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) throw new Error('图片为空或超过 20MB 限制')
    return { buffer }
  }

  if (imageUrl.startsWith('/uploads/')) {
    const storage = await getStorage()
    const buffer = await storage.download(imageUrl.slice('/uploads/'.length))
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) throw new Error('图片为空或超过 20MB 限制')
    return { buffer }
  }

  if (!/^https?:\/\//i.test(imageUrl)) {
    throw new Error('不支持的图片地址')
  }

  const { buffer, contentType } = await loadRemoteImage(imageUrl, {
    maxBytes: MAX_IMAGE_BYTES,
    signal: AbortSignal.timeout(15_000),
  })
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) throw new Error('图片为空或超过 20MB 限制')
  return { buffer, contentType }
}

export async function saveEditorAiMessageImageCore(
  dependencies: EditorAiImageSaverDependencies,
  userId: string,
  messageId: string,
  imageUrl: string,
) {
  const message = await dependencies.findOwnedMessage(userId, messageId)
  if (!message) throw new EditorAiNotFoundError('message')

  const target = findMessageImage(message.metadata, imageUrl, message.content.trim() || 'AI 对话图片')
  if (!target) throw new Error('图片不属于该消息')
  if (target.photoId) return { photoId: target.photoId, alreadySaved: true }

  let storageResult: Awaited<ReturnType<EditorAiImageSaverDependencies['getStorage']>> | undefined
  const getValidatedStorage = async () => {
    if (!storageResult) {
      storageResult = await dependencies.getStorage()
      storageResult.storage.validateConfig()
    }
    return storageResult.storage
  }
  const source = await readImageBuffer(imageUrl, target.storageKey, getValidatedStorage, dependencies.loadRemoteImage)
  const storage = await getValidatedStorage()
  const provider = storageResult?.provider
  if (!provider) throw new Error('Storage provider is unavailable')
  const { metadata, thumbnailBuffer } = await dependencies.inspectImage(source.buffer)
  if (!thumbnailBuffer) throw new Error('图片缩略图生成失败')

  const contentType = normalizeContentType(source.contentType, metadata.format)
  const randomName = dependencies.randomName()
  const filename = `${randomName}${contentTypeExtension(contentType)}`
  const uploadResult = await storage.upload(
    { buffer: source.buffer, filename, path: 'photos', contentType },
    { buffer: thumbnailBuffer, filename: `thumb-${randomName}.avif`, path: 'photos', contentType: THUMBNAIL_CONTENT_TYPE },
  )

  try {
    const photo = await dependencies.transaction(async (transaction) => {
      const createdPhoto = await transaction.createPhoto({
          title: truncate(target.title, 80),
          url: uploadResult.url,
          thumbnailUrl: uploadResult.thumbnailUrl || null,
          originFlag: 'web',
          storageProvider: provider,
          storageKey: uploadResult.key,
          width: metadata.width || 0,
          height: metadata.height || 0,
          size: source.buffer.length,
          showFlag: true,
      })

      await transaction.updateMessageMetadata(message.id, target.updateMetadata(createdPhoto.id))
      return createdPhoto
    })

    return { photoId: photo.id, url: photo.url, thumbnailUrl: photo.thumbnailUrl, alreadySaved: false }
  } catch (error) {
    const cleanupKeys = [uploadResult.key, uploadResult.thumbnailKey].filter((key): key is string => Boolean(key))
    await Promise.all(cleanupKeys.map((key) => storage.delete(key).catch(() => {})))
    throw error
  }
}

const productionDependencies: EditorAiImageSaverDependencies = {
  findOwnedMessage: (userId, messageId) => db.aiMessage.findFirst({
    where: { id: messageId, conversation: { userId } },
    select: { id: true, content: true, metadata: true },
  }),
  getStorage: async () => {
    const config = await getStorageConfig()
    return { provider: config.provider, storage: StorageProviderFactory.create(config) }
  },
  loadRemoteImage: loadSafeRemoteImage,
  inspectImage: (buffer) => getMetadataAndThumbnail(buffer, { generateThumbnail: true }),
  randomName: () => randomBytes(16).toString('hex'),
  transaction: (work) => db.$transaction(async (transaction) => work({
    createPhoto: (data) => transaction.photo.create({
      data,
      select: { id: true, url: true, thumbnailUrl: true },
    }),
    updateMessageMetadata: async (messageId, metadata) => {
      await transaction.aiMessage.update({ where: { id: messageId }, data: { metadata: metadata as never } })
    },
  })),
}

export async function saveEditorAiMessageImage(userId: string, messageId: string, imageUrl: string) {
  return saveEditorAiMessageImageCore(productionDependencies, userId, messageId, imageUrl)
}
