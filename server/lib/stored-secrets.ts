import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ENCRYPTED_PREFIX = 'enc:v1:'
export const REDACTED_SECRET = '********'

export function isStoredSecretEncrypted(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(ENCRYPTED_PREFIX))
}

function getEncryptionKey(): Buffer {
  const source = process.env.SECRETS_ENCRYPTION_KEY?.trim()
    || process.env.JWT_SECRET?.trim()
  if (!source) {
    throw new Error('SECRETS_ENCRYPTION_KEY or JWT_SECRET is required')
  }
  return createHash('sha256').update(`mo-gallery:stored-secrets:v1\0${source}`).digest()
}

export function encryptStoredSecret(value: string | null | undefined): string | null {
  if (!value) return null
  if (value.startsWith(ENCRYPTED_PREFIX)) return value

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${ENCRYPTED_PREFIX}${iv.toString('base64url')}.${authTag.toString('base64url')}.${ciphertext.toString('base64url')}`
}

export function decryptStoredSecret(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  if (!value.startsWith(ENCRYPTED_PREFIX)) return value

  const parts = value.slice(ENCRYPTED_PREFIX.length).split('.')
  if (parts.length !== 3) throw new Error('Invalid encrypted secret')
  const [iv, authTag, ciphertext] = parts
  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(authTag, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function redactStoredSecret(value: string | null | undefined): string | null {
  return value ? REDACTED_SECRET : null
}
