export const DESKTOP_PLUGIN_API_VERSION = '1' as const
export const DESKTOP_PLUGIN_CORE_API_VERSION = '1' as const
export const NODE_RUNTIME = 'node22' as const

export type PluginType = 'node' | 'executable'
export interface PluginRuntime {
  type: PluginType
  version?: string
  entry: string
}

export interface PluginContribution {
  domain: string
  apiVersion: string
  capabilities: Capability[]
}

export type Capability =
  | 'plugin.health'
  | 'source.validate'
  | 'object.put'
  | 'object.get'
  | 'object.stat'
  | 'object.list'
  | 'object.move'
  | 'object.delete'
  | 'object.getUrl'
  | (string & {})

export interface PluginManifest {
  id: string
  version: string
  coreApiVersion?: string
  apiVersion?: string
  name?: string
  description?: string
  type?: PluginType
  runtime?: string | PluginRuntime
  entry?: string
  platforms?: string[]
  capabilities?: Capability[]
  contributions?: PluginContribution[]
  permissions?: string[]
  configSchema?: Record<string, unknown>
  credentialSchema?: Record<string, unknown>
}

export interface ValidateRequest {
  sourceId: string
  config: Record<string, string>
}

export interface ValidateResult {
  valid: boolean
  error?: string
}

export interface HealthRequest {
  sourceId: string
}

export interface HealthResult {
  status: 'ready' | 'degraded' | 'error' | string
  message?: string
}

export interface PutRequest {
  sourceId: string
  transferId: string
  size: number
  key: string
  contentType?: string
  checksum?: string
  idempotencyKey?: string
}

export interface GetRequest {
  sourceId: string
  key: string
  transferId: string
}

export interface StatRequest {
  sourceId: string
  key: string
}

export interface ListRequest {
  sourceId: string
  prefix?: string
  cursor?: string
  limit?: number
}

export interface MoveRequest {
  sourceId: string
  fromKey: string
  toKey: string
}

export interface DeleteRequest {
  sourceId: string
  key: string
}

export interface UrlRequest {
  sourceId: string
  key: string
}

export type UrlType = 'public' | 'signed' | 'temporary' | 'local' | string

export interface ObjectInfo {
  key: string
  url?: string
  urlType?: UrlType
  size: number
  contentType?: string
  checksum?: string
  version?: string
  expiresAt?: string
}

export interface ListResult {
  objects: ObjectInfo[]
  nextCursor?: string
  hasMore?: boolean
}

export interface TransferHandle {
  id: string
  size: number
}

export interface TransferChunk {
  data: Uint8Array
  offset: number
  next: number
  eof: boolean
}

export interface TransferReader {
  read(offset: number, length?: number, signal?: AbortSignal): Promise<TransferChunk>
  stream(options?: { offset?: number; chunkSize?: number; signal?: AbortSignal }): AsyncGenerator<Uint8Array>
}

export interface PluginContext {
  readonly config: Readonly<Record<string, string>>
  readonly credentials: CredentialReader
  readonly transfer: TransferReaderFactory
  readonly transferWriter: TransferWriterFactory
  readonly log: PluginLogger
  request<T = unknown>(method: string, params?: unknown, options?: RpcRequestOptions): Promise<T>
}

export interface CredentialReader {
  get(name: string): string | undefined
  require(name: string): string
}

export interface TransferReaderFactory {
  open(handle: TransferHandle): TransferReader
}

export interface TransferWriteResult {
  offset: number
  next: number
  size: number
}

export interface TransferWriter {
  write(offset: number, data: Uint8Array, signal?: AbortSignal): Promise<TransferWriteResult>
}

export interface TransferWriterFactory {
  open(handle: TransferHandle): TransferWriter
}

export interface PluginLogger {
  debug(message: string, fields?: Record<string, unknown>): void
  info(message: string, fields?: Record<string, unknown>): void
  warn(message: string, fields?: Record<string, unknown>): void
  error(message: string, fields?: Record<string, unknown>): void
}

export type PluginMethod<Request, Response> = (
  request: Request,
  context: PluginContext,
) => Promise<Response>

export interface StoragePlugin {
  manifest: PluginManifest
  validate: PluginMethod<ValidateRequest, ValidateResult>
  health: PluginMethod<HealthRequest, HealthResult>
  put: PluginMethod<PutRequest, ObjectInfo>
  getUrl: PluginMethod<UrlRequest, ObjectInfo>
  get?: PluginMethod<GetRequest, ObjectInfo>
  stat?: PluginMethod<StatRequest, ObjectInfo>
  list?: PluginMethod<ListRequest, ListResult>
  move?: PluginMethod<MoveRequest, ObjectInfo>
  delete?: PluginMethod<DeleteRequest, void>
}

export interface RpcRequestOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

export interface RpcRequest {
  jsonrpc: '2.0'
  id?: number
  method: string
  params?: unknown
}

export interface RpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: RpcErrorPayload
}

export interface RpcErrorPayload {
  code: string | number
  message: string
  data?: unknown
}
