'use client'

import { memo, useState } from 'react'

import type { PhotoSiteMetadata, SiteAlbum } from '@mo-gallery/content-core'
import type { MediaUrlResolver } from '../adapters'
import type { PublicSiteLabels } from '../labels'
import { PhotoCard } from './PhotoCard'
import { Lightbox } from './Lightbox'

/**
 * 相册视图：AlbumList（相册卡片网格）与 AlbumDetail（相册内照片 + 灯箱）。
 * 相册封面由宿主从 album.photoIds 解析后经 coverPhoto 传入；缺失时渲染占位。
 * 卡片视觉对齐 web AlbumCard：rounded-sm bg-card + 柔和阴影、aspect-video 封面、
 * hover 上浮 4px + 封面 1.05 缩放 + 照片数毛玻璃胶囊。
 */

interface AlbumListProps {
  albums: SiteAlbum[]
  /** 每个相册的封面照片（按 album.id 索引；可部分缺失）。 */
  covers?: Record<string, PhotoSiteMetadata>
  resolver: MediaUrlResolver
  labels: PublicSiteLabels
  /** 相册详情链接（宿主经 LinkAdapter.album 生成）。 */
  albumHref: (album: SiteAlbum) => string
}

export const AlbumList = memo(function AlbumList({ albums, covers, resolver, labels, albumHref }: AlbumListProps) {
  if (albums.length === 0) {
    return <p className="py-24 text-center text-sm text-muted-foreground">{labels.emptyAlbums}</p>
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {albums.map((album, index) => {
        const cover = covers?.[album.id]
        let coverUrl = ''
        if (cover) {
          try {
            coverUrl = resolver.photoThumbnail(cover)
          } catch {
            coverUrl = ''
          }
        }
        return (
          <a
            key={album.id}
            href={albumHref(album)}
            className="psw-enter group block cursor-pointer overflow-hidden rounded-sm bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md focus:outline-none focus:ring-1 focus:ring-primary/40"
            style={{ animationDelay: `${Math.min(index, 12) * 0.05}s` }}
          >
            <div className="relative aspect-video overflow-hidden bg-muted">
              {coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverUrl}
                  alt={album.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-[400ms] ease-out group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-serif text-4xl text-muted-foreground/30">
                  {album.title.charAt(0)}
                </div>
              )}
              {/* 照片数毛玻璃胶囊（web AlbumCard 同款） */}
              <div className="absolute bottom-2 right-2 rounded-full border border-border/30 bg-background/80 px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-foreground backdrop-blur-sm">
                {album.photoIds.length}
              </div>
            </div>
            <div className="space-y-1 p-3 md:p-4">
              <h3 className="line-clamp-1 text-sm font-medium tracking-wide text-foreground">{album.title}</h3>
              {album.description ? (
                <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{album.description}</p>
              ) : null}
            </div>
          </a>
        )
      })}
    </div>
  )
})

interface AlbumDetailProps {
  album: SiteAlbum
  /** 相册内的已发布照片（宿主按 album.photoIds 顺序解析传入）。 */
  photos: PhotoSiteMetadata[]
  resolver: MediaUrlResolver
  labels: PublicSiteLabels
  grayscale?: boolean
  /** 详情页顶部返回链接（相册列表页）。 */
  backHref?: string
}

export const AlbumDetail = memo(function AlbumDetail({
  album,
  photos,
  resolver,
  labels,
  grayscale = false,
  backHref,
}: AlbumDetailProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  return (
    <div>
      {backHref ? (
        <a
          href={backHref}
          className="mb-6 inline-block text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          ← {labels.back}
        </a>
      ) : null}
      <header className="mb-8">
        <h1 className="font-serif text-3xl font-light tracking-tight md:text-4xl">{album.title}</h1>
        {album.description ? (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{album.description}</p>
        ) : null}
        <p className="mt-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground/60">
          {photos.length} {labels.albumPhotoCountSuffix}
        </p>
      </header>

      {photos.length === 0 ? (
        <p className="py-24 text-center text-sm text-muted-foreground">{labels.emptyPhotos}</p>
      ) : (
        <>
          <div className="columns-2 gap-2 sm:gap-4 md:columns-3 lg:columns-4">
            {photos.map((photo, index) => (
              <div key={photo.id} className="mb-2 break-inside-avoid sm:mb-4">
                <PhotoCard photo={photo} grayscale={grayscale} resolver={resolver} onPhotoClick={() => setLightboxIndex(index)} />
              </div>
            ))}
          </div>
          <Lightbox
            photos={photos}
            index={lightboxIndex}
            resolver={resolver}
            labels={labels}
            onClose={() => setLightboxIndex(null)}
            onNavigate={setLightboxIndex}
          />
        </>
      )}
    </div>
  )
})
