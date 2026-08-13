import jwt from 'jsonwebtoken'

export interface JwtPayload {
  sub: string
  username: string
  isAdmin?: boolean
  oauthProvider?: string
  avatarUrl?: string
  adminGateVersion?: string
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim()
  if (!secret) {
    throw new Error('JWT_SECRET is required')
  }
  if (process.env.NODE_ENV === 'production' && Buffer.byteLength(secret) < 32) {
    throw new Error('JWT_SECRET must be at least 32 bytes in production')
  }
  return secret
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: '7d',
  })
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getJwtSecret(), {
    algorithms: ['HS256'],
  }) as JwtPayload
}
