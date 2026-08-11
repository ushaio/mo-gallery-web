import { AppendZineLogs } from '../../../wailsjs/go/main/App'

const FLUSH_DELAY_MS = 200
const MAX_PENDING_ENTRIES = 100

interface ZineLogOptions {
  flush?: boolean
}

let pendingLines: string[] = []
let flushTimer: number | null = null
let flushChain = Promise.resolve()

function serializeDetails(details: Record<string, unknown>) {
  try {
    return JSON.parse(JSON.stringify(details)) as Record<string, unknown>
  } catch {
    return { serializationError: true }
  }
}

export function recordZineOperation(event: string, details: Record<string, unknown> = {}, options: ZineLogOptions = {}) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    details: serializeDetails(details),
  })

  console.debug(`[zine] ${event}`, details)
  pendingLines.push(entry)
  if (pendingLines.length > MAX_PENDING_ENTRIES) pendingLines = pendingLines.slice(-MAX_PENDING_ENTRIES)

  if (options.flush) {
    void flushZineOperations()
    return
  }
  if (flushTimer !== null) return
  flushTimer = window.setTimeout(() => {
    flushTimer = null
    void flushZineOperations()
  }, FLUSH_DELAY_MS)
}

export function flushZineOperations() {
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer)
    flushTimer = null
  }
  if (pendingLines.length === 0) return flushChain

  const lines = pendingLines.splice(0, MAX_PENDING_ENTRIES)
  flushChain = flushChain
    .then(() => AppendZineLogs(lines))
    .catch((error: unknown) => {
      console.error('[zine] failed to persist operation log', error)
    })
  return flushChain
}
