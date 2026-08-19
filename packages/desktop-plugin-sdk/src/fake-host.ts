import { PassThrough } from 'node:stream'
import { JsonRpcStdioTransport } from './transport.js'
import { PluginError, ERROR_CODES } from './errors.js'
import type { RpcRequestOptions, TransferHandle } from './types.js'

export interface FakeHost {
  readonly transport: JsonRpcStdioTransport
  readonly pluginInput: PassThrough
  readonly pluginOutput: PassThrough
  setTransfer(handle: TransferHandle, data: Uint8Array): void
  setDownloadTransfer(handle: TransferHandle): void
  readDownloadTransfer(id: string): Uint8Array
  request<T = unknown>(method: string, params?: unknown, options?: RpcRequestOptions): Promise<T>
  close(): void
}

export function createFakeHost(): FakeHost {
  const hostToPlugin = new PassThrough()
  const pluginToHost = new PassThrough()
  const hostTransport = new JsonRpcStdioTransport(pluginToHost, hostToPlugin)
  const transfers = new Map<string, Uint8Array>()
  const downloadTransfers = new Map<string, { chunks: Uint8Array[]; next: number }>()
  hostTransport.on('host.transfer.read', (params) => {
    const request = params as { transferId: string; offset: number; length: number }
    const data = transfers.get(request.transferId)
    if (!data) throw new PluginError(ERROR_CODES.TRANSFER_FAILED, 'fake transfer not found')
    const offset = Math.max(0, request.offset)
    const end = Math.min(data.byteLength, offset + Math.max(1, request.length))
    const chunk = data.slice(offset, end)
    return {
      data: Buffer.from(chunk).toString('base64'),
      offset,
      next: end,
      eof: end >= data.byteLength,
    }
  })
  hostTransport.on('host.transfer.write', (params) => {
    const request = params as { transferId: string; offset: number; data: string }
    const transfer = downloadTransfers.get(request.transferId)
    if (!transfer) throw new PluginError(ERROR_CODES.TRANSFER_FAILED, 'fake download transfer not found')
    if (request.offset !== transfer.next) throw new PluginError(ERROR_CODES.TRANSFER_FAILED, 'fake download transfer is not sequential')
    const data = Uint8Array.from(Buffer.from(request.data, 'base64'))
    transfer.chunks.push(data)
    transfer.next += data.byteLength
    return { offset: request.offset, next: transfer.next, size: transfer.next }
  })
  return {
    transport: hostTransport,
    pluginInput: hostToPlugin,
    pluginOutput: pluginToHost,
    setTransfer(handle, data) {
      if (data.byteLength !== handle.size) throw new Error('fake transfer size mismatch')
      transfers.set(handle.id, data)
    },
    setDownloadTransfer(handle) {
      downloadTransfers.set(handle.id, { chunks: [], next: 0 })
    },
    readDownloadTransfer(id) {
      const transfer = downloadTransfers.get(id)
      if (!transfer) throw new PluginError(ERROR_CODES.TRANSFER_FAILED, 'fake download transfer not found')
      const size = transfer.chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
      const result = new Uint8Array(size)
      let offset = 0
      for (const chunk of transfer.chunks) {
        result.set(chunk, offset)
        offset += chunk.byteLength
      }
      return result
    },
    request<T = unknown>(method: string, params?: unknown, options?: RpcRequestOptions) {
      return hostTransport.request<T>(method, params, options)
    },
    close() {
      hostTransport.close()
      hostToPlugin.end()
      pluginToHost.end()
    },
  }
}
