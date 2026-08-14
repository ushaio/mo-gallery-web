import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ENCRYPTED_PREFIX = 'enc:v1:'
export const REDACTED_SECRET = '********'

export class StoredSecretDecryptionError extends Error {
  constructor() {
    super(
      'Stored credential cannot be decrypted with the current server keys. Re-enter the storage credentials in the web admin.',
    )
    this.name = 'StoredSecretDecryptionError'
  }
}

export function isStoredSecretEncrypted(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(ENCRYPTED_PREFIX))
}

function deriveEncryptionKey(source: string): Buffer {
  return createHash('sha256').update(`mo-gallery:stored-secrets:v1\0${source}`).digest()
}

function getEncryptionSource(): string {
  const source = process.env.SECRETS_ENCRYPTION_KEY?.trim()
    || process.env.JWT_SECRET?.trim()
  if (!source) {
    throw new Error('SECRETS_ENCRYPTION_KEY or JWT_SECRET is required')
  }
  return source
}

function getDecryptionKeys(): Buffer[] {
  const sources = [
    process.env.SECRETS_ENCRYPTION_KEY?.trim(),
    process.env.JWT_SECRET?.trim(),
  ].filter((value): value is string => Boolean(value))

  const uniqueSources = [...new Set(sources)]
  if (uniqueSources.length === 0) {
    throw new Error('SECRETS_ENCRYPTION_KEY or JWT_SECRET is required')
  }
  return uniqueSources.map(deriveEncryptionKey)
}

export function encryptStoredSecret(value: string | null | undefined): string | null {
  if (!value) return null
  if (value.startsWith(ENCRYPTED_PREFIX)) return value

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveEncryptionKey(getEncryptionSource()), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${ENCRYPTED_PREFIX}${iv.toString('base64url')}.${authTag.toString('base64url')}.${ciphertext.toString('base64url')}`
}

export function decryptStoredSecret(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  if (!value.startsWith(ENCRYPTED_PREFIX)) return value

  const parts = value.slice(ENCRYPTED_PREFIX.length).split('.')
  if (parts.length !== 3) throw new StoredSecretDecryptionError()
  const [iv, authTag, ciphertext] = parts

  for (const key of getDecryptionKeys()) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
      decipher.setAuthTag(Buffer.from(authTag, 'base64url'))
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8')
    } catch {
      // Support credentials encrypted by the JWT fallback before a dedicated key was configured.
    }
  }

  throw new StoredSecretDecryptionError()
}

export function redactStoredSecret(value: string | null | undefined): string | null {
  return value ? REDACTED_SECRET : null
}
