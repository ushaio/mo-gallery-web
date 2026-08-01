declare module '@waline/vercel' {
  import { Handler } from 'hono'

  interface WalineOptions {
    serverURL?: string
    secret?: string
    category?: string[]
    wordLimit?: number | [number, number]
    requiredMeta?: string[]
    emoji?: (string | { icon: string; name: string })[]
    dark?: string | boolean
    locale?: Record<string, string>
    login?: 'enable' | 'disable' | 'force'
    meta?: ('nick' | 'mail' | 'link')[]
    pageSize?: number
    comment?: boolean
    pageview?: boolean
    preSave?: (comment: Record<string, unknown>) => unknown
    postSave?: (comment: Record<string, unknown>) => unknown
    postDelete?: (commentId: string) => unknown
    postUpdate?: () => unknown
  }

  export default function Waline(options?: WalineOptions): Handler
}
