import type { FilmFormat } from '@/lib/film-presets'

export type ViewMode = 'grid' | 'list'
export type DetailTab = 'overview' | 'photos'
export type PhotoTypeFilter = 'all' | 'digital' | 'film'

export interface PhotoDTO {
  id: string
  title: string
  url: string
  thumbnailUrl?: string
  category?: string
  photoType?: 'digital' | 'film'
  filmRollId?: string | null
}

export interface FilmPhotoDTO {
  id: string
  filmRollId: string
  photoId: string
  frameNumber: number
  createdAt?: string
  photo?: PhotoDTO
}

export interface FilmRollDTO {
  id: string
  name: string
  brand: string
  format?: FilmFormat
  iso: number
  frameCount: number
  notes?: string | null
  shootDate?: string | null
  endDate?: string | null
  createdAt: string
  updatedAt: string
  photoCount?: number
  filmPhotos?: FilmPhotoDTO[]
}

export interface FilmRollPayload {
  name: string
  brand: string
  format: FilmFormat
  iso: number
  frameCount: number
  notes?: string | null
  shootDate?: string | null
  endDate?: string | null
}

export interface WailsAppAPI {
  GetFilmRolls(): Promise<FilmRollDTO[]>
  GetFilmRoll(id: string): Promise<FilmRollDTO>
  CreateFilmRoll(params: FilmRollPayload): Promise<FilmRollDTO>
  UpdateFilmRoll(id: string, params: Partial<FilmRollPayload>): Promise<FilmRollDTO>
  DeleteFilmRoll(id: string): Promise<void>
  AddPhotosToFilmRoll(id: string, photoIds: string[]): Promise<FilmRollDTO>
  RemovePhotoFromFilmRoll(rollId: string, photoId: string): Promise<FilmRollDTO>
  ReorderFilmRollFrames(id: string): Promise<FilmRollDTO>
  SetFilmRollFrameOrder(id: string, filmPhotoIds: string[]): Promise<FilmRollDTO>
  GetAllPhotos(): Promise<PhotoDTO[]>
}

declare global {
  interface Window {
    go?: { main?: { App?: WailsAppAPI } }
  }
}
