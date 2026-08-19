import { PluginError, ERROR_CODES } from './errors.js'
import { JsonRpcStdioTransport } from './transport.js'
import { DESKTOP_PLUGIN_API_VERSION, DESKTOP_PLUGIN_CORE_API_VERSION } from './types.js'
import type {
  CredentialReader,
  PluginContext,
  PluginLogger,
  StoragePlugin,
  TransferChunk,
  TransferHandle,
  TransferReader,
  TransferReaderFactory,
  TransferWriteResult,
  TransferWriter,
  TransferWriterFactory,
} from './types.js'

export interface PluginHostOptions {
  input?: NodeJS.ReadableStream
  output?: NodeJS.WritableStream
  env?: Record<string, string | undefined>
  logger?: PluginLogger
  maxLineBytes?: number
}

export interface RunningStoragePlugin {
  readonly transport: JsonRpcStdioTransport
  readonly context: PluginContext
  start(): void
  close(): void
}

export function createStoragePlugin(plugin: StoragePlugin, options: PluginHostOptions = {}): RunningStoragePlugin {
	validateSystemManifest(plugin.manifest)
  const input = options.input ?? process.stdin
  const output = options.output ?? process.stdout
  const env = options.env ?? process.env
  const logger = options.logger ?? createStderrLogger()
  const transport = new JsonRpcStdioTransport(input as never, output as never, {
    logger,
    maxLineBytes: options.maxLineBytes,
  })
  const config = parseConfig(env.MO_STORAGE_PLUGIN_CONFIG)
  const credentials = createCredentialReader(env)
  const transfer = createTransferReaderFactory(transport)
  const transferWriter = createTransferWriterFactory(transport)
  const context: PluginContext = {
    config,
    credentials,
    transfer,
    transferWriter,
    log: logger,
    request: (method, params, requestOptions) => transport.request(method, params, requestOptions),
  }

  transport.on('plugin.getManifest', () => plugin.manifest)
  transport.on('plugin.health', (params) => callWithCapability(plugin, 'plugin.health', plugin.health, params, context))
  transport.on('source.validate', (params) => callWithCapability(plugin, 'source.validate', plugin.validate, params, context))
  transport.on('object.put', (params) => callWithCapability(plugin, 'object.put', plugin.put, params, context))
  transport.on('object.getUrl', (params) => callWithCapability(plugin, 'object.getUrl', plugin.getUrl, params, context))
  transport.on('object.get', (params) => callWithCapability(plugin, 'object.get', plugin.get, params, context))
  transport.on('object.stat', (params) => callWithCapability(plugin, 'object.stat', plugin.stat, params, context))
  transport.on('object.list', (params) => callWithCapability(plugin, 'object.list', plugin.list, params, context))
  transport.on('object.move', (params) => callWithCapability(plugin, 'object.move', plugin.move, params, context))
  transport.on('object.delete', (params) => callWithCapability(plugin, 'object.delete', plugin.delete, params, context))

  return {
    transport,
    context,
    start() {
      // The transport starts listening when it is constructed. Keeping an
      // explicit start method makes generated plugin entrypoints readable.
    },
    close() {
      transport.close()
    },
  }
}

function validateSystemManifest(manifest: StoragePlugin['manifest']): void {
  if (manifest.coreApiVersion && manifest.coreApiVersion !== DESKTOP_PLUGIN_CORE_API_VERSION) {
    throw new PluginError(ERROR_CODES.INVALID_MANIFEST, `unsupported plugin core api version: ${manifest.coreApiVersion}`)
  }
  const contributions = manifest.contributions
  if (!contributions?.length) return
  const domains = new Set<string>()
  for (const contribution of contributions) {
    if (!contribution.domain || !contribution.apiVersion || domains.has(contribution.domain)) {
      throw new PluginError(ERROR_CODES.INVALID_MANIFEST, 'plugin contributions must have unique domains')
    }
    domains.add(contribution.domain)
    if (contribution.domain === 'ui') {
      throw new PluginError(ERROR_CODES.INVALID_MANIFEST, 'ui contributions are not supported')
    }
  }
}

async function callWithCapability<Request, Response>(
  plugin: StoragePlugin,
  capability: string,
  handler: ((request: Request, context: PluginContext) => Promise<Response>) | undefined,
  params: unknown,
  context: PluginContext,
): Promise<Response> {
  if (!manifestHasCapability(plugin.manifest, 'storage', DESKTOP_PLUGIN_API_VERSION, capability)) {
    throw new PluginError(ERROR_CODES.CAPABILITY_MISSING, `plugin capability is not declared: ${capability}`)
  }
  if (!handler) {
    throw new PluginError(ERROR_CODES.CAPABILITY_MISSING, `plugin method is not implemented: ${capability}`)
  }
  return handler(params as Request, context)
}

