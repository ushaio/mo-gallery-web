import { useEffect, useRef, type DependencyList, type EffectCallback } from 'react'

function depsUnchanged(previous: DependencyList, next: DependencyList) {
  if (previous.length !== next.length) return false
  return previous.every((dep, index) => Object.is(dep, next[index]))
}

/**
 * 与 useEffect 同签名，但只在依赖真正变化时执行，会跳过「重复挂载」造成的重跑。
 *
 * 背景：AdminLayout 用 <Activity> 常驻缓存菜单页。React 的
 * <Activity mode="hidden"> 会保留 state / ref / DOM / 滚动位置，却会销毁 effect，
 * 并在重新显示时重建。因此「进入页面时加载数据」的 effect 每次切回菜单都会重跑，
 * 表现为页面刷新。开发环境 StrictMode 的双次挂载同理。
 *
 * 这里用 ref 记住上一次真正执行时的依赖值：依赖没变化就直接跳过；
 * 依赖变化时照常执行，所以配合 useDataRevision 仍能在写操作后重新加载。
 *
 * 使用约束：
 * - 只用于「加载数据」这类可以跳过的 effect。需要在重新显示时重新建立的副作用
 *   （window 事件监听、Wails 回调注册、订阅、定时器等）必须继续使用 useEffect。
 * - 传入的 effect 不要用 cleanup 做请求取消：页面隐藏时 cleanup 仍会执行，而重新
 *   显示时不会再跑一次 setup，在途请求会被取消且不再重试。需要判定失效时，
 *   改用请求序号 ref（参考 PhotosPage 的 fetchRequestIdRef）。
 */
export function useCachedPageEffect(effect: EffectCallback, deps: DependencyList) {
  const lastDepsRef = useRef<DependencyList | null>(null)

  useEffect(() => {
    const lastDeps = lastDepsRef.current
    if (lastDeps !== null && depsUnchanged(lastDeps, deps)) return

    lastDepsRef.current = deps
    return effect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
