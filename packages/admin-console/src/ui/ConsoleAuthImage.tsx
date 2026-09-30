'use client'

import * as React from 'react'
import { useCallback, useSyncExternalStore } from 'react'

import { useConsoleRuntime } from '../runtime/ConsoleRuntimeProvider'

/**
 * 鉴权取流图片（`ConsoleAuthImage` / `useConsoleAssetUrl`）。
 *
 * 场景：资源地址是受保护端点（例如官网 `/api/cloud/images/<id>/content`，
 * `requiresAuth: true`），`<img>` 带不了 Bearer 头，必须先取流转 `blob:` URL。
 *
 * 取流实现由宿主注入（差异登记点②）：
 * - 首选 `fetcher` prop（组件/hook 级注入，适合宿主已有 session 模块的场景）；
 * - 否则回落 `ConsoleRuntimeProvider` 的 `adapter.fetchAssetBlobUrl`；
 * - 两者都没有时，非直链资源一律渲染 `fallback`（不抛错，便于渐进接入）。
 *
 * 缓存：模块级 `Map` + 引用计数，同一资源在多处渲染只取一次流；卸载即 revoke。
 * `scope` 用于会话变化（重新登录、切换账号）后让旧 blob 失效——把 token 指纹之类
 * 的东西传进来即可，缓存键变成 `scope\0path`。
 */

/** 取流实现：返回对象 URL（`blob:`），失败返回 `null`。 */
export type ConsoleAssetFetcher = (assetPath: string) => Promise<string | null>

/** `http(s)://` / `data:` / `blob:` 视为「不需要鉴权」的直链，原样渲染。 */
export function isDirectAssetUrl(assetPath: string | null | undefined): boolean {
  if (!assetPath) return false
  return /^(https?:|data:|blob:)/i.test(assetPath.trim())
}

interface AssetEntry {
  status: 'loading' | 'ready' | 'error'
  url: string | null
  refs: number
  started: boolean
  disposed: boolean
  listeners: Set<() => void>
}

const cache = new Map<string, AssetEntry>()

function notify(entry: AssetEntry) {
  for (const listener of entry.listeners) listener()
}

function normalizePath(assetPath: string | null | undefined): string | null {
  if (!assetPath) return null
  const trimmed = assetPath.trim()
  return trimmed ? trimmed : null
}

function cacheKey(scope: string | undefined, path: string): string {
  return `${scope ?? ''}\u0000${path}`
}

function acquire(key: string, path: string, fetcher: ConsoleAssetFetcher): AssetEntry {
  let entry = cache.get(key)
  if (!entry) {
    entry = {
      status: 'loading',
      url: null,
      refs: 0,
      started: false,
      disposed: false,
      listeners: new Set(),
    }
    cache.set(key, entry)
  }
  entry.refs += 1

  if (!entry.started) {
    entry.started = true
    const current = entry
    void fetcher(path)
      .then((url) => {
        if (current.disposed) {
          // 已经没人看这张图了：立刻回收，别泄漏 blob URL。
          if (url) URL.revokeObjectURL(url)
          return
        }
        current.url = url
        current.status = url ? 'ready' : 'error'
        notify(current)
      })
      .catch(() => {
        if (current.disposed) return
        current.url = null
        current.status = 'error'
        notify(current)
      })
  }

  return entry
}

function release(key: string) {
  const entry = cache.get(key)
  if (!entry) return
  entry.refs -= 1
  if (entry.refs > 0) return
  entry.disposed = true
  cache.delete(key)
  if (entry.url) URL.revokeObjectURL(entry.url)
}

/**
 * 取 `assetPath` 对应的 blob 地址；`null` 表示「取流中」或「取流失败」，
 * 两种情况下调用方都渲染 fallback。
 */
export function useConsoleAssetUrl(
  assetPath: string | null | undefined,
  fetcher?: ConsoleAssetFetcher,
  scope?: string,
): string | null {
  const { adapter } = useConsoleRuntime()
  const path = normalizePath(assetPath)
  const direct = isDirectAssetUrl(path)
  const effectiveFetcher = fetcher ?? adapter.fetchAssetBlobUrl
  const key = path && !direct ? cacheKey(scope, path) : null

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!key || !path || !effectiveFetcher) return () => {}
      const entry = acquire(key, path, effectiveFetcher)
      entry.listeners.add(onStoreChange)
      return () => {
        entry.listeners.delete(onStoreChange)
        release(key)
      }
    },
    [key, path, effectiveFetcher],
  )

  const getSnapshot = useCallback((): string | null => {
    if (!key || !effectiveFetcher) return null
    const entry = cache.get(key)
    return entry && entry.status === 'ready' ? entry.url : null
  }, [key, effectiveFetcher])

  const getServerSnapshot = useCallback((): string | null => null, [])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export interface ConsoleAuthImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** 资源路径；`null`/`''` → 渲染 `fallback`。直链（http(s)/data:/blob:）原样渲染。 */
  assetPath: string | null | undefined
  /** 取流实现；不传则用 `adapter.fetchAssetBlobUrl` */
  fetcher?: ConsoleAssetFetcher
  /** 会话/账号指纹，用于让旧 blob 缓存失效 */
  scope?: string
  /** 无资源、取流中或取流失败时渲染的内容 */
  fallback?: React.ReactNode
}

/**
 * 鉴权取流 `<img>`：直链直接渲染，受保护路径先取流转 blob。
 *
 * 其余 `<img>` 属性原样透传（缩放/拖拽用的 `style`、`onPointerDown`，以及
 * 「已缓存即视为加载完成」的 ref 回调等宿主用法都能保留）。
 */
export const ConsoleAuthImage = React.forwardRef<HTMLImageElement, ConsoleAuthImageProps>(
  function ConsoleAuthImage(
    { assetPath, fetcher, scope, fallback = null, alt = '', ...imgProps },
    ref,
  ) {
    const resolved = useConsoleAssetUrl(assetPath, fetcher, scope)
    const direct = isDirectAssetUrl(assetPath)

    if (!assetPath) return <>{fallback}</>
    const src = direct ? assetPath : resolved
    if (!src) return <>{fallback}</>

    /* 必须是原生 <img>：受保护资源是 blob: URL，next/image 会再包一层优化请求 */
    /* eslint-disable-next-line @next/next/no-img-element */
    return <img {...imgProps} ref={ref} src={src} alt={alt} />
  },
)
