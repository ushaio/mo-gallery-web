import { useCallback, useSyncExternalStore } from 'react'

import { subscribeDataRevision, sumDataRevisions, type DataRevisionKey } from '@/lib/data-revision'

/**
 * 汇总若干数据域的失效计数，作为 useCachedPageEffect 的依赖使用。
 *
 * 任一数据域被写操作失效后返回值就会变化，页面因此在下次显示时重新加载一次；
 * 单纯切换菜单不会改变该值，也就不会产生请求。
 */
export function useDataRevision(...keys: DataRevisionKey[]) {
  const keyToken = keys.join('|')

  const getSnapshot = useCallback(
    () => sumDataRevisions(keyToken === '' ? [] : (keyToken.split('|') as DataRevisionKey[])),
    [keyToken],
  )

  return useSyncExternalStore(subscribeDataRevision, getSnapshot)
}
