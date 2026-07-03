import jwt from 'jsonwebtoken'

export interface JwtPayload {
  sub: string
  username: string
  isAdmin?: boolean
  oauthProvider?: string
  avatarUrl?: string
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim()
  if (!secret) {
    throw new Error('JWT_SECRET is required')
  }
  return secret
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' })
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getJwtSecret()) as JwtPayload
}
