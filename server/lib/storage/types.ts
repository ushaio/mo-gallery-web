/**
 * Storage Provider Types and Interfaces
 *
 * Provides a unified interface for different storage backends
 * (local filesystem, GitHub, Cloudflare R2, etc.)
 */

export interface UploadFileInput {
  buffer: Buffer
  filename: string
  path?: string
  contentType: string
  /** When true, path is treated as the full path, skipping basePath prefix */
  useFullPath?: boolean
}

export interface UploadResult {
  url: string
  key: string
  thumbnailUrl?: string
  thumbnailKey?: string
}

export interface StorageConfig {
  provider: 'local' | 'github' | 'r2'

  // Local filesystem config
  localBasePath?: string
  localBaseUrl?: string

  // GitHub config
  githubToken?: string
  githubRepo?: string
  githubPath?: string
  githubBranch?: string
  githubAccessMethod?: 'raw' | 'jsdelivr' | 'pages'
  githubPagesUrl?: string

  // R2 config
  r2AccessKeyId?: string
  r2SecretAccessKey?: string
  r2Bucket?: string
  r2Endpoint?: string
  r2PublicUrl?: string
  r2Path?: string
}

export interface MoveResult {
  newKey: string
  newUrl: string
  newThumbnailKey?: string
  newThumbnailUrl?: string
}

export interface StorageFile {
  key: string
  size: number
  lastModified: Date
  url: string
}

export interface ListOptions {
  prefix?: string
  cursor?: string
  limit?: number
  fullScan?: boolean  // Scan entire bucket, ignore basePath
}

export interface ListResult {
  files: StorageFile[]
  cursor?: string
  hasMore: boolean
}

export interface StorageProvider {
  /**
   * Upload a file and optionally its thumbnail
   */
  upload(
    file: UploadFileInput,
    thumbnail?: UploadFileInput
  ): Promise<UploadResult>

  /**
   * Delete a file from storage
   */
  delete(key: string, thumbnailKey?: string): Promise<void>

  /**
   * Download a file from storage
   */
  download(key: string): Promise<Buffer>

  /**
   * Get the public URL for a file
   */
  getUrl(key: string): string

  /**
   * Validate provider configuration
   */
  validateConfig(): void

  /**
   * Move a file to a new path (same filename, different directory)
   */
  move(oldKey: string, newPath: string, thumbnailKey?: string): Promise<MoveResult>

  /**
   * List files in storage
   */
  list(options?: ListOptions): Promise<ListResult>
}

export class StorageError extends Error {
  constructor(
    message: string,
    public code: string,
    public originalError?: unknown
  ) {
    super(message)
    this.name = 'StorageError'
  }
}