function manifestHasCapability(
  manifest: StoragePlugin['manifest'],
  domain: string,
  apiVersion: string,
  capability: string,
): boolean {
  if (manifest.contributions?.length) {
    return manifest.contributions.some(contribution => (
      contribution.domain === domain &&
      contribution.apiVersion === apiVersion &&
      contribution.capabilities.includes(capability)
    ))
  }
  return manifest.apiVersion === apiVersion && Boolean(manifest.capabilities?.includes(capability))
}

function parseConfig(value: string | undefined): Readonly<Record<string, string>> {
  if (!value) return Object.freeze({})
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return Object.freeze({})
    const result: Record<string, string> = {}
    for (const [key, item] of Object.entries(parsed)) {
      if (typeof item === 'string') result[key] = item
    }
    return Object.freeze(result)
  } catch {
    throw new PluginError(ERROR_CODES.INVALID_MANIFEST, 'plugin config is not valid JSON')
  }
}

function createCredentialReader(env: Record<string, string | undefined>): CredentialReader {
  return {
    get(name) {
      return env[`MO_STORAGE_PLUGIN_CREDENTIAL_${envKey(name)}`]
    },
    require(name) {
      const value = this.get(name)
      if (!value) throw new PluginError(ERROR_CODES.CREDENTIAL_UNAVAILABLE, `credential is unavailable: ${name}`)
      return value
    },
  }
}

function envKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '_')
}

function createTransferReaderFactory(transport: JsonRpcStdioTransport): TransferReaderFactory {
  return {
    open(handle) {
      return createTransferReader(transport, handle)
    },
  }
}

function createTransferWriterFactory(transport: JsonRpcStdioTransport): TransferWriterFactory {
  return {
    open(handle) {
      return {
        async write(offset: number, data: Uint8Array, signal?: AbortSignal): Promise<TransferWriteResult> {
          if (offset < 0 || offset > Number.MAX_SAFE_INTEGER) {
            throw new PluginError(ERROR_CODES.TRANSFER_FAILED, 'transfer offset is outside the handle')
          }
          if (handle.size > 0 && offset + data.byteLength > handle.size) {
            throw new PluginError(ERROR_CODES.TRANSFER_FAILED, 'transfer write exceeds the handle size')
          }
          if (data.byteLength > 256 * 1024) {
            throw new PluginError(ERROR_CODES.TRANSFER_FAILED, 'transfer chunk exceeds the maximum size')
          }
          const result = await transport.request<TransferWriteResult>('host.transfer.write', {
            transferId: handle.id,
            offset,
            data: Buffer.from(data).toString('base64'),
          }, { signal })
          if (result.offset !== offset || result.next !== offset + data.byteLength || result.size < result.next) {
            throw new PluginError(ERROR_CODES.TRANSFER_FAILED, 'host returned an invalid transfer write result')
          }
          return result
        },
      }
    },
  }
}

function createTransferReader(transport: JsonRpcStdioTransport, handle: TransferHandle): TransferReader {
  return {
    async read(offset, length = 256 * 1024, signal): Promise<TransferChunk> {
      if (offset < 0 || offset > handle.size) {
        throw new PluginError(ERROR_CODES.TRANSFER_FAILED, 'transfer offset is outside the handle')
      }
      const response = await transport.request<{ data: string; offset: number; next: number; eof: boolean }>(
        'host.transfer.read',
        { transferId: handle.id, offset, length },
        { signal },
      )
      const data = Uint8Array.from(Buffer.from(response.data, 'base64'))
      return { data, offset: response.offset, next: response.next, eof: response.eof }
    },
    async *stream(options = {}): AsyncGenerator<Uint8Array> {
      let offset = options.offset ?? 0
      const chunkSize = options.chunkSize ?? 256 * 1024
      while (offset < handle.size) {
        const chunk = await this.read(offset, chunkSize, options.signal)
        if (chunk.data.byteLength === 0 && !chunk.eof) {
          throw new PluginError(ERROR_CODES.TRANSFER_FAILED, 'transfer returned an empty non-final chunk')
        }
        yield chunk.data
        offset = chunk.next
        if (chunk.eof) break
      }
    },
  }
}

export function createStderrLogger(stderr: NodeJS.WritableStream = process.stderr): PluginLogger {
  const write = (level: string, message: string, fields?: Record<string, unknown>) => {
    const safeFields = fields ? redactFields(fields) : undefined
    const suffix = safeFields && Object.keys(safeFields).length > 0 ? ` ${JSON.stringify(safeFields)}` : ''
    stderr.write(`[mo-gallery-plugin] ${level}: ${message}${suffix}\n`)
  }
  return {
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
  }
}

function redactFields(fields: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (/token|secret|password|credential|authorization|signed.?url/i.test(key)) {
      result[key] = '[redacted]'
    } else if (typeof value === 'string' && /https?:\/\/.*[?&](x-amz-|signature|token|expires)/i.test(value)) {
      result[key] = '[redacted-url]'
    } else {
      result[key] = value
    }
  }
  return result
}
