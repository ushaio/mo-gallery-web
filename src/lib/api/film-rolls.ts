import { apiRequest, apiRequestData } from './core'
import type { FilmRollDto } from './types'

export interface FilmRollCreateInput {
  name: string
  brand: string
  iso: number
  frameCount: number
  notes?: string | null
  shootDate?: string | null
  endDate?: string | null
}

export type FilmRollUpdateInput = Partial<FilmRollCreateInput>

export async function getFilmRolls(): Promise<FilmRollDto[]> {
  return apiRequestData<FilmRollDto[]>('/api/film-rolls')
}

export async function getFilmRoll(id: string): Promise<FilmRollDto> {
  return apiRequestData<FilmRollDto>(`/api/film-rolls/${encodeURIComponent(id)}`)
}

export async function createFilmRoll(token: string, data: FilmRollCreateInput): Promise<FilmRollDto> {
  return apiRequestData<FilmRollDto>(
    '/api/admin/film-rolls',
    { method: 'POST', body: JSON.stringify(data) },
    token,
  )
}

export async function updateFilmRoll(token: string, id: string, data: FilmRollUpdateInput): Promise<FilmRollDto> {
  return apiRequestData<FilmRollDto>(
    `/api/admin/film-rolls/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(data) },
    token,
  )
}

export async function deleteFilmRoll(token: string, id: string): Promise<void> {
  await apiRequest(
    `/api/admin/film-rolls/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    token,
  )
}
