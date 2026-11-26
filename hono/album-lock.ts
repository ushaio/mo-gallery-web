/**
 * 同一相册的写操作串行化。
 *
 * 为什么需要：`album.update({ photos: { connect } })` 是「把关系集更新成旧的 + 新的」——
 * Prisma 先读当时的集合、算出差集、再往 `_AlbumPhotos` 插行。两个请求并发地跑同一张
 * 相册时，两个事务读到同一份旧快照，插入就可能撞上 `_AlbumPhotos (A,B)` 的主键，整条
 * 路由以 500 结束。而上传队列的并发度是 3（`UploadQueueContext` 的 CONCURRENCY），
 * 一次把十几张照片拖进同一个相册，几乎必然踩到 —— 表现就是「照片已上传，但添加到相册
 * 失败」，而照片本身其实好好的。
 *
 * 所以按 albumId 排队：同一张相册的追加一个接一个跑，不同相册之间仍然并发。
 * 这是进程内的锁 —— 够用，因为这些写都来自同一个 Next 进程里的事件循环；多实例部署下
 * 真正的幂等由数据库主键兜底（重复 connect 会失败，但那时照片已在相册里，见
 * `appendPhotosToAlbum` 的先查后写）。
 */

const albumWriteQueues = new Map<string, Promise<unknown>>()

/**
 * 把 `work` 排进 `albumId` 那条队列，返回它自己的结果。
 *
 * 前一个请求失败不该拖累后面的：链条用 `then(work, work)` 接住，只关心「轮到我了」。
 * 队列的清理放在 finally 里，并且比对 `=== next` —— 如果这期间又排了新任务，
 * 队尾已经不是自己，就不能删（否则会把自己的后继从表里抹掉）。
 */
export function withAlbumLock<T>(albumId: string, work: () => Promise<T>): Promise<T> {
  const previous = albumWriteQueues.get(albumId) ?? Promise.resolve()
  const next = previous.then(work, work)
  // 队列里存的是「吞掉错误」的那一份：链条不能被前一个失败炸断。
  // 清理时必须拿**这个同引用**去比对 —— 存 `next` 而比 `next.catch(...)` 的结果，
  // 两者永远不相等，队尾就再也删不掉（长驻进程里是真的泄漏）。
  const tail = next.then(() => undefined, () => undefined)
  albumWriteQueues.set(albumId, tail)
  void tail.finally(() => {
    if (albumWriteQueues.get(albumId) === tail) albumWriteQueues.delete(albumId)
  })
  return next
}

/** 当前队列里还挂着多少个相册（仅测试用，观察队尾清理是否生效）。 */
export function albumLockSizeForTest(): number {
  return albumWriteQueues.size
}
