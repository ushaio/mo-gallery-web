import 'server-only'
import { PrismaClient } from '@prisma/client'

// Timezone offset in hours (UTC+8 for Asia/Shanghai)
const TIMEZONE_OFFSET_HOURS = 8

/**
 * Adjust DateTime fields from database.
 * The database stores local time (UTC+8) but Prisma treats it as UTC.
 * We subtract the offset to get the correct UTC representation.
 */
function adjustDateTimeFromDb(date: Date): Date {
  return new Date(date.getTime() - TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000)
}

/**
 * Recursively process query results to adjust DateTime fields
 */
function processResult<T>(data: T): T {
  if (data === null || data === undefined) return data
  if (data instanceof Date) return adjustDateTimeFromDb(data) as T
  if (Array.isArray(data)) return data.map(processResult) as T
  if (typeof data === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) {
      result[key] = processResult(value)
    }
    return result as T
  }
  return data
}

const prismaClientSingleton = () => {
  const client = new PrismaClient()

  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const result = await query(args)
          return processResult(result)
        },
      },
    },
  })
}

declare const globalThis: {
  prisma: ReturnType<typeof prismaClientSingleton>
} & typeof global

const prisma = globalThis.prisma || prismaClientSingleton()

export const db = prisma

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma
}
