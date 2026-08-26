import type { CSSProperties } from 'react'

import { resolveAssetUrl } from '@/lib/api'
import type { Album, Photo } from '@/types'

export type DetailTab = 'overview' | 'photos'

export interface AlbumPayload {
  name: string
  description?: string
  coverUrl?: string
  location?: string
  isPublished: boolean
  sortOrder: number
}

export interface AlbumAppAPI {
  GetAlbums(): Promise<Album[]>
  GetAlbum(id: string): Promise<Album>
  CreateAlbum(params: AlbumPayload): Promise<Album>
  UpdateAlbum(id: string, params: Partial<AlbumPayload>): Promise<Album>
  DeleteAlbum(id: string): Promise<void>
  AddPhotosToAlbum(id: string, photoIds: string[]): Promise<Album>
  RemovePhotoFromAlbum(albumId: string, photoId: string): Promise<Album>
  SetAlbumCover(albumId: string, photoId: string): Promise<Album>
  GetAllPhotos(): Promise<Photo[]>
}

export function appApi(): AlbumAppAPI {
  const bridge = (window as unknown as { go?: { main?: { App?: AlbumAppAPI } } }).go?.main?.App
  if (!bridge) throw new Error('Wails API is not available')
  return bridge
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function inputStyle(): CSSProperties {
  return {
    borderColor: 'var(--border)',
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)',
  }
}

export function normalizeAlbum(album: Album): Album {
  const photos = album.photos ?? []
  return {
    ...album,
    description: album.description ?? '',
    coverUrl: album.coverUrl ?? '',
    location: album.location ?? '',
    photos,
    photoCount: album.photoCount ?? photos.length,
  }
}

export function newDraftAlbum(sortOrder: number): Album {
  const now = new Date().toISOString()
  return {
    id: '',
    name: '',
    description: '',
    coverUrl: '',
    location: '',
    isPublished: false,
    sortOrder,
    photoCount: 0,
    photos: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function isCoverPhoto(album: Album, photo: Photo) {
  if (!album.coverUrl) return false
  const coverUrl = resolveAssetUrl(album.coverUrl)
  return [photo.url, photo.thumbnailUrl]
    .filter((url): url is string => Boolean(url))
    .some(url => resolveAssetUrl(url) === coverUrl)
}
