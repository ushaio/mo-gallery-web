/**
 * GitHub Storage Provider
 *
 * Stores images in a GitHub repository and serves them via:
 * - raw.githubusercontent.com
 * - jsDelivr CDN
 * - GitHub Pages
 */

import { Octokit } from '@octokit/rest'
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

export class GithubStorageProvider implements StorageProvider {
  private octokit: Octokit
  private owner: string
  private repo: string
  private basePath: string
  private branch: string
  private accessMethod: 'raw' | 'jsdelivr' | 'pages'
  private pagesUrl?: string

  constructor(private config: StorageConfig) {
    this.validateConfig()

    this.octokit = new Octokit({ auth: config.githubToken })

    // Parse owner/repo from "owner/repo" format
    const [owner, repo] = config.githubRepo!.split('/')
    this.owner = owner
    this.repo = repo

    this.basePath = config.githubPath || 'uploads'
    this.branch = config.githubBranch || 'main'
    this.accessMethod = config.githubAccessMethod || 'jsdelivr'
    this.pagesUrl = config.githubPagesUrl
  }

  validateConfig(): void {
    if (!this.config.githubToken) {
      throw new StorageError(
        'GitHub token is required',
        'GITHUB_TOKEN_MISSING'
      )
    }

    if (!this.config.githubRepo || !this.config.githubRepo.includes('/')) {
      throw new StorageError(
        'GitHub repo must be in format "owner/repo"',
        'GITHUB_REPO_INVALID'
      )
    }

    if (
      this.config.githubAccessMethod === 'pages' &&
      !this.config.githubPagesUrl
    ) {
      throw new StorageError(
        'GitHub Pages URL is required when using pages access method',
        'GITHUB_PAGES_URL_MISSING'
      )
    }
  }

  async upload(
    file: UploadFileInput,
    thumbnail?: UploadFileInput
  ): Promise<UploadResult> {
    try {
      // Build file paths
      const filePath = this.buildPath(file.filename, file.path, file.useFullPath)

      // Upload original and thumbnail in parallel
      const uploadPromises: Promise<void>[] = [
        this.uploadToGithub(filePath, file.buffer, `Upload: ${file.filename}`),
      ]

      let thumbPath: string | undefined
      if (thumbnail) {
        thumbPath = this.buildPath(thumbnail.filename, thumbnail.path, file.useFullPath)
        uploadPromises.push(
          this.uploadToGithub(
            thumbPath,
            thumbnail.buffer,
            `Upload thumbnail: ${thumbnail.filename}`
          )
        )
      }

      // Wait for all uploads to complete
      await Promise.all(uploadPromises)

      const result: UploadResult = {
        url: this.getUrl(filePath),
        key: filePath,
      }

      if (thumbnail && thumbPath) {
        result.thumbnailUrl = this.getUrl(thumbPath)
        result.thumbnailKey = thumbPath
      }

      return result
    } catch (error: any) {
      console.error('GitHub upload error:', error)
      throw new StorageError(
        `Failed to upload to GitHub: ${error.message}`,
        'GITHUB_UPLOAD_FAILED',
        error
      )
    }
  }

  async delete(key: string, thumbnailKey?: string): Promise<void> {
    // Note: This method always attempts to delete from GitHub
    // The decision to call this method is made by the caller
    try {
      // Delete original file
      await this.deleteFromGithub(key)

      // Delete thumbnail if provided
      if (thumbnailKey) {
        await this.deleteFromGithub(thumbnailKey)
      }
    } catch (error) {
      console.error(`Failed to delete from GitHub: ${key}`, error)
      // Don't throw - deletion is best-effort
    }
  }

  async download(key: string): Promise<Buffer> {
    const { data } = await this.octokit.repos.getContent({
      owner: this.owner,
      repo: this.repo,
      path: key,
      ref: this.branch,
    })
    if (Array.isArray(data) || !('content' in data)) {
      throw new StorageError('Invalid file response', 'GITHUB_DOWNLOAD_FAILED')
    }
    return Buffer.from(data.content, 'base64')
  }

  async move(oldKey: string, newPath: string, thumbnailKey?: string): Promise<MoveResult> {
    const filename = oldKey.split('/').pop()!
    // Build new key directly without basePath prefix (absolute path from repo root)
    const newKey = newPath ? `${newPath}/${filename}`.replace(/\/+/g, '/').replace(/^\/+/, '') : filename

    // Download, upload to new path, delete old
    const buffer = await this.download(oldKey)
    await this.uploadToGithub(newKey, buffer, `Move: ${oldKey} -> ${newKey}`)
    await this.deleteFromGithub(oldKey)

    const result: MoveResult = {
      newKey,
      newUrl: this.getUrl(newKey),
    }

    if (thumbnailKey) {
      const thumbFilename = thumbnailKey.split('/').pop()!
      // Build thumbnail key directly without basePath prefix
      const newThumbKey = newPath ? `${newPath}/${thumbFilename}`.replace(/\/+/g, '/').replace(/^\/+/, '') : thumbFilename
      const thumbBuffer = await this.download(thumbnailKey)
      await this.uploadToGithub(newThumbKey, thumbBuffer, `Move thumbnail: ${thumbnailKey} -> ${newThumbKey}`)
      await this.deleteFromGithub(thumbnailKey)
      result.newThumbnailKey = newThumbKey
      result.newThumbnailUrl = this.getUrl(newThumbKey)
    }

    return result
  }

