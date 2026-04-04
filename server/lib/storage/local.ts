/**
 * Local Storage Provider
 *
 * Stores images on the local filesystem
 */

import { writeFile, unlink, mkdir, readFile, rename, readdir, stat } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
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

export class LocalStorageProvider implements StorageProvider {
  private basePath: string
  private baseUrl: string

  constructor(private config: StorageConfig) {
    this.basePath =
      config.localBasePath || path.join(process.cwd(), 'public', 'uploads')
    this.baseUrl = config.localBaseUrl || '/uploads'
    this.ensureDirectory()
  }

  validateConfig(): void {
    // Local storage requires no special config
  }

  private async ensureDirectory(): Promise<void> {
    if (!existsSync(this.basePath)) {
      await mkdir(this.basePath, { recursive: true })
    }
  }

  async upload(
    file: UploadFileInput,
    thumbnail?: UploadFileInput
  ): Promise<UploadResult> {
    try {
      await this.ensureDirectory()

      // Ensure subfolder exists if specified
      if (file.path) {
        const subfolderPath = path.join(this.basePath, file.path)
        if (!existsSync(subfolderPath)) {
          await mkdir(subfolderPath, { recursive: true })
        }
      }

      // Upload original
      const filePath = this.buildFilePath(file.filename, file.path)
      await writeFile(filePath, file.buffer)

      const result: UploadResult = {
        url: this.getUrl(file.filename, file.path),
        key: file.filename,
      }

      // Upload thumbnail
      if (thumbnail) {
        const thumbPath = this.buildFilePath(
          thumbnail.filename,
          thumbnail.path
        )
        await writeFile(thumbPath, thumbnail.buffer)
        result.thumbnailUrl = this.getUrl(thumbnail.filename, thumbnail.path)
        result.thumbnailKey = thumbnail.filename
      }

      return result
    } catch (error) {
      console.error('Local storage error:', error)
      throw new StorageError(
        'Failed to save to local storage',
        'LOCAL_WRITE_FAILED',
        error
      )
    }
  }

  async delete(key: string, thumbnailKey?: string): Promise<void> {
    try {
      const filePath = path.join(this.basePath, key)
      if (existsSync(filePath)) {
        await unlink(filePath)
      }

      if (thumbnailKey) {
        const thumbPath = path.join(this.basePath, thumbnailKey)
        if (existsSync(thumbPath)) {
          await unlink(thumbPath)
        }
      }
    } catch (error) {
      console.error('Failed to delete local file:', error)
      throw new StorageError(
        'Failed to delete from local storage',
        'LOCAL_DELETE_FAILED',
        error
      )
    }
  }

  async download(key: string): Promise<Buffer> {
    const filePath = path.join(this.basePath, key)
    return readFile(filePath)
  }

  async move(oldKey: string, newPath: string, thumbnailKey?: string): Promise<MoveResult> {
    const filename = path.basename(oldKey)
    const newKey = newPath ? `${newPath}/${filename}` : filename

    // Ensure new directory exists
    const newDir = path.join(this.basePath, newPath)
    if (!existsSync(newDir)) {
      await mkdir(newDir, { recursive: true })
    }

    // Move original file
    const oldFilePath = path.join(this.basePath, oldKey)
    const newFilePath = path.join(this.basePath, newKey)
    await rename(oldFilePath, newFilePath)

    const result: MoveResult = {
      newKey,
      newUrl: this.getUrl(filename, newPath),
    }

    // Move thumbnail if exists
    if (thumbnailKey) {
      const thumbFilename = path.basename(thumbnailKey)
      const newThumbKey = newPath ? `${newPath}/${thumbFilename}` : thumbFilename
      const oldThumbPath = path.join(this.basePath, thumbnailKey)
      const newThumbPath = path.join(this.basePath, newThumbKey)
      
      if (existsSync(oldThumbPath)) {
        await rename(oldThumbPath, newThumbPath)
        result.newThumbnailKey = newThumbKey
        result.newThumbnailUrl = this.getUrl(thumbFilename, newPath)
      }
    }

    return result
  }

  async list(options?: ListOptions): Promise<ListResult> {
    const files: StorageFile[] = []
    const searchPath = options?.prefix
      ? path.join(this.basePath, options.prefix)
      : this.basePath

    await this.listRecursive(searchPath, '', files)

    const start = options?.cursor ? parseInt(options.cursor) : 0
    const limit = options?.limit || 1000
    const slice = files.slice(start, start + limit)

    return {
      files: slice,
      cursor: start + limit < files.length ? String(start + limit) : undefined,
      hasMore: start + limit < files.length,
    }
  }

  private async listRecursive(basePath: string, relativePath: string, files: StorageFile[]): Promise<void> {
    const fullPath = path.join(basePath, relativePath)
    if (!existsSync(fullPath)) return

    const entries = await readdir(fullPath, { withFileTypes: true })

    for (const entry of entries) {
      const entryRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        await this.listRecursive(basePath, entryRelPath, files)
      } else {
        const fileStat = await stat(path.join(fullPath, entry.name))
        files.push({
          key: entryRelPath,
          size: fileStat.size,
          lastModified: fileStat.mtime,
          url: this.getUrl(entry.name, relativePath),
        })
      }
    }
  }

  getUrl(filename: string, subfolder?: string): string {
    const parts = [this.baseUrl]
    if (subfolder) parts.push(subfolder)
    parts.push(filename)
    return parts.join('/').replace(/\/+/g, '/')
  }

  private buildFilePath(filename: string, subfolder?: string): string {
    let targetPath = this.basePath
    if (subfolder) {
      targetPath = path.join(targetPath, subfolder)
    }
    return path.join(targetPath, filename)
  }
}
