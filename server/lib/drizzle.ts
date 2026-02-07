import 'server-only'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '~/drizzle/schema'

const connectionString = process.env.DATABASE_URL!
const queryClient = postgres(connectionString)

export const db = drizzle(queryClient, { schema })

export * from '~/drizzle/schema'