  async list(options?: ListOptions): Promise<ListResult> {
    const files: StorageFile[] = []
    const targetPath = options?.prefix || this.basePath

    await this.listRecursive(targetPath, files)

    const start = options?.cursor ? parseInt(options.cursor) : 0
    const limit = options?.limit || 1000
    const slice = files.slice(start, start + limit)

    return {
      files: slice,
      cursor: start + limit < files.length ? String(start + limit) : undefined,
      hasMore: start + limit < files.length,
    }
  }

  private async listRecursive(path: string, files: StorageFile[]): Promise<void> {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref: this.branch,
      })

      const items = Array.isArray(data) ? data : [data]

      for (const item of items) {
        if (item.type === 'file') {
          files.push({
            key: item.path,
            size: item.size || 0,
            lastModified: new Date(),
            url: this.getUrl(item.path),
          })
        } else if (item.type === 'dir') {
          await this.listRecursive(item.path, files)
        }
      }
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        return
      }
      throw error
    }
  }

  getUrl(key: string): string {
    switch (this.accessMethod) {
      case 'raw':
        return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/${key}`

      case 'jsdelivr':
        return `https://cdn.jsdelivr.net/gh/${this.owner}/${this.repo}@${this.branch}/${key}`

      case 'pages':
        const baseUrl = this.pagesUrl!.replace(/\/+$/, '')
        return `${baseUrl}/${key}`

      default:
        return `https://cdn.jsdelivr.net/gh/${this.owner}/${this.repo}@${this.branch}/${key}`
    }
  }

  private buildPath(filename: string, subfolder?: string, useFullPath?: boolean): string {
    const parts: string[] = []
    if (!useFullPath) parts.push(this.basePath)
    if (subfolder) parts.push(subfolder)
    parts.push(filename)
    // Remove leading slashes and duplicate slashes
    return parts.join('/').replace(/\/+/g, '/').replace(/^\/+/, '')
  }

  private async uploadToGithub(
    path: string,
    buffer: Buffer,
    message: string
  ): Promise<void> {
    const content = buffer.toString('base64')

    // Check if file exists (to update instead of create)
    let sha: string | undefined
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref: this.branch,
      })

      if (!Array.isArray(data) && 'sha' in data) {
        sha = data.sha
      }
    } catch (error: any) {
      // File doesn't exist (404), that's fine
      if (error.status !== 404) {
        console.error('GitHub getContent error:', error.response?.data || error.message)
        throw error
      }
    }

    // Create or update file
    try {
      await this.octokit.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path,
        message,
        content,
        branch: this.branch,
        ...(sha && { sha }),
      })
    } catch (error: any) {
       console.error('GitHub createOrUpdateFileContents error:', error.response?.data || error.message)

       const msg = error.response?.data?.message || error.message || ''
       if (msg.includes('exists where') && msg.includes('subdirectory')) {
         const conflict = await this.checkPathConflict(path)
         if (conflict) {
           throw new Error(
             `The path '${conflict}' exists as a file in your GitHub repository, preventing directory creation. Please rename or delete this file on GitHub.`
           )
         }
       }
       throw error
    }
  }

  private async checkPathConflict(path: string): Promise<string | null> {
    const parts = path.split('/')
    // Check parts 0 to n-2 (parent directories)
    let currentPath = ''

    // Iterate through all parent directories
    for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i]

        try {
            const { data } = await this.octokit.repos.getContent({
                owner: this.owner,
                repo: this.repo,
                path: currentPath,
                ref: this.branch,
            })

            // If it returns an object (not array) and type is file, it's a conflict
            if (!Array.isArray(data) && data.type === 'file') {
                return currentPath
            }
        } catch (e) {
            // Ignore 404 or other errors during check
        }
    }
    return null
  }

  private async deleteFromGithub(path: string): Promise<void> {
    try {
      // Get file SHA (required for deletion)
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref: this.branch,
      })

      if ('sha' in data) {
        await this.octokit.repos.deleteFile({
          owner: this.owner,
          repo: this.repo,
          path,
          message: `Delete: ${path}`,
          sha: data.sha,
          branch: this.branch,
        })
      }
    } catch (error: any) {
      if (error.status === 404) {
        console.log(`File not found on GitHub: ${path}`)
        return
      }
      throw error
    }
  }
}
