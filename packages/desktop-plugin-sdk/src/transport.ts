import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import { PluginError, ERROR_CODES, toPluginError } from './errors.js'
import type {
  PluginLogger,
  RpcErrorPayload,
  RpcRequest,
  RpcRequestOptions,
  RpcResponse,
} from './types.js'

export type RpcHandler = (params: unknown, request: RpcRequest) => unknown | Promise<unknown>

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
  timer?: ReturnType<typeof setTimeout>
}

export interface JsonRpcTransportOptions {
  logger?: PluginLogger
  maxLineBytes?: number
}

export class JsonRpcStdioTransport {
  private readonly input: Readable
  private readonly output: Writable
  private readonly pending = new Map<number, PendingRequest>()
  private readonly handlers = new Map<string, RpcHandler>()
  private readonly logger?: PluginLogger
  private readonly maxLineBytes: number
  private nextId = 1
  private closed = false

  constructor(input: Readable, output: Writable, options: JsonRpcTransportOptions = {}) {
    this.input = input
    this.output = output
    this.logger = options.logger
    this.maxLineBytes = options.maxLineBytes ?? 4 * 1024 * 1024
    const lines = createInterface({ input, crlfDelay: Infinity })
    lines.on('line', (line) => {
      if (Buffer.byteLength(line, 'utf8') > this.maxLineBytes) {
        this.logger?.error('Rejected oversized JSON-RPC message')
        return
      }
      void this.handleLine(line)
    })
    lines.on('close', () => this.close(new PluginError(ERROR_CODES.PLUGIN_CRASHED, 'plugin transport closed')))
    input.on('error', (error) => this.close(new PluginError(ERROR_CODES.PLUGIN_CRASHED, 'plugin input failed', error.message)))
  }

  on(method: string, handler: RpcHandler): () => void {
    this.handlers.set(method, handler)
    return () => this.handlers.delete(method)
  }

  async request<T = unknown>(method: string, params?: unknown, options: RpcRequestOptions = {}): Promise<T> {
    if (this.closed) throw new PluginError(ERROR_CODES.PLUGIN_CRASHED, 'plugin transport is closed')
    const id = this.nextId++
    const request: RpcRequest = { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) }
    const signal = options.signal
    if (signal?.aborted) throw new PluginError(ERROR_CODES.REQUEST_CANCELED, 'request was canceled')

    return await new Promise<T>((resolve, reject) => {
      const pending: PendingRequest = { resolve: resolve as (value: unknown) => void, reject }
      const abort = () => {
        this.pending.delete(id)
        this.write({ jsonrpc: '2.0', method: '$/cancelRequest', params: { id } })
        reject(new PluginError(ERROR_CODES.REQUEST_CANCELED, 'request was canceled'))
      }
      if (signal) signal.addEventListener('abort', abort, { once: true })
      if (options.timeoutMs && options.timeoutMs > 0) {
        pending.timer = setTimeout(() => {
          this.pending.delete(id)
          this.write({ jsonrpc: '2.0', method: '$/cancelRequest', params: { id } })
          reject(new PluginError(ERROR_CODES.REQUEST_TIMEOUT, `request timed out: ${method}`))
        }, options.timeoutMs)
      }
      this.pending.set(id, pending)
      try {
        this.write(request)
      } catch (error) {
        this.pending.delete(id)
        if (pending.timer) clearTimeout(pending.timer)
        reject(error)
      }
    })
  }

  notify(method: string, params?: unknown): void {
    if (this.closed) return
    this.write({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) })
  }

  close(reason: unknown = new PluginError(ERROR_CODES.PLUGIN_CRASHED, 'plugin transport closed')): void {
    if (this.closed) return
    this.closed = true
    const error = toPluginError(reason, ERROR_CODES.PLUGIN_CRASHED)
    for (const pending of this.pending.values()) {
      if (pending.timer) clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }

  private async handleLine(line: string): Promise<void> {
    let message: RpcRequest | RpcResponse
    try {
      message = JSON.parse(line) as RpcRequest | RpcResponse
    } catch {
      this.logger?.warn('Ignored malformed JSON-RPC message')
      return
    }
    if ('method' in message && typeof message.method === 'string') {
      const handler = this.handlers.get(message.method)
      if (!handler) {
        if (message.id !== undefined) this.writeError(message.id, { code: -32601, message: `method not found: ${message.method}` })
        return
      }
      try {
        const result = await handler(message.params, message)
        if (message.id !== undefined) this.write({ jsonrpc: '2.0', id: message.id, result })
      } catch (error) {
        if (message.id !== undefined) {
          const pluginError = toPluginError(error)
          this.writeError(message.id, { code: pluginError.code, message: pluginError.message, data: pluginError.data })
        }
      }
      return
    }
    if (!('id' in message) || typeof message.id !== 'number') return
    const response = message as RpcResponse
    const pending = this.pending.get(response.id)
    if (!pending) return
    this.pending.delete(response.id)
    if (pending.timer) clearTimeout(pending.timer)
    if (response.error) {
      pending.reject(new PluginError(String(response.error.code), response.error.message, response.error.data))
    } else {
      pending.resolve(response.result)
    }
  }

  private writeError(id: number, error: RpcErrorPayload): void {
    this.write({ jsonrpc: '2.0', id, error })
  }

  private write(message: RpcRequest | RpcResponse): void {
    if (this.closed && 'id' in message) return
    const line = JSON.stringify(message)
    if (Buffer.byteLength(line, 'utf8') > this.maxLineBytes) {
      throw new PluginError('message_too_large', 'JSON-RPC message exceeds the maximum size')
    }
    this.output.write(`${line}\n`)
  }
}
