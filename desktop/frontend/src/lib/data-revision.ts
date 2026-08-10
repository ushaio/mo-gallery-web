/**
 * 数据域失效计数。
 *
 * 菜单页被 <Activity> 常驻缓存后，「重新进入页面」不再触发重新加载，
 * 因此需要一个显式信号来表达「这块数据已经被写操作改过了」。
 * 写入方调用 bumpDataRevision，页面把 useDataRevision 的返回值作为
 * useCachedPageEffect 的依赖，即可在下次显示时恰好重新加载一次。
 *
 * 这里只保存计数，不保存数据；真正的缓存仍由 lib/app-cache.ts 与
 * lib/persistent-cache.ts 负责。
 */

export type DataRevisionKey =
  | 'overview'
  | 'equipment'
  | 'photos'
  | 'albums'
  | 'categories'
  | 'film-rolls'
  | 'stories'
  | 'friends'
  | 'storage-sources'
  | 'settings'
  | 'zine-projects'

const revisions = new Map<DataRevisionKey, number>()
const listeners = new Set<() => void>()

export function getDataRevision(key: DataRevisionKey) {
  return revisions.get(key) ?? 0
}

export function bumpDataRevision(...keys: DataRevisionKey[]) {
  if (keys.length === 0) return

  for (const key of keys) revisions.set(key, getDataRevision(key) + 1)
  for (const listener of [...listeners]) listener()
}

export function subscribeDataRevision(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function sumDataRevisions(keys: readonly DataRevisionKey[]) {
  let total = 0
  for (const key of keys) total += getDataRevision(key)
  return total
}
