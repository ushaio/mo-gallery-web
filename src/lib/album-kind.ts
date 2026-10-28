import type { AlbumDto } from '@/lib/api/types'

/**
 * 相册类型（`Album.type`）。
 *
 * - `general` 不区分（默认）：画廊相册视图与策展页都展示。迁移前的老相册全部落在这一档，
 *   所以升级后策展页的内容不会因为新字段而空掉。
 * - `normal` 普通相册：只进画廊，不进策展页。
 * - `curated` 策展：进策展页，同时仍可在画廊里打开。
 *
 * 一张照片可以同时属于多个相册（Album ↔ Photo 是隐式多对多），类型只影响
 * 「这张相册出现在哪里」，不影响照片归属。
 */
export const ALBUM_KINDS = ['general', 'normal', 'curated'] as const

export type AlbumKind = (typeof ALBUM_KINDS)[number]

/** 默认值：不区分。 */
export const DEFAULT_ALBUM_KIND: AlbumKind = 'general'

/** 策展页收录的类型：不区分 + 策展。 */
export const CURATED_PAGE_KINDS: readonly AlbumKind[] = ['general', 'curated']

/**
 * 把任意字符串收敛成已知类型；未知值按默认的「不区分」处理，
 * 这样以后新增类型不会把老客户端读崩。
 */
export function normalizeAlbumKind(value: string | null | undefined): AlbumKind {
  return (ALBUM_KINDS as readonly string[]).includes(value ?? '')
    ? (value as AlbumKind)
    : DEFAULT_ALBUM_KIND
}

/**
 * 相册 + 类型。
 *
 * 共享包 `@mo-gallery/api-client` 的 `AlbumDto` 暂未声明 `type`（要给 Desktop/App 同步镜像
 * 才会生效），所以 Web 侧用这个本地类型承接；`AlbumDto` 本身可直接赋给它（type 可选）。
 */
export type AlbumWithKind = AlbumDto & { type?: AlbumKind }

/** 读取相册类型，缺省/非法值都按「不区分」。 */
export function resolveAlbumKind(album: { type?: string | null } | null | undefined): AlbumKind {
  return normalizeAlbumKind(album?.type)
}
