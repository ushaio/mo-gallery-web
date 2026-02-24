/**
 * Cloudflare R2 Storage Provider
 *
 * Stores images in Cloudflare R2 (S3-compatible object storage)
 * Serves them via R2 public bucket URL or custom domain
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

export class R2StorageProvider implements StorageProvider {
  private client: S3Client
  private bucket: string
  private publicUrl: string
  private basePath: string

  constructor(private config: StorageConfig) {
    this.validateConfig()

    this.client = new S3Client({
      region: 'auto',
      endpoint: config.r2Endpoint!,
      credentials: {
        accessKeyId: config.r2AccessKeyId!,
        secretAccessKey: config.r2SecretAccessKey!,
      },
    })

    this.bucket = config.r2Bucket!
    this.publicUrl = config.r2PublicUrl || ''
    this.basePath = config.r2Path || ''
  }

  validateConfig(): void {
    if (!this.config.r2AccessKeyId) {
      throw new StorageError(
        'R2 Access Key ID is required',
        'R2_ACCESS_KEY_MISSING'
      )
    }

    if (!this.config.r2SecretAccessKey) {
      throw new StorageError(
        'R2 Secret Access Key is required',
        'R2_SECRET_KEY_MISSING'
      )
    }

    if (!this.config.r2Bucket) {
      throw new StorageError('R2 Bucket name is required', 'R2_BUCKET_MISSING')
    }

    if (!this.config.r2Endpoint) {
      throw new StorageError('R2 Endpoint is required', 'R2_ENDPOINT_MISSING')
    }

    if (!this.config.r2PublicUrl) {
      throw new StorageError(
        'R2 Public URL is required for serving files',
        'R2_PUBLIC_URL_MISSING'
      )
    }
  }

  async upload(
    file: UploadFileInput,
    thumbnail?: UploadFileInput
  ): Promise<UploadResult> {
    try {
      // Build file key
      const fileKey = this.buildKey(file.filename, file.path, file.useFullPath)

      // Upload original and thumbnail in parallel
      const uploadPromises: Promise<void>[] = [
        this.uploadToR2(fileKey, file.buffer, file.contentType),
      ]

      let thumbKey: string | undefined
      if (thumbnail) {
        thumbKey = this.buildKey(thumbnail.filename, thumbnail.path, file.useFullPath)
        uploadPromises.push(
          this.uploadToR2(thumbKey, thumbnail.buffer, thumbnail.contentType)
        )
      }

      // Wait for all uploads to complete
      await Promise.all(uploadPromises)

      const result: UploadResult = {
        url: this.getUrl(fileKey),
        key: fileKey,
      }

      if (thumbnail && thumbKey) {
        result.thumbnailUrl = this.getUrl(thumbKey)
        result.thumbnailKey = thumbKey
      }

      return result
    } catch (error: any) {
      console.error('R2 upload error:', error)
      throw new StorageError(
        `Failed to upload to R2: ${error.message}`,
        'R2_UPLOAD_FAILED',
        error
      )
    }
  }

  async delete(key: string, thumbnailKey?: string): Promise<void> {
    try {
      // Delete original file
      await this.deleteFromR2(key)

      // Delete thumbnail if provided
      if (thumbnailKey) {
        await this.deleteFromR2(thumbnailKey)
      }
    } catch (error) {
      console.error(`Failed to delete from R2: ${key}`, error)
      // Don't throw - deletion is best-effort
    }
  }

  async download(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    })
    const response = await this.client.send(command)
    const stream = response.Body as NodeJS.ReadableStream
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }

  getUrl(key: string): string {
    const baseUrl = this.publicUrl.replace(/\/+$/, '')
    return `${baseUrl}/${key}`
  }

  async move(oldKey: string, newPath: string, thumbnailKey?: string): Promise<MoveResult> {
    const filename = oldKey.split('/').pop()!
    // Build new key directly without basePath prefix (absolute path from bucket root)
    const newKey = newPath ? `${newPath}/${filename}`.replace(/\/+/g, '/').replace(/^\/+/, '') : filename

    // Copy to new location then delete old
    await this.client.send(new CopyObjectCommand({
      Bucket: this.bucket,
      CopySource: `${this.bucket}/${oldKey}`,
      Key: newKey,
    }))
    await this.deleteFromR2(oldKey)

    const result: MoveResult = {
      newKey,
      newUrl: this.getUrl(newKey),
    }

    if (thumbnailKey) {
      const thumbFilename = thumbnailKey.split('/').pop()!
      // Build thumbnail key directly without basePath prefix
      const newThumbKey = newPath ? `${newPath}/${thumbFilename}`.replace(/\/+/g, '/').replace(/^\/+/, '') : thumbFilename
      await this.client.send(new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${thumbnailKey}`,
        Key: newThumbKey,
      }))
      await this.deleteFromR2(thumbnailKey)
      result.newThumbnailKey = newThumbKey
      result.newThumbnailUrl = this.getUrl(newThumbKey)
    }

    return result
  }

  async list(options?: ListOptions): Promise<ListResult> {
    const allFiles: StorageFile[] = []
    let continuationToken = options?.cursor
    const prefix = options?.fullScan ? undefined : (options?.prefix || this.basePath || undefined)

    // Paginate through all results
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

      // Stop if we have enough files or no more pages
      if (!response.IsTruncated || (options?.limit && allFiles.length >= options.limit)) {
        break
      }
    } while (continuationToken)

    // Apply limit if specified
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
    // Remove leading slashes and duplicate slashes
    return parts.join('/').replace(/\/+/g, '/').replace(/^\/+/, '')
  }

  private async uploadToR2(
    key: string,
    buffer: Buffer,
    contentType: string
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })

    await this.client.send(command)
  }

  private async deleteFromR2(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    })

    await this.client.send(command)
  }
}
