import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

loadEnv({ path: '.env.local' })
loadEnv()

export default defineConfig({
  schema: './drizzle/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
})
