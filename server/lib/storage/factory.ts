import { StorageProvider, StorageConfig, StorageError } from './types'
import { LocalStorageProvider } from './local'
import { GithubStorageProvider } from './github'
import { S3StorageProvider } from './s3'

export class StorageProviderFactory {
  static create(config: StorageConfig): StorageProvider {
    switch (config.provider) {
      case 'local':
        return new LocalStorageProvider(config)
      case 'github':
        return new GithubStorageProvider(config)
      case 's3':
        return new S3StorageProvider(config)
      default:
        throw new StorageError(
          `Unknown storage provider: ${config.provider}`,
          'UNKNOWN_PROVIDER'
        )
    }
  }
}
