import { createHash } from 'node:crypto'
import { db } from './db'

const WINDOW_MS = 15 * 60 * 1000
const LIMITS = {
  pair: 5,
  account: 10,
  ip: 30,
} as const

interface AttemptRecord {
  key: string
  failures: number
  resetAt: Date
}

function hashKey(value: string): string {
  return createHash('sha256')
    .update(value)
    .digest('base64url')
}

function keysFor(ip: string, username: string) {
  const normalizedUsername = username.trim().toLowerCase()
  return [
    { key: hashKey(`pair\0${ip}\0${normalizedUsername}`), limit: LIMITS.pair },
    { key: hashKey(`account\0${normalizedUsername}`), limit: LIMITS.account },
    { key: hashKey(`ip\0${ip}`), limit: LIMITS.ip },
  ]
}

export async function getLoginLimit(ip: string, username: string, now = Date.now()) {
  const blockedRecords: AttemptRecord[] = []
  for (const candidate of keysFor(ip, username)) {
    const records = await db.$queryRaw<AttemptRecord[]>`
      SELECT "key", "failures", "resetAt"
      FROM "AdminLoginAttempt"
      WHERE "key" = ${candidate.key}
        AND "resetAt" > ${new Date(now)}
        AND "failures" >= ${candidate.limit}
      LIMIT 1
    `
    if (records[0]) blockedRecords.push(records[0])
  }
  if (blockedRecords.length === 0) return null

  return {
    retryAfterSeconds: Math.max(
      1,
      ...blockedRecords.map((record) => Math.ceil((record.resetAt.getTime() - now) / 1000)),
    ),
  }
}

export async function recordLoginFailure(ip: string, username: string, now = Date.now()) {
  const resetAt = new Date(now + WINDOW_MS)
  for (const candidate of keysFor(ip, username)) {
    await db.$executeRaw`
      INSERT INTO "AdminLoginAttempt" ("key", "failures", "resetAt", "updatedAt")
      VALUES (${candidate.key}, 1, ${resetAt}, CURRENT_TIMESTAMP)
      ON CONFLICT ("key") DO UPDATE SET
        "failures" = CASE
          WHEN "AdminLoginAttempt"."resetAt" <= CURRENT_TIMESTAMP THEN 1
          ELSE "AdminLoginAttempt"."failures" + 1
        END,
        "resetAt" = CASE
          WHEN "AdminLoginAttempt"."resetAt" <= CURRENT_TIMESTAMP THEN EXCLUDED."resetAt"
          ELSE "AdminLoginAttempt"."resetAt"
        END,
        "updatedAt" = CURRENT_TIMESTAMP
    `
  }
}

export async function clearLoginFailures(ip: string, username: string) {
  for (const candidate of keysFor(ip, username)) {
    await db.$executeRaw`DELETE FROM "AdminLoginAttempt" WHERE "key" = ${candidate.key}`
  }
}
