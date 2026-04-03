/**
 * S3-Compatible Storage Provider
 *
 * Supports AWS S3, Cloudflare R2, and any S3-compatible object storage.
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import {
  StorageProvider,
  StorageConfig,
  UploadFileInput,
  UploadResult,
  MoveResult,
  StorageError,
  ListOptions,
  ListResult,
  StorageFile,
} from './types'

export class S3StorageProvider implements StorageProvider {
  private client: S3Client
  private bucket: string
  private publicUrl: string
  private basePath: string

  constructor(private config: StorageConfig) {
    this.validateConfig()

    this.client = new S3Client({
      region: config.s3Region || 'auto',
      endpoint: config.s3Endpoint!,
      credentials: {
        accessKeyId: config.s3AccessKeyId!,
        secretAccessKey: config.s3SecretAccessKey!,
      },
    })

    this.bucket = config.s3Bucket!
    this.publicUrl = config.s3PublicUrl || ''
    this.basePath = config.s3Path || ''
  }

  validateConfig(): void {
    if (!this.config.s3AccessKeyId) {
      throw new StorageError('S3 Access Key ID is required', 'S3_ACCESS_KEY_MISSING')
    }
    if (!this.config.s3SecretAccessKey) {
      throw new StorageError('S3 Secret Access Key is required', 'S3_SECRET_KEY_MISSING')
    }
    if (!this.config.s3Bucket) {
      throw new StorageError('S3 Bucket name is required', 'S3_BUCKET_MISSING')
    }
    if (!this.config.s3Endpoint) {
      throw new StorageError('S3 Endpoint is required', 'S3_ENDPOINT_MISSING')
    }
    if (!this.config.s3PublicUrl) {
      throw new StorageError('S3 Public URL is required for serving files', 'S3_PUBLIC_URL_MISSING')
    }
  }

  async upload(file: UploadFileInput, thumbnail?: UploadFileInput): Promise<UploadResult> {
    try {
      const fileKey = this.buildKey(file.filename, file.path, file.useFullPath)
      const uploadPromises: Promise<void>[] = [
        this.uploadToS3(fileKey, file.buffer, file.contentType),
      ]

      let thumbKey: string | undefined
      if (thumbnail) {
        thumbKey = this.buildKey(thumbnail.filename, thumbnail.path, file.useFullPath)
        uploadPromises.push(this.uploadToS3(thumbKey, thumbnail.buffer, thumbnail.contentType))
      }

      await Promise.all(uploadPromises)

      const result: UploadResult = { url: this.getUrl(fileKey), key: fileKey }
      if (thumbnail && thumbKey) {
        result.thumbnailUrl = this.getUrl(thumbKey)
        result.thumbnailKey = thumbKey
      }
      return result
    } catch (error: unknown) {
      console.error('S3 upload error:', error)
      const msg = error instanceof Error ? error.message : String(error)
      throw new StorageError(`Failed to upload to S3: ${msg}`, 'S3_UPLOAD_FAILED', error)
    }
  }

  async delete(key: string, thumbnailKey?: string): Promise<void> {
    try {
      await this.deleteFromS3(key)
      if (thumbnailKey) await this.deleteFromS3(thumbnailKey)
    } catch (error) {
      console.error(`Failed to delete from S3: ${key}`, error)
    }
  }

  async download(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key })
    const response = await this.client.send(command)
    const stream = response.Body as NodeJS.ReadableStream
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }

  getUrl(key: string): string {
    return `${this.publicUrl.replace(/\/+$/, '')}/${key}`
  }

  async move(oldKey: string, newPath: string, thumbnailKey?: string): Promise<MoveResult> {
    const filename = oldKey.split('/').pop()!
    const newKey = newPath
      ? `${newPath}/${filename}`.replace(/\/+/g, '/').replace(/^\/+/, '')
      : filename

    await this.client.send(new CopyObjectCommand({
      Bucket: this.bucket,
      CopySource: `${this.bucket}/${oldKey}`,
      Key: newKey,
    }))
    await this.deleteFromS3(oldKey)

    const result: MoveResult = { newKey, newUrl: this.getUrl(newKey) }

    if (thumbnailKey) {
      const thumbFilename = thumbnailKey.split('/').pop()!
      const newThumbKey = newPath
        ? `${newPath}/${thumbFilename}`.replace(/\/+/g, '/').replace(/^\/+/, '')
        : thumbFilename
      await this.client.send(new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${thumbnailKey}`,
        Key: newThumbKey,
      }))
      await this.deleteFromS3(thumbnailKey)
      result.newThumbnailKey = newThumbKey
      result.newThumbnailUrl = this.getUrl(newThumbKey)
    }

    return result
  }

  async list(options?: ListOptions): Promise<ListResult> {
    const allFiles: StorageFile[] = []
    let continuationToken = options?.cursor
    const prefix = options?.fullScan
      ? undefined
      : (options?.prefix || this.basePath || undefined)

    do {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      })
      const response = await this.client.send(command)
      const files = (response.Contents || []).map(obj => ({
        key: obj.Key!,
        size: obj.Size || 0,
        lastModified: obj.LastModified || new Date(),
        url: this.getUrl(obj.Key!),
      }))
      allFiles.push(...files)
      continuationToken = response.NextContinuationToken
      if (!response.IsTruncated || (options?.limit && allFiles.length >= options.limit)) break
    } while (continuationToken)

    const limitedFiles = options?.limit ? allFiles.slice(0, options.limit) : allFiles
    return {
      files: limitedFiles,
      cursor: undefined,
      hasMore: options?.limit ? allFiles.length > options.limit : false,
    }
  }

  private buildKey(filename: string, subfolder?: string, useFullPath?: boolean): string {
    const parts: string[] = []
    if (!useFullPath && this.basePath) parts.push(this.basePath)
    if (subfolder) parts.push(subfolder)
    parts.push(filename)
    return parts.join('/').replace(/\/+/g, '/').replace(/^\/+/, '')
  }

  private async uploadToS3(key: string, buffer: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }))
  }

  private async deleteFromS3(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }
}
